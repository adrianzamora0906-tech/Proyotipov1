const test=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Instructor=require('../services/InstructorService');
test('El horario del instructor incluye practicas aunque no tenga ciclos normales',async()=>{
 const original={query:db.query,context:Instructor.getInstructorContext,agenda:Instructor.getAgenda};
 try{
  Instructor.getInstructorContext=async()=>({id:'teacher',first_name:'Instructor',last_name:'Prueba'});
  Instructor.getAgenda=async()=>({data:[]});
  db.query=async(sql,params)=>{
   if(sql.includes("'practice'::text row_type")){
    assert.deepEqual(params,['teacher']);
    assert(sql.includes("ap.status IN ('SCHEDULED','IN_PROGRESS')"));
    assert(sql.includes("s.status<>'inhabilitado'"));
    assert(sql.includes("America/Guayaquil"));
    return {rows:[{row_type:'practice',cycle_id:'practice:one',cycle_code:'Horas practicas',course_name:'Practicas adicionales',start_date:'2026-10-19',end_date:'2026-10-21',student_id:'student',student_name:'Estudiante Prueba',start_time:'08:00:00',end_time:'09:40:00',class_days:3}]};
   }
   return {rows:[]};
  };
  const result=await Instructor.getDashboard({id:'user',role:'instructor'});
  assert.equal(result.scheduleCourses.length,1);
  const group=result.scheduleCourses[0];
  assert.equal(group.isAdditionalPractice,true);
  assert.equal(group.students[0].status,'practica_adicional');
  assert.equal(group.students[0].startTime,'08:00');
  assert.equal(group.students[0].endTime,'09:40');
  assert.equal(group.students[0].classDays,3);
 }finally{db.query=original.query;Instructor.getInstructorContext=original.context;Instructor.getAgenda=original.agenda;}
});
