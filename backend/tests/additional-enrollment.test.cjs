const assert=require('node:assert/strict');
const {test}=require('node:test');
const dbPath=require.resolve('../config/database');
let fixture,queryOverride;
const db={getClient:async()=>fixture.client,query:(...args)=>queryOverride(...args)};
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:db};
const RealCycles=require('../services/CourseCycleService');
const cyclesPath=require.resolve('../services/CourseCycleService');
const cycles={enrollmentBranchForCycle:async()=> 'branch',reserveSchedule:async(actor,data)=>{
  fixture.reserved=data;
  if(fixture.conflict)throw new Error('Cupo ocupado');
  return {instructor:{id:'teacher',name:'Instructor'}};
}};
require.cache[cyclesPath].exports=cycles;
for(const [name,exports] of [['CashOperationsService',{createTransfer:async data=>{fixture.transfer=data;}}],['AuditService',{log:async data=>{fixture.audit=data;}}]]){
 const id=require.resolve(`../services/${name}`);require.cache[id]={id,filename:id,loaded:true,exports};
}
const Enrollment=require('../services/AdditionalEnrollmentService');
const Payments=require('../services/PaymentService');
const actor={id:'operator',branch_id:'branch',role:'secretaria_sucursal',permissions:['STUDENT_CREATE','SCHEDULE_ASSIGN']};
function setup(options={}){
 fixture={...options,calls:[],client:{release(){}}};
 fixture.client.query=async(sql,values)=>{
  fixture.calls.push({sql,values});
  if(sql.startsWith('SELECT * FROM students'))return {rows:[{id:'student',identification:'1234567890',status:fixture.disabled?'inhabilitado':'activo',branch_id:'branch'}]};
  if(sql.includes('SELECT 1 FROM students s'))return {rows:[{}]};
  if(sql.startsWith('SELECT 1 FROM enrollments'))return {rows:fixture.duplicate?[{}]:[]};
  if(sql.includes('FROM transfer_payment_verifications'))return {rows:fixture.unlinked?[{}]:[]};
  if(sql.startsWith('SELECT c.id,c.name'))return {rows:[{id:'moto',name:'Clase A - Moto',price:'125.00'}]};
  if(sql.startsWith('SELECT id,branch_id,course_id,modality FROM course_cycles'))return {rows:[{id:'cycle',branch_id:'branch',course_id:'moto',modality:'normal'}]};
  if(sql.startsWith('INSERT INTO enrollments'))return {rows:[{id:'second-enrollment'}]};
  return {rows:[]};
 };
 return {identification:'1234567890',course_id:'moto',branch_id:'branch',schedulePlan:{preferredInstructorId:'teacher',selections:[{date:'2026-10-19',time:'08:00 - 09:40',cycleId:'cycle'}]}};
}
test('crea segunda matricula sin insertar ni modificar estudiante, cuenta o curso anterior',async()=>{
 const data=setup();const result=await Enrollment.create('student',data,actor,{});
 assert.equal(result.id,'student');assert.equal(result.enrollment_id,'second-enrollment');assert(result.scheduleReserved);
 assert.equal(fixture.reserved.enrollmentId,'second-enrollment');
 assert(fixture.calls.some(c=>c.sql.startsWith('INSERT INTO payments') && c.values[0]==='second-enrollment'));
 assert(!fixture.calls.some(c=>/^(INSERT INTO|UPDATE) (students|users)\b/.test(c.sql)));
 assert(fixture.calls.some(c=>c.sql==='COMMIT'));
 assert.equal(fixture.audit.entityId,'second-enrollment');
});
test('mismo curso vigente bloqueado antes de insertar',async()=>{
 const data=setup({duplicate:true});await assert.rejects(Enrollment.create('student',data,actor,{}),/mismo curso/);
 assert(!fixture.calls.some(c=>c.sql.startsWith('INSERT')));assert(fixture.calls.some(c=>c.sql==='ROLLBACK'));
});
test('revierte la matricula completa si el horario falla',async()=>{
 const data=setup({conflict:true});await assert.rejects(Enrollment.create('student',data,actor,{}),/Cupo ocupado/);
 assert(fixture.calls.some(c=>c.sql==='ROLLBACK'));assert(!fixture.calls.some(c=>c.sql==='COMMIT'));
});
test('bloquea inhabilitados y transferencias antiguas ambiguas',async()=>{
 let data=setup({disabled:true});await assert.rejects(Enrollment.create('student',data,actor,{}),/Habilita/);
 data=setup({unlinked:true});await assert.rejects(Enrollment.create('student',data,actor,{}),/transferencias pendientes/);
});
test('crear exige permiso de matricula y de horario',async()=>{
 const data=setup();await assert.rejects(Enrollment.create('student',data,{...actor,permissions:['STUDENT_CREATE']},{}),/permiso/);
});
test('el convenio y descuento se calculan por el nuevo curso',()=>{
 assert.equal(Enrollment.price({name:'Clase A - Moto',price:125},{discountBenefit:'POLICE'},false).discount,15);
 assert.throws(()=>Enrollment.price({name:'Clase B - Automovil',price:190},{discount:30},true),/Descuento/);
 assert.throws(()=>Enrollment.price({name:'Clase A - Moto',price:125},{discount:5},false),/permiso/);
});
test('saldo agregado y saldo especifico no mezclan transferencias entre cursos',async()=>{
 queryOverride=async(sql,values)=>{
  if(sql.includes('SELECT e.id,c.name'))return {rows:[{id:'auto',course:'Auto'},{id:'moto',course:'Moto'}].filter(e=>!values[1]||e.id===values[1])};
  if(sql.includes('DISTINCT ON'))return {rows:[{enrollment_id:'auto',total:190,final_amount:190,balance:90},{enrollment_id:'moto',total:125,final_amount:125,balance:125}].filter(e=>values[0].includes(e.enrollment_id))};
  if(sql.includes('FROM transfer_payment_verifications'))return {rows:[{enrollment_id:'moto',amount:25}].filter(e=>!values[1]||e.enrollment_id===values[1])};
  throw new Error(sql);
 };
 const combined=await Payments.getStudentBalance('student');assert.equal(combined.balance,215);assert.equal(combined.paid,100);
 assert.equal(combined.enrollments[0].pendingVerification,0);assert.equal(combined.enrollments[1].pendingVerification,25);
 const auto=await Payments.getStudentBalance('student','auto');assert.equal(auto.balance,90);assert.equal(auto.pendingVerification,0);
});
test('cobro sin matricula explicita se rechaza si hay dos cursos',async()=>{
 setup();fixture.client.query=async(sql)=>{fixture.calls.push({sql});return {rows:sql.includes('SELECT s.*, e.id')?[{id:'student'},{id:'student'}]:[]};};
 await assert.rejects(Payments.registerPayment({cedula:'1234567890',amount:10,method:'efectivo'}),/Selecciona la matricula/);
 assert(!fixture.calls.some(c=>c.sql.startsWith('INSERT')));
});
test('cruce entre cursos bloqueado y la misma matricula queda excluida',async()=>{
 let checked=false;
 const client={query:async(sql,values)=>{checked=sql.includes('a.enrollment_id<>$2') && values[1]==='new';return {rows:[{}]};}};
 await assert.rejects(RealCycles.validateStudentCourseOverlap(client,'student','new',[{date:'2026-10-19',time:'08:00 - 09:40'}]),/otro curso/);
 assert(checked);
});
