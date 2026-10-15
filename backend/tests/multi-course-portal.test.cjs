const assert=require('node:assert/strict');
const {test}=require('node:test');
let calls=[];
const enrollments=[{id:'auto',course_name:'Auto'},{id:'moto',course_name:'Moto'}];
const db={query:async(sql,values)=>{
 calls.push({sql,values});
 if(sql.startsWith('SELECT s.*,b.name'))return {rows:[{id:'student',first_name:'Alumno',last_name:'Prueba',branch_name:'Sucursal'}]};
 if(sql.startsWith('SELECT e.id,e.course_id'))return {rows:enrollments};
 if(sql.startsWith('SELECT e.*,c.name'))return {rows:[enrollments.find(row=>row.id===(values[1] || 'auto'))]};
 if(sql.startsWith('SELECT p.total'))return {rows:[{balance:values[0]==='moto'?125:90}]};
 return {rows:[]};
}};
const path=require.resolve('../config/database');require.cache[path]={id:path,filename:path,loaded:true,exports:db};
const Portal=require('../services/StudentPortalService');
test('portal consulta el curso elegido y sus pagos',async()=>{
 calls=[];const summary=await Portal.summary('account','moto');
 assert.equal(summary.enrollment.id,'moto');assert.equal(summary.payment.balance,125);assert.equal(summary.enrollments.length,2);
 assert(calls.some(call=>call.sql.startsWith('SELECT p.total') && call.sql.includes('tv.enrollment_id=$1') && call.values[0]==='moto'));
});
test('portal no permite seleccionar una matricula de otra persona',async()=>{
 await assert.rejects(Portal.summary('account','foreign'),/Matricula no encontrada/);
});
