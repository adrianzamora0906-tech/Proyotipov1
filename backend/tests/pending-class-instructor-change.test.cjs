const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Cycles=require('../services/CourseCycleService');
const Sessions=require('../services/CycleInstructorAssignmentService');
const teacher='20857100-415d-4072-94cb-7ad8635d9dc3';
const source='309e656a-a0c0-4db2-a845-f86418fc806a';
const assignment='1d38db7a-1196-4db8-a69c-48657c00d2bc';
test('Reasigna una clase pendiente a otro instructor conservando fecha y hora; bloquea realizadas',async()=>{
 const old={getClient:db.getClient,instructors:Cycles.scheduleChangeInstructors,sync:Sessions.reconcilePracticalSessions};
 let started=false,inserted=false,rollback=false,missingPending=false;
 const sqls=[];
 const client={release(){},async query(sql,params){
  sqls.push(sql);
  if(sql.includes('FOR UPDATE OF a'))return {rows:missingPending?[{id:assignment},{id:source}]:[{id:assignment}]};
  if(sql.includes('SELECT cc.*')&&sql.includes('FOR UPDATE'))return {rows:[{id:'cycle',branch_id:null,course_id:'course',vehicle_type:'moto',modality:'normal',start_date:'2099-06-01',end_date:'2099-06-05',duration_business_days:5}]};
  if(sql.includes('AS slot_capacity'))return {rows:[{slot_capacity:1}]};
  if(sql.includes('SELECT id, enrollment_id, instructor_id'))return {rows:[{id:assignment,enrollment_id:'enrollment',instructor_id:source,schedule_date:'2099-06-01',start_time:'08:00',end_time:'09:40'}]};
  if(sql.includes('SELECT 1 FROM practical_sessions')&&sql.includes("status NOT IN ('PROGRAMADA'"))return {rows:started?[{}]:[]};
  if(sql.includes('COUNT(*)::int'))return {rows:[{total:0,occupied:0}]};
  if(sql.includes('INSERT INTO course_cycle_schedule_assignments')){assert.equal(params[6],teacher);inserted=true;return {rows:[{id:'new-assignment',enrollment_id:'enrollment',instructor_id:teacher}]};}
  if(sql.includes('INSERT INTO instructor_change_feedback'))return {rows:[{id:'feedback'}]};
  if(sql==='ROLLBACK')rollback=true;
  return {rows:[]};
 }};
 try{
  db.getClient=async()=>client;Cycles.scheduleChangeInstructors=async()=>[{id:teacher,name:'Nuevo instructor'}];Sessions.reconcilePracticalSessions=async()=>{};
  const data={studentId:'student',cycleId:'cycle',instructorId:teacher,observation:'Cambio solicitado',changes:[{assignmentId:assignment,date:'2099-06-01',time:'08:00 - 09:40'}]};
  const rows=await Cycles.changeStudentScheduleDays({id:teacher},data);
  assert(inserted);assert.equal(rows.length,1);
  assert(!sqls.some(sql=>/UPDATE payments|DELETE FROM practical_sessions|UPDATE practical_sessions/.test(sql)));
  await Cycles.changeStudentScheduleDays({id:teacher},{...data,replaceAllPending:true});
  missingPending=true;inserted=false;
  await assert.rejects(()=>Cycles.changeStudentScheduleDays({id:teacher},{...data,replaceAllPending:true}),/pendientes cambiaron/);
  assert(!inserted);missingPending=false;
  started=true;inserted=false;
  await assert.rejects(()=>Cycles.changeStudentScheduleDays({id:teacher},data),/iniciada o realizada/);
  assert(!inserted);assert(rollback);
  Cycles.scheduleChangeInstructors=async()=>[];
  await assert.rejects(()=>Cycles.changeStudentScheduleDays({id:teacher},data),/Instructor no disponible/);
 }finally{db.getClient=old.getClient;Cycles.scheduleChangeInstructors=old.instructors;Sessions.reconcilePracticalSessions=old.sync;await db.pool.end();}
});
