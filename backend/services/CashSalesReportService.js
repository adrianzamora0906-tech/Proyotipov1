const db=require('../config/database');
const ExcelJS=require('exceljs');
const {createError}=require('../middleware/errorHandler');
const Audit=require('./AuditService');

class CashSalesReportService {
 static paymentMethods(row){
  const labels={efectivo:'Efectivo',tarjeta:'Tarjeta',transferencia:'Transferencia bancaria'};
  const methods=[...new Set((row.payment_methods||[]).map(method=>labels[String(method).toLowerCase()]||method))];
  if(row.pending_transfer)methods.push('Transferencia pendiente de confirmacion');
  return methods.join(' / ')||'Sin pagos confirmados';
 }
 static promotion(row){
  // La promocion declarada no depende del monto del abono ni de su redondeo.
  if(row.discount_benefit==='HALLOWEEN')return 'Promo Halloween';
  if(row.amount===null)return 'Sin cuenta de pago';
  if(Number(row.discount||0)<=0)return 'Sin promocion';
  const kind=/moto|clase\s*a/i.test(row.course)?'moto':/autom|clase\s*b/i.test(row.course)?'carro':null;
  const benefits={HALLOWEEN:{name:'Promo Halloween',moto:114.99,carro:164.99},COMBO:{name:'Combo',moto:115,carro:180},UNIVERSITY_STUDENT:{name:'Estudiante universitario',moto:117,carro:180},POLICE:{name:'Policia',moto:110,carro:170}};
  const benefit=benefits[row.discount_benefit];
  return benefit&&kind&&Math.round(Number(row.amount)*100)===Math.round(benefit[kind]*100)?benefit.name:'Descuento sin promocion identificada';
 }
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
  const result=await db.query(`SELECT e.id,s.identification,TRIM(CONCAT_WS(' ',s.first_name,s.last_name)) student_name,c.name course,b.name branch,
   p.final_amount amount,p.discount,s.discount_benefit,p.balance,CASE WHEN p.final_amount IS NULL THEN NULL ELSE p.final_amount-p.balance END paid,
   COALESCE(details.methods,'[]'::jsonb) payment_methods,
   EXISTS(SELECT 1 FROM transfer_payment_verifications tv
    WHERE tv.enrollment_id=e.id AND tv.service_transaction_id IS NULL
      AND tv.status IN ('PENDING','AWAITING_APPROVAL')) pending_transfer
   FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id
   JOIN branches b ON b.id=e.sales_branch_id
   LEFT JOIN LATERAL (SELECT id,final_amount,discount,balance FROM payments WHERE enrollment_id=e.id AND status<>'anulado' ORDER BY created_at DESC,id DESC LIMIT 1) p ON TRUE
   LEFT JOIN LATERAL (SELECT jsonb_agg(pd.payment_method ORDER BY pd.created_at,pd.id) methods
    FROM payment_details pd WHERE pd.payment_id=p.id AND pd.status='ACTIVE') details ON TRUE
   WHERE e.enrollment_date>=$1::date AND e.enrollment_date<($2::date+INTERVAL '1 day')
    AND ($3::uuid IS NULL OR e.sales_branch_id=$3 OR EXISTS (
      SELECT 1 FROM branches session_branch
      WHERE session_branch.id=$3 AND session_branch.city_id IS NOT NULL
        AND session_branch.city_id=b.city_id
    )) AND e.status NOT IN ('cancelado','inhabilitado') AND s.status<>'inhabilitado'
   ORDER BY e.enrollment_date,s.last_name,s.first_name,e.id`,[filters.from,filters.to,filters.branch]);
  const totals={sales:result.rows.length,paid:0,withoutAccount:0};
  for(const row of result.rows){if(row.amount===null)totals.withoutAccount++;totals.paid+=Math.round(Number(row.paid||0)*100);}
  totals.paid/=100;
  const rows=result.rows.map(row=>({id:row.id,identification:row.identification,student_name:row.student_name,branch:row.branch,course:row.course,paid:row.paid,
   payment_methods:this.paymentMethods(row),promotion:this.promotion(row)}));
  return {filters,rows,totals};
 }
 static async export(actor,auth,query,context){
  const report=await this.preview(actor,auth,query);
  const workbook=new ExcelJS.Workbook(),sheet=workbook.addWorksheet('Ventas');
  workbook.title=`Ventas ${report.filters.from} al ${report.filters.to}`;
  sheet.columns=[{header:'Cedula',key:'identification',width:16},{header:'Estudiante',key:'student_name',width:42},{header:'Sucursal',key:'branch',width:30},{header:'Curso',key:'course',width:28},{header:'Valor cancelado',key:'paid',width:20},{header:'Metodo de pago',key:'payment_methods',width:30},{header:'Promocion',key:'promotion',width:38}];
  sheet.getColumn('student_name').alignment={wrapText:true,vertical:'top'};
  report.rows.forEach(row=>sheet.addRow({...row,paid:row.paid===null?null:Number(row.paid)}));
  sheet.getColumn('payment_methods').alignment={wrapText:true,vertical:'top'};
  sheet.addRow({identification:'TOTAL',paid:report.totals.paid}).font={bold:true};
  sheet.getColumn('paid').numFmt='$0.00';
  sheet.getColumn('identification').numFmt='@';sheet.getRow(1).font={bold:true};sheet.views=[{state:'frozen',ySplit:1}];sheet.autoFilter='A1:G1';
  const buffer=await workbook.xlsx.writeBuffer();
  await Audit.log({userId:actor.id,role:actor.role,branchId:report.filters.branch,action:'CASH_SALES_EXPORT',module:'CAJA',entityType:'REPORT',metadata:{...report.filters,rows:report.rows.length},requestContext:context});
  return {buffer,filename:`ventas-${report.filters.from}-${report.filters.to}.xlsx`};
 }
}
module.exports=CashSalesReportService;
