const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../config/database');
const Service=require('../services/ManagerDashboardService');
const ctes=require('../services/InstructorReportActivities');
const ExcelJS=require('exceljs');

test('Excel includes additional practices and separates planned from completed hours',async()=>{
 const original=Service.instructorStudents;
 Service.instructorStudents=async()=>({instructor:{name:'Instructor'},data:[{
  identification:'0012345678',name:'Alumno de practicas',course_name:'Horas practicas',
  activity_type:'ADDITIONAL_PRACTICE',classes:3,exams:0,attended:1,hours:1.67,scheduled_hours:5,
  schedule_time:'16:00 - 17:40',class_dates:'15/10/2026, 16/10/2026, 17/10/2026'
 }]});
 try{
  const result=await Service.exportInstructorStudents({},{});
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(result.buffer);
  const sheet=workbook.worksheets[0];
  assert.equal(sheet.getCell('L5').value,'Horas practicas');
  assert.equal(sheet.getCell('I5').value,1.67);
  assert.equal(sheet.getCell('M4').value,'Horas programadas');
  assert.equal(sheet.getCell('M5').value,5);
  assert.equal(sheet.getCell('A5').value,'0012345678');
 }finally{Service.instructorStudents=original;}
});

test('Instructor detail includes exams, scopes both sources and orders before pagination',async()=>{
 const original=db.query,calls=[];
 db.query=async(sql,args)=>{calls.push({sql,args});return {rows:sql.includes('COUNT(*) OVER()')?[{id:'s',activity_type:'EXAM_ONLY',classes:0,exams:1,schedule_time:'18:30 - 18:50',total:1}]:[]};};
 try{
  const r=await Service.instructorStudents({global:false,branchId:'authorized',roles:[]},{branchId:'untrusted',dateFrom:'2026-10-01',dateTo:'2026-10-23',instructorId:'teacher',cycleId:'cycle'});
  assert.equal(r.data[0].activity_type,'EXAM_ONLY');assert.equal(r.data[0].classes,0);assert.equal(r.pagination.total,1);
  const main=calls.find(c=>c.sql.includes('COUNT(*) OVER()'));
  assert.equal(main.args[0],'authorized');assert.equal(main.args[6],'cycle');
  assert.match(main.sql,/ORDER BY start_time,start_date.*LIMIT \$8 OFFSET \$9/);
  assert.match(main.sql,/WHERE \(\$7::uuid IS NULL OR cycle_id=\$7\)/);
  assert.match(ctes,/b.id=COALESCE\(cc.branch_id,e.branch_id\)/);
  assert.match(ctes,/p.appointment_type='EXAM_ONLY'/);
  assert.match(ctes,/p.scheduled_start=a.schedule_date\+a.start_time/);
  assert.match(ctes,/p.status NOT IN \('CANCELADA','REPROGRAMADA'\)/);
 }finally{db.query=original;}
});

