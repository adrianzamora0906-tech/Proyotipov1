const db = require('../backend/config/database');
const Sessions = require('../backend/services/CycleInstructorAssignmentService');

const elias = '410c1883-8c7c-462d-bf7e-49baf9e5ce27';
const rolando = '3502fb7e-eb33-4338-9375-bc5701009367';
const targets = [
  { cedula: '1311960957', cycle: '314e4848-f54a-48ca-afae-0c3b15890004', instructor: elias, start: '07:00', end: '10:10', dates: ['2026-10-10','2026-10-11','2026-10-17','2026-10-18'] },
  { cedula: '1315969095', cycle: '314e4848-f54a-48ca-afae-0c3b15890004', instructor: elias, start: '10:30', end: '13:50', dates: ['2026-10-10','2026-10-11','2026-10-17','2026-10-18'] },
  { cedula: '1354200667', cycle: '10aa1012-8ba6-4b64-a8e1-a7551ea54362', instructor: rolando, start: '10:30', end: '13:50', dates: ['2026-10-17','2026-10-18','2026-10-24','2026-10-25'] },
];

(async () => {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('align-weekend-roster-october'))");
    const actor = (await client.query("SELECT id FROM users WHERE username='admin' AND active=TRUE")).rows[0];
    if (!actor) throw Error('Actor no disponible');
    for (const target of targets) {
      const row = (await client.query(`SELECT s.id student_id,e.id enrollment_id,c.code
        FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='activo'
        JOIN course_cycles c ON c.id=$2 AND c.course_id=e.course_id AND c.branch_id=e.branch_id
        WHERE s.identification=$1 FOR UPDATE OF e`, [target.cedula,target.cycle])).rows;
      if (row.length !== 1) throw Error(`Matricula incompatible: ${target.cedula}`);
      Object.assign(target,row[0]);
      if (!(await client.query(`SELECT 1 FROM course_cycle_instructors WHERE cycle_id=$1
        AND instructor_id=$2 AND active=TRUE`,[target.cycle,target.instructor])).rows.length) throw Error('Instructor no habilitado');
      if ((await client.query(`SELECT 1 FROM practical_sessions WHERE enrollment_id=$1
        AND deleted_at IS NULL AND status NOT IN ('PROGRAMADA','PROXIMA','CANCELADA','REPROGRAMADA')`,[target.enrollment_id])).rows.length) throw Error('Hay clases iniciadas');
    }
    const ids = targets.map(t=>t.student_id);
    for (const t of targets) {
      for (const date of t.dates) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`instructor-slot:${t.instructor}:${date}:${t.start}:00:${t.end}:00`]);
        const conflict = await client.query(`SELECT 1 FROM (
          SELECT schedule_date,start_time,end_time FROM course_cycle_schedule_assignments
            WHERE instructor_id=$1 AND status='activo' AND NOT(student_id=ANY($5::uuid[]))
          UNION ALL SELECT schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks
            WHERE instructor_id=$1 AND status='activo' AND NOT(student_id=ANY($5::uuid[]))
          UNION ALL SELECT schedule_date,start_time,end_time FROM instructor_availability_overrides
            WHERE instructor_id=$1 AND active=TRUE
          UNION ALL SELECT scheduled_start::date,scheduled_start::time,scheduled_end::time FROM practical_sessions
            WHERE instructor_id=$1 AND deleted_at IS NULL AND status NOT IN ('CANCELADA','REPROGRAMADA')
              AND NOT(enrollment_id=ANY($6::uuid[]))
        ) busy WHERE schedule_date=$2::date AND start_time<$4::time AND end_time>$3::time LIMIT 1`,
        [t.instructor,date,t.start,t.end,ids,targets.map(x=>x.enrollment_id)]);
        if (conflict.rows.length) throw Error(`Conflicto ${t.cedula} ${date}`);
      }
    }
    await client.query("UPDATE course_cycle_schedule_assignments SET status='cancelado',updated_at=NOW() WHERE student_id=ANY($1::uuid[]) AND status='activo'",[ids]);
    await client.query("UPDATE referred_instructor_schedule_blocks SET status='cancelado',updated_at=NOW() WHERE student_id=ANY($1::uuid[]) AND status='activo'",[ids]);
    for (const t of targets) {
      await client.query("UPDATE course_cycle_schedule_assignments SET status='cancelado',updated_at=NOW() WHERE student_id=$1 AND status='activo'",[t.student_id]);
      await client.query("UPDATE referred_instructor_schedule_blocks SET status='cancelado',updated_at=NOW() WHERE student_id=$1 AND status='activo'",[t.student_id]);
      await client.query('UPDATE enrollment_instructor_assignments SET active=FALSE,updated_at=NOW() WHERE enrollment_id=$1 AND active=TRUE',[t.enrollment_id]);
      for (const date of t.dates) {
        await client.query(`INSERT INTO course_cycle_schedule_assignments
          (cycle_id,enrollment_id,student_id,instructor_id,schedule_date,start_time,end_time,status,created_by)
          VALUES($1,$2,$3,$4,$5::date,$6::time,$7::time,'activo',$8)`,
        [t.cycle,t.enrollment_id,t.student_id,t.instructor,date,t.start,t.end,actor.id]);
        await client.query(`INSERT INTO referred_instructor_schedule_blocks
          (cycle_id,enrollment_id,student_id,instructor_id,schedule_date,start_time,end_time,status,created_by)
          VALUES($1,$2,$3,$4,$5::date,$6::time,$7::time,'activo',$8)`,
        [t.cycle,t.enrollment_id,t.student_id,t.instructor,date,t.start,t.end,actor.id]);
      }
      await client.query(`INSERT INTO enrollment_instructor_assignments
        (enrollment_id,instructor_id,assigned_by,start_date,end_date,active,observations)
        VALUES($1,$2,$3,$4::date,$5::date,TRUE,'Correccion autorizada conforme a hoja octubre')`,
      [t.enrollment_id,t.instructor,actor.id,t.dates[0],t.dates[3]]);
      await client.query(`UPDATE enrollments SET practical_start_date=$2::date,practical_end_date=$3::date,updated_at=NOW() WHERE id=$1`,[t.enrollment_id,t.dates[0],t.dates[3]]);
      await Sessions.reconcilePracticalSessions(client,t.enrollment_id,t.instructor,actor.id);
      await client.query("UPDATE students SET status='horario_seleccionado',updated_at=NOW() WHERE id=$1",[t.student_id]);
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[t.student_id,`Correccion autorizada conforme a hoja: ${t.code}, ${t.start}-${t.end}. Registrado por admin. Pagos conservados.`]);
      await client.query(`INSERT INTO audit_logs(user_id,action,entity,entity_id,metadata)
        VALUES($1,'WEEKEND_ROSTER_ALIGNED','student',$2,$3::jsonb)`,[actor.id,t.student_id,JSON.stringify({source:'user_roster_october',cycleId:t.cycle,instructorId:t.instructor,dates:t.dates,start:t.start,end:t.end})]);
    }
    if (process.argv.includes('--apply')) { await client.query('COMMIT'); console.log('COMMITTED',JSON.stringify(targets)); }
    else { await client.query('ROLLBACK'); console.log('DRY_RUN_OK'); }
  } catch(e) { await client.query('ROLLBACK'); throw e; }
  finally { client.release(); }
})().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>db.pool.end());
