const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Reports=require('../services/ReportService');

test('Ventas usa sucursal persistida, conserva alcance y oculta importes fuera de Gerencia',async()=>{
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{calls.push({sql,args});
  if(sql.includes('::int sales'))return {rows:[{sales:1,enrollments:2,collected:190}]};
  if(sql.includes('academic.name academic_branch'))return {rows:[{name:'Alumno',branch:'Venta',academic_branch:'Formacion',amount:190,balance:25}]};
  return {rows:[]};
 };
 try{
  const result=await Reports.universal({global:false,branchId:'authorized',roles:[]},{type:'sales',branchId:'untrusted',courseType:'moto',dateFrom:'2026-10-01',dateTo:'2026-10-21'});
  assert.equal(result.summary.sales,1);assert.equal(result.summary.enrollments,2);
  assert(!('collected' in result.summary));assert(!('amount' in result.rows[0]));assert(!('balance' in result.rows[0]));
  const query=calls.find(x=>x.sql.includes('academic.name academic_branch'));
  assert.equal(query.args[0],'authorized');assert.equal(query.args[6],'moto');
  assert.match(query.sql,/b.id=e.sales_branch_id/);assert.match(query.sql,/academic.id=e.branch_id/);
  assert.match(query.sql,/INTERVAL '1 day'/);assert.match(query.sql,/LIMIT 1/);
  assert(!query.sql.includes('ru.branch_id'));
 }finally{db.query=original;}
});

test('Gerencia conserva importes en Ventas y Matriculas conserva sucursal academica',async()=>{
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{calls.push(sql);return {rows:sql.includes('::int sales')?[{sales:1,enrollments:1}]:sql.includes('SELECT s.identification')?[{amount:190,balance:25}]:[]};};
 try{
  const filters={type:'sales',dateFrom:'2026-10-01',dateTo:'2026-10-21'};
  const result=await Reports.universal({global:true,roles:['GENERAL_MANAGER']},filters);
  assert.equal(result.rows[0].amount,190);
  await Reports.universal({global:true,roles:['GENERAL_MANAGER']},{...filters,type:'enrollments'});
  assert(calls.some(sql=>sql.includes('WHERE e.enrollment_date BETWEEN')&&sql.includes('b.id=e.branch_id')));
 }finally{db.query=original;}
});

test('Captura SQL: la sucursal de venta no sigue cambios academicos posteriores',{skip:process.env.SALES_REPORT_DB_TEST!=='1'},async()=>{
 const c=await db.getClient();
 try{
  await c.query('BEGIN');
  await c.query('CREATE TEMP TABLE sales_capture_test(id int,branch_id uuid,sales_branch_id uuid,sales_branch_source text) ON COMMIT DROP');
  await c.query('CREATE TRIGGER sales_capture_test BEFORE INSERT ON sales_capture_test FOR EACH ROW EXECUTE FUNCTION capture_enrollment_sales_branch()');
  const first='00000000-0000-0000-0000-000000000001',second='00000000-0000-0000-0000-000000000002';
  await c.query('INSERT INTO sales_capture_test(id,branch_id) VALUES(1,$1)',[first]);
  await c.query('UPDATE sales_capture_test SET branch_id=$1 WHERE id=1',[second]);
  const row=(await c.query('SELECT * FROM sales_capture_test WHERE id=1')).rows[0];
  assert.equal(row.branch_id,second);assert.equal(row.sales_branch_id,first);assert.equal(row.sales_branch_source,'registration_branch');
  await c.query('INSERT INTO sales_capture_test(id,branch_id,sales_branch_id,sales_branch_source) VALUES(2,$1,$2,$3)',[second,first,'explicit']);
  assert.equal((await c.query('SELECT sales_branch_id FROM sales_capture_test WHERE id=2')).rows[0].sales_branch_id,first);
 }finally{await c.query('ROLLBACK');c.release();await db.pool.end();}
});