test('SQL fixture: exams without assignments, exact counts, canceled and cross-branch isolation',{skip:process.env.INSTRUCTOR_REPORT_DB_TEST!=='1'},async()=>{
 const c=await db.getClient();try{
 await c.query('BEGIN');
 for(const sql of [
  'branches(id uuid,province text,city text)',
  'additional_driving_practices(id uuid PRIMARY KEY,student_id uuid,branch_id uuid,instructor_id uuid,start_date date,number_of_days int,daily_start_time time,completed_days int,status text)',
  'courses(id uuid PRIMARY KEY,name text)',
  'students(id uuid PRIMARY KEY,identification text,first_name text,last_name text,email text,phone text,status text)',
  'enrollments(id uuid,student_id uuid,course_id uuid,branch_id uuid)',
  'course_cycles(id uuid PRIMARY KEY,course_id uuid,branch_id uuid,group_id uuid,code text,start_date date,end_date date,deleted_at timestamp,status text,modality text)',
  'course_cycle_instructors(cycle_id uuid,instructor_id uuid,active boolean)',
  'instructor_group_members(group_id uuid,instructor_id uuid,active boolean,ended_at timestamp)',
  'course_cycle_schedule_assignments(student_id uuid,enrollment_id uuid,cycle_id uuid,schedule_date date,start_time time,end_time time,instructor_id uuid,status text)',
  'practical_sessions(id uuid,enrollment_id uuid,instructor_id uuid,branch_id uuid,scheduled_start timestamp,scheduled_end timestamp,actual_start timestamp,actual_end timestamp,status text,appointment_type text,deleted_at timestamp,created_at timestamp)'
 ])await c.query('CREATE TEMP TABLE '+sql+' ON COMMIT DROP');
 const id=n=>'00000000-0000-0000-0000-'+String(n).padStart(12,'0');
 await c.query("INSERT INTO branches VALUES($1,'P','C'),($2,'P','C')",[id(1),id(2)]);
 await c.query("INSERT INTO courses VALUES($1,'Moto')",[id(3)]);
 await c.query("INSERT INTO course_cycles VALUES($1,$2,$3,NULL,'C1','2026-10-15','2026-10-21',NULL,'activo','normal')",[id(4),id(3),id(1)]);
 await c.query('INSERT INTO course_cycle_instructors VALUES($1,$2,TRUE)',[id(4),id(5)]);
 for(const n of [10,11,12]){
  await c.query("INSERT INTO students VALUES($1,$2,$2,'Test','','','activo')",[id(n),String(n)]);
  await c.query('INSERT INTO enrollments VALUES($1,$2,$3,$4)',[id(n+20),id(n),id(3),id(n===12?2:1)]);
 }
 for(const day of [15,16]){
  await c.query("INSERT INTO course_cycle_schedule_assignments VALUES($1,$2,$3,$4,'08:00','09:40',$5,'activo')",[id(10),id(30),id(4),`2026-10-${day}`,id(5)]);
  await c.query("INSERT INTO practical_sessions VALUES($1,$2,$3,$4,$5::date+'08:00'::time,$5::date+'09:40'::time,NULL,NULL,'COMPLETADA','PRACTICAL_CLASS',NULL,NOW())",[id(day+100),id(30),id(5),id(1),`2026-10-${day}`]);
 }
 for(const [n,status] of [[11,'PROGRAMADA'],[12,'PROGRAMADA'],[11,'CANCELADA']])await c.query("INSERT INTO practical_sessions VALUES(gen_random_uuid(),$1,$2,$3,'2026-10-15 18:30','2026-10-15 18:50',NULL,NULL,$4,'EXAM_ONLY',NULL,NOW())",[id(n+20),id(5),id(n===12?2:1),status]);
 await c.query('ALTER TABLE enrollments ADD COLUMN practical_start_date date');
 const rows=(await c.query(`WITH ${ctes} SELECT * FROM activities ORDER BY start_time`,[id(1),'2026-10-01','2026-10-23',null,null,id(5)])).rows;
 assert.equal(rows.length,2);assert.equal(rows[0].classes,2);assert.equal(rows[0].attended,2);
 assert.equal(rows[1].classes,0);assert.equal(rows[1].exams,1);assert.equal(rows[1].cycle_id,id(4));assert.equal(rows[1].schedule_time,'18:30 - 18:50');
 await c.query("INSERT INTO course_cycles VALUES($1,$2,$3,NULL,'FINDE','2026-10-14','2026-10-21',NULL,'activo','intensivo')",[id(6),id(3),id(1)]);
 await c.query('INSERT INTO course_cycle_instructors VALUES($1,$2,TRUE)',[id(6),id(5)]);
 await c.query("UPDATE enrollments SET practical_start_date='2026-10-14' WHERE id=$1",[id(31)]);
 const corrected=(await c.query(`WITH ${ctes} SELECT * FROM activities WHERE identification='11'`,[id(1),'2026-10-01','2026-10-23',null,null,id(5)])).rows;
 assert.equal(corrected.length,1);assert.equal(corrected[0].cycle_id,id(6));
 assert.equal(corrected[0].exams,1);assert.equal(corrected[0].classes,0);
 await c.query("INSERT INTO additional_driving_practices VALUES($1,$2,$3,$4,'2026-10-15',3,'16:00',1,'IN_PROGRESS')",[id(50),id(10),id(1),id(5)]);
 await c.query("INSERT INTO additional_driving_practices VALUES($1,$2,$3,$4,'2026-10-15',3,'16:00',1,'IN_PROGRESS')",[id(51),id(12),id(2),id(5)]);
 await c.query("INSERT INTO additional_driving_practices VALUES($1,$2,$3,$4,'2026-10-15',3,'16:00',1,'CANCELLED')",[id(52),id(10),id(1),id(5)]);
 const practice=(await c.query(`WITH ${ctes} SELECT * FROM activities WHERE activity_type='ADDITIONAL_PRACTICE'`,[id(1),'2026-10-16','2026-10-23',null,null,id(5)])).rows;
 assert.equal(practice.length,1);assert.equal(practice[0].classes,2);assert.equal(practice[0].attended,0);
 assert.equal(Number(practice[0].hours),0);assert.equal(Number(practice[0].scheduled_hours),3.33);
 const fullPractice=(await c.query(`WITH ${ctes} SELECT * FROM activities WHERE activity_type='ADDITIONAL_PRACTICE'`,[id(1),'2026-10-01','2026-10-23',null,null,id(5)])).rows;
 assert.equal(fullPractice.length,1);assert.equal(fullPractice[0].attended,1);
 assert.equal(Number(fullPractice[0].hours),1.67);assert.equal(Number(fullPractice[0].scheduled_hours),5);
 }finally{await c.query('ROLLBACK');c.release();await db.pool.end();}
});
