const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Feedback=require('../services/InstructorChangeFeedbackService');
const id='20857100-415d-4072-94cb-7ad8635d9dc3';
test('Respuestas privadas: solo participante, una vez, sin textos en auditoria',async()=>{
 const original=db.getClient;const statements=[];
 let row={id,student_id:'student',previous_instructor_user_id:'teacher',branch_id:'branch',student_response:null,instructor_response:null,current_student:'student'};
 const client={release(){},async query(sql,params){statements.push({sql,params});return {rows:sql.includes('SELECT f.*,u.student_id')?[row]:[]};}};
 db.getClient=async()=>client;
 try{
  await Feedback.respond(id,'Solicite el cambio por incompatibilidad de horarios.',{id:'student-user'});
  assert(statements.some(s=>s.sql.includes('SET student_response')));
  const audit=statements.find(s=>s.sql.includes('INSERT INTO audit_logs'));
  assert(audit);assert(!JSON.stringify(audit.params).includes('incompatibilidad'));
  row={...row,current_student:null};
  await assert.rejects(()=>Feedback.respond(id,'No soy participante del seguimiento.',{id:'stranger'}),/No puedes responder/);
  row={...row,current_student:'student',student_response:'Respuesta anterior'};
  await assert.rejects(()=>Feedback.respond(id,'Intento reemplazar la respuesta anterior.',{id:'student-user'}),/ya fue enviado/);
  row={...row,current_student:null,instructor_response:null};
  await Feedback.respond(id,'Registro mi version como instructor anterior.',{id:'teacher'});
  assert(statements.some(s=>s.sql.includes('SET instructor_response')));
  assert.throws(()=>Feedback.assertAdmin({roles:['INSTRUCTOR']}),/Solo administracion/);
  assert.throws(()=>Feedback.assertAdmin({roles:['STUDENT']}),/Solo administracion/);
  assert.throws(()=>Feedback.assertAdmin({roles:['SECRETARY']}),/Solo administracion/);
 }finally{db.getClient=original;await db.pool.end();}
});
test('No crear seguimiento si solo cambia horario, y agrupar clases por cambio de instructor',async()=>{
 const calls=[];const client={async query(sql,params){calls.push({sql,params});return {rows:sql.includes('INSERT INTO instructor_change_feedback')?[{id}]:[]};}};
 const same={studentId:'s',enrollmentId:'e',branchId:'b',previousInstructorId:'old',newInstructorId:'old',assignmentId:'a'};
 await Feedback.create([same],{id:'actor'},'Motivo',client);assert.equal(calls.length,0);
 await Feedback.create([{...same,newInstructorId:'new'},{...same,newInstructorId:'new',assignmentId:'b'}],{id:'actor'},'Motivo',client);
 const creates=calls.filter(c=>c.sql.includes('INSERT INTO instructor_change_feedback'));
 assert.equal(creates.length,1);assert.deepEqual(JSON.parse(creates[0].params[7]),['a','b']);
});
