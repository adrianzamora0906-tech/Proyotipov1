const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Report=require('../services/CashSalesReportService');
const ExcelJS=require('exceljs');
after(()=>db.pool.end());
test('Fechas y alcance de caja fallan cerrados',()=>{
 const auth={permissions:['PAYMENT_VIEW'],branchId:'branch'};
 assert.throws(()=>Report.filters({},auth,{from:'2026-02-30',to:'2026-03-01'}),/validos/);
 assert.throws(()=>Report.filters({},auth,{from:'2026-10-29',to:'2026-10-28'}),/validos/);
 assert.throws(()=>Report.filters({},{permissions:['PAYMENT_VIEW']},{from:'2026-10-28',to:'2026-10-28'}),/Sucursal/);
 assert.throws(()=>Report.filters({},null,{}),/permiso/);
 assert.equal(Report.filters({},auth,{from:'2026-10-28',to:'2026-10-28',branchId:'other'}).branch,'branch');
 assert.equal(Report.filters({},{...auth,operationalCoverage:{operational_branch_id:'coverage'}},{from:'2026-10-28',to:'2026-10-28'}).branch,'coverage');
});
test('Consulta real de solo lectura y Excel completo',async()=>{
 const query={from:'2026-10-01',to:'2026-10-28'},auth={permissions:['PAYMENT_VIEW'],global:true};
 const report=await Report.preview({},auth,query);
 assert.equal(report.totals.sales,report.rows.length);
 assert.equal(new Set(report.rows.map(r=>r.id)).size,report.rows.length);
 const Audit=require('../services/AuditService'),log=Audit.log;
 let audited=false;Audit.log=async()=>{audited=true;};
 try{
  const file=await Report.export({},auth,query,{}),book=new ExcelJS.Workbook();await book.xlsx.load(file.buffer);
  assert.equal(book.getWorksheet('Ventas').rowCount,report.rows.length+2);
  assert.equal(book.getWorksheet('Ventas').getColumn('B').numFmt,'@');assert(audited);
  assert.equal(book.getWorksheet('Ventas').getRow(1).getCell(10).value,'Metodo de pago (por abono)');
  assert.equal(book.getWorksheet('Ventas').getRow(1).getCell(11).value,'Pago registrado por (por abono)');
  assert.equal(book.getWorksheet('Detalle de abonos').rowCount,1+report.rows.reduce((sum,row)=>sum+row.payment_details.length,0));
  for(const row of report.rows){for(const [index,payment] of row.payment_details.entries()){
   assert(row.payment_methods.includes(`${index+1}. ${payment.method} ($${Number(payment.amount).toFixed(2)})`));
   assert(row.payment_registered_by.includes(`${index+1}. ${payment.registered_by}`));
  }}
  console.log(`${report.rows.length} ventas consultadas; ninguna escritura operativa.`);
 }finally{Audit.log=log;}
});
