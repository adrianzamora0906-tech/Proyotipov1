const db=require('../config/database');
const ExcelJS=require('exceljs');
const {createError}=require('../middleware/errorHandler');
const Audit=require('./AuditService');

class CashSalesReportService {
 static filters(actor,auth,query){
  if(!auth?.permissions?.includes('PAYMENT_VIEW'))throw createError(403,'Sin permiso de Caja');
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
  const {from,to}=query;
  if(!valid(from)||!valid(to)||to<from||Date.parse(to)-Date.parse(from)>366*86400000)throw createError(422,'Selecciona Desde y Hasta validos, hasta 366 dias');
  const branch=auth.global?null:auth.operationalCoverage?.operational_branch_id||auth.branchId||actor.branch_id;
  if(!auth.global&&!branch)throw createError(403,'Sucursal requerida');
  return {from,to,branch};
 }
 static async preview(actor,auth,query){
  const filters=this.filters(actor,auth,query);
  const result=await db.query(`SELECT e.id,to_char(e.enrollment_date,'YYYY-MM-DD') date,s.identification,
   TRIM(CONCAT(s.first_name,' ',s.last_name)) student,c.name course,b.name branch,
   COALESCE(NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),''),u.username,'Sin identificar') seller,
   p.final_amount amount,p.balance,CASE WHEN p.final_amount IS NULL THEN NULL ELSE p.final_amount-p.balance END paid,
   COALESCE(details.items,'[]'::jsonb) payment_details
   FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id
   JOIN branches b ON b.id=e.sales_branch_id LEFT JOIN users u ON u.id=COALESCE(e.sales_user_id,e.created_by)
   LEFT JOIN LATERAL (SELECT id,final_amount,balance FROM payments WHERE enrollment_id=e.id AND status<>'anulado' ORDER BY created_at DESC,id DESC LIMIT 1) p ON TRUE
   LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',pd.id,'date',to_char(pd.created_at,'YYYY-MM-DD HH24:MI'),
     'method',pd.payment_method,'amount',pd.amount,'registered_by',COALESCE(NULLIF(TRIM(CONCAT(collector.first_name,' ',collector.last_name)),''),collector.username,'Sin identificar')) ORDER BY pd.created_at,pd.id) items
    FROM payment_details pd LEFT JOIN users collector ON collector.id=pd.received_by WHERE pd.payment_id=p.id AND pd.status='ACTIVE') details ON TRUE
   WHERE e.enrollment_date>=$1::date AND e.enrollment_date<($2::date+INTERVAL '1 day')
    AND ($3::uuid IS NULL OR e.sales_branch_id=$3) AND e.status NOT IN ('cancelado','inhabilitado') AND s.status<>'inhabilitado'
   ORDER BY e.enrollment_date,s.last_name,s.first_name,e.id`,[filters.from,filters.to,filters.branch]);
  const totals={sales:result.rows.length,amount:0,paid:0,balance:0,withoutAccount:0};
  for(const row of result.rows){if(row.amount===null)totals.withoutAccount++;for(const field of ['amount','paid','balance'])totals[field]+=Math.round(Number(row[field]||0)*100);}
  for(const field of ['amount','paid','balance'])totals[field]/=100;
  const rows=result.rows.map(row=>({...row,payment_methods:row.payment_details.map((p,i)=>`${i+1}. ${p.method} ($${Number(p.amount).toFixed(2)})`).join('\n')||'Sin pagos confirmados',payment_registered_by:row.payment_details.map((p,i)=>`${i+1}. ${p.registered_by}`).join('\n')||'Sin pagos confirmados'}));
  return {filters,rows,totals};
 }
 static async export(actor,auth,query,context){
  const report=await this.preview(actor,auth,query);
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Ventas');
  sheet.columns=[{header:'Inscripcion',key:'date',width:14},{header:'Cedula',key:'identification',width:16},{header:'Estudiante',key:'student',width:40},{header:'Curso',key:'course',width:28},{header:'Sucursal de venta',key:'branch',width:30},{header:'Vendido por',key:'seller',width:35},{header:'Valor del curso',key:'amount',width:18},{header:'Abonos confirmados acumulados',key:'paid',width:25},{header:'Saldo actual',key:'balance',width:18}];
  sheet.columns=[...sheet.columns.map(column=>({header:column.header,key:column.key,width:column.width})),{header:'Metodo de pago (por abono)',key:'payment_methods',width:32},{header:'Pago registrado por (por abono)',key:'payment_registered_by',width:38}];
  report.rows.forEach(row=>sheet.addRow({...row,amount:row.amount===null?null:Number(row.amount),paid:row.paid===null?null:Number(row.paid),balance:row.balance===null?null:Number(row.balance)}));
  sheet.getColumn('payment_methods').alignment={wrapText:true,vertical:'top'};sheet.getColumn('payment_registered_by').alignment={wrapText:true,vertical:'top'};
  sheet.addRow({student:'TOTAL',amount:report.totals.amount,paid:report.totals.paid,balance:report.totals.balance}).font={bold:true};
  for(const key of ['amount','paid','balance'])sheet.getColumn(key).numFmt='$0.00';
  sheet.getColumn('identification').numFmt='@';sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:K1';
  const payments=workbook.addWorksheet('Detalle de abonos');
  payments.columns=[{header:'Fecha del pago',key:'date',width:20},{header:'Cedula',key:'identification',width:16},{header:'Estudiante',key:'student',width:40},{header:'Curso',key:'course',width:28},{header:'Metodo de pago',key:'method',width:22},{header:'Monto',key:'amount',width:16},{header:'Pago registrado por',key:'registered_by',width:38}];
  for(const row of report.rows)for(const payment of row.payment_details)payments.addRow({...payment,identification:row.identification,student:row.student,course:row.course,amount:Number(payment.amount)});
  payments.getColumn('identification').numFmt='@';payments.getColumn('amount').numFmt='$0.00';payments.getRow(1).font={bold:true};payments.views=[{state:'frozen',ySplit:1}];payments.autoFilter='A1:G1';
  const summary=workbook.addWorksheet('Resumen');summary.addRows([['SPORTMANCAR - VENTAS'],['Desde',report.filters.from],['Hasta',report.filters.to],['Ventas',report.totals.sales],['Sin cuenta de pago',report.totals.withoutAccount],['Criterio','Fecha de inscripcion; abonos acumulados y saldo al momento de exportar, no recaudacion del periodo']]);summary.getColumn(1).width=25;summary.getColumn(2).width=110;
  const buffer=await workbook.xlsx.writeBuffer();
  await Audit.log({userId:actor.id,role:actor.role,branchId:report.filters.branch,action:'CASH_SALES_EXPORT',module:'CAJA',entityType:'REPORT',metadata:{...report.filters,rows:report.rows.length},requestContext:context});
  return {buffer,filename:`ventas-${report.filters.from}-${report.filters.to}.xlsx`};
 }
}
module.exports=CashSalesReportService;
