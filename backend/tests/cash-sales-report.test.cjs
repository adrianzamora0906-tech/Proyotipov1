const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Report=require('../services/CashSalesReportService');
const ExcelJS=require('exceljs');
after(()=>db.pool.end());
test('Transferencias pendientes se identifican sin sustituir los metodos confirmados',()=>{
 assert.equal(Report.paymentMethods({payment_methods:[],pending_transfer:true}),'Transferencia pendiente de confirmacion');
 assert.equal(Report.paymentMethods({payment_methods:['efectivo'],pending_transfer:true}),'Efectivo / Transferencia pendiente de confirmacion');
 assert.equal(Report.paymentMethods({payment_methods:['transferencia'],pending_transfer:false}),'Transferencia bancaria');
 assert.equal(Report.paymentMethods({payment_methods:[],pending_transfer:false}),'Sin pagos confirmados');
});
test('Halloween conserva su etiqueta registrada aunque falte ajustar tarifa; no se infiere por abono',()=>{
 for(const [benefit,course,amount,discount,label] of [
  ['HALLOWEEN','Clase B - Automovil',164.99,25.01,'Promo Halloween'],
  ['HALLOWEEN','Clase A - Moto',114.99,10.01,'Promo Halloween'],
  ['COMBO','Clase A - Moto',115,10,'Combo'],
  ['UNIVERSITY_STUDENT','Clase B',180,10,'Estudiante universitario'],
  ['POLICE','Clase A',110,15,'Policia'],
  ['HALLOWEEN','Clase B',190,0,'Promo Halloween'],
  ['HALLOWEEN','Clase B',165,0,'Promo Halloween'],
  ['HALLOWEEN','Clase A',125,0,'Promo Halloween'],
  [null,'Clase B',164.99,25.01,'Descuento sin promocion identificada'],
  ['HALLOWEEN','Clase B',180,10,'Promo Halloween'],
  [null,'Clase B',null,null,'Sin cuenta de pago']
 ])assert.equal(Report.promotion({discount_benefit:benefit,course,amount,discount}),label);
});
test('Fechas y alcance de caja fallan cerrados',()=>{
 const auth={permissions:['PAYMENT_VIEW'],branchId:'branch'};
 assert.throws(()=>Report.filters({},auth,{from:'2026-02-30',to:'2026-03-01'}),/validos/);
 assert.throws(()=>Report.filters({},auth,{from:'2026-10-29',to:'2026-10-28'}),/validos/);
 assert.throws(()=>Report.filters({},{permissions:['PAYMENT_VIEW']},{from:'2026-10-28',to:'2026-10-28'}),/Sucursal/);
 assert.throws(()=>Report.filters({},null,{}),/permiso/);
 assert.equal(Report.filters({},auth,{from:'2026-10-28',to:'2026-10-28',branchId:'other'}).branch,'branch');
 assert.equal(Report.filters({},{...auth,operationalCoverage:{operational_branch_id:'coverage'}},{from:'2026-10-28',to:'2026-10-28'}).branch,'coverage');
});
test('Caja consulta las sucursales del mismo canton sin incluir otros cantones',async()=>{
 const branch=(await db.query("SELECT id,city_id FROM branches WHERE name ILIKE '%Shopping%' LIMIT 1")).rows[0];
 assert(branch?.city_id);
 const query={from:'2026-10-01',to:'2026-10-30'};
 const report=await Report.preview({branch_id:branch.id},{permissions:['PAYMENT_VIEW'],branchId:branch.id},query);
 const expected=(await db.query(`SELECT COUNT(*)::int count,COUNT(DISTINCT b.id)::int branches
  FROM enrollments e JOIN students s ON s.id=e.student_id JOIN branches b ON b.id=e.sales_branch_id
  JOIN courses c ON c.id=e.course_id
  WHERE (b.id=$1 OR b.city_id=$2) AND e.enrollment_date>=$3::date AND e.enrollment_date<($4::date+INTERVAL '1 day')
    AND e.status NOT IN ('cancelado','inhabilitado') AND s.status<>'inhabilitado'`,[branch.id,branch.city_id,query.from,query.to])).rows[0];
 assert.equal(report.rows.length,expected.count);
 assert(expected.branches>1);
 const allowed=new Set((await db.query('SELECT name FROM branches WHERE id=$1 OR city_id=$2',[branch.id,branch.city_id])).rows.map(row=>row.name));
 assert(report.rows.every(row=>allowed.has(row.branch)));
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
  const sheet=book.getWorksheet('Ventas');
  assert.equal(sheet.getColumn('A').numFmt,'@');assert(audited);
  assert.equal(book.worksheets.length,1);
  assert.equal(sheet.columnCount,7);
  assert.deepEqual(sheet.getRow(1).values.slice(1),['Cedula','Estudiante','Sucursal','Curso','Valor cancelado','Metodo de pago','Promocion']);
  assert.equal(sheet.getColumn('E').numFmt,'$0.00');
  assert.equal(sheet.getRow(sheet.rowCount).getCell(5).value,report.totals.paid);
  assert(report.rows.every(row=>typeof row.promotion==='string'));
  for(const [index,row] of report.rows.entries()){
   assert.deepEqual(Object.keys(row).sort(),['id','identification','student_name','branch','course','paid','payment_methods','promotion'].sort());
   assert.equal(sheet.getRow(index+2).getCell(1).value,row.identification);
   assert(row.student_name.trim().length>0);
   assert.equal(sheet.getRow(index+2).getCell(2).value,row.student_name);
   assert.equal(sheet.getRow(index+2).getCell(5).value,row.paid===null?null:Number(row.paid));
   assert.equal(sheet.getRow(index+2).getCell(6).value,row.payment_methods);
  }
  console.log(`${report.rows.length} ventas consultadas; ninguna escritura operativa.`);
 }finally{Audit.log=log;}
});
