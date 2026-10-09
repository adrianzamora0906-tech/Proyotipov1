const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../backend/config/database');
const Sync = require('../backend/services/CycleInstructorAssignmentService');

const cycleId = '314e4848-f54a-48ca-afae-0c3b15890004';
const oldId = '7a485902-ade0-4ecd-9b5a-a881746ce224';
const newId = '410c1883-8c7c-462d-bf7e-49baf9e5ce27';
const hash = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const apply = process.argv.includes('--apply');

async function main() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['intensive-rotation:20857100-415d-4072-94cb-7ad8635d9dc3:carro']);
    const cycle = (await client.query('SELECT * FROM course_cycles WHERE id=$1 FOR UPDATE', [cycleId])).rows[0];
    assert.equal(cycle.code, 'SP_IC1_49_26');
    const instructor = (await client.query(`SELECT ip.id,u.active,ip.status FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
      JOIN instructor_course_capabilities c ON c.instructor_id=ip.id AND c.course_id=$2 AND c.active=TRUE WHERE ip.id=$1`, [newId,cycle.course_id])).rows[0];
    assert(instructor?.active && instructor.status === 'activo', 'Elias debe estar habilitado para auto');
    const actor = (await client.query("SELECT id,role FROM users WHERE username='admin' AND active=TRUE")).rows[0];
    assert(actor);
    const assignments = (await client.query(`SELECT * FROM course_cycle_schedule_assignments WHERE cycle_id=$1 AND status='activo' ORDER BY id FOR UPDATE`, [cycleId])).rows;
    const reservations = (await client.query(`SELECT * FROM course_cycle_seat_reservations WHERE cycle_id=$1 AND status='activo' ORDER BY id FOR UPDATE`, [cycleId])).rows;
    assert(assignments.every(row => [oldId,newId].includes(row.instructor_id)));
    assert(reservations.every(row => [oldId,newId].includes(row.instructor_id)));
    if (assignments.every(row => row.instructor_id === newId) && reservations.every(row => row.instructor_id === newId)
      && (await client.query('SELECT 1 FROM course_cycle_instructors WHERE cycle_id=$1 AND instructor_id=$2 AND active=TRUE', [cycleId,newId])).rows.length) {
      console.log('Ya esta trasladado a Elias. No se hicieron cambios.'); await client.query('ROLLBACK'); return;
    }
    const enrollmentIds = [...new Set(assignments.map(row => row.enrollment_id))];
    const financial = async () => (await client.query('SELECT * FROM payments WHERE enrollment_id=ANY($1::uuid[]) ORDER BY id', [enrollmentIds])).rows;
    const beforePayments = hash(await financial());
    const beforeSchedule = hash(assignments.map(({id,enrollment_id,student_id,schedule_date,start_time,end_time,status}) => ({id,enrollment_id,student_id,schedule_date,start_time,end_time,status})));
    const otherCourses = await client.query(`SELECT 1 FROM course_cycle_schedule_assignments WHERE enrollment_id=ANY($1::uuid[])
      AND cycle_id<>$2 AND status='activo' LIMIT 1`, [enrollmentIds,cycleId]);
    assert.equal(otherCourses.rows.length, 0, 'Hay clases de la matricula en otros cursos; no se puede trasladar en bloque');
    const overrides = (await client.query(`SELECT * FROM instructor_availability_overrides WHERE instructor_id=$1 AND active=TRUE
      AND EXISTS(SELECT 1 FROM course_cycle_seat_reservations r WHERE r.cycle_id=$2 AND r.status='activo'
        AND instructor_availability_overrides.reason=CONCAT('RESERVA_CURSO:',r.id,':',$2::text)) ORDER BY id FOR UPDATE`, [oldId,cycleId])).rows;
    const slots = [...assignments, ...overrides].map(row => ({ date: row.schedule_date.toISOString().slice(0,10), start: String(row.start_time).slice(0,5), end: String(row.end_time).slice(0,5) }));
    for (const reservation of reservations) {
      const selected = reservation.draft_data?.schedulePlan?.selections;
      if (!selected?.length && !overrides.length) throw new Error('Reserva sin calendario recuperable; revisar antes de trasladar');
      for (const slot of selected || []) {
        const [start,end] = slot.time.split('-').map(time => time.trim().slice(0,5));
        slots.push({ date: slot.date, start, end });
      }
    }
    for (const slot of [...new Map(slots.map(row => [`${row.date}:${row.start}:${row.end}`,row])).values()]) {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`instructor-slot:${newId}:${slot.date}:${slot.start}:${slot.end}`]);
      const conflict = await client.query(`SELECT 1 FROM (
        SELECT instructor_id,schedule_date date,start_time,end_time FROM course_cycle_schedule_assignments WHERE status='activo' AND cycle_id<>$1
        UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks WHERE status='activo' AND cycle_id<>$1
        UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM instructor_availability_overrides WHERE active=TRUE
        UNION ALL SELECT instructor_id,scheduled_start::date,scheduled_start::time,scheduled_end::time FROM practical_sessions
          WHERE deleted_at IS NULL AND UPPER(status) NOT IN ('CANCELADA','REPROGRAMADA') AND NOT(enrollment_id=ANY($6::uuid[]))
        UNION ALL SELECT instructor_id,$3::date,start_time,end_time FROM theory_class_schedules WHERE active=TRUE AND
          (class_date=$3::date OR (recurring=TRUE AND (day_of_week=EXTRACT(DOW FROM $3::date) OR (day_of_week IS NULL AND EXTRACT(DOW FROM $3::date) BETWEEN 1 AND 5))))
      ) occupied WHERE instructor_id=$2 AND date=$3::date AND start_time<$5::time AND end_time>$4::time LIMIT 1`, [cycleId,newId,slot.date,slot.start,slot.end,enrollmentIds]);
      assert.equal(conflict.rows.length, 0, `Elias tiene un cruce el ${slot.date} ${slot.start}`);
    }
    const historical = await client.query(`SELECT 1 FROM practical_sessions WHERE enrollment_id=ANY($1::uuid[])
      AND deleted_at IS NULL AND UPPER(status) NOT IN ('PROGRAMADA','PROXIMA','REPROGRAMADA','CANCELADA') LIMIT 1`, [enrollmentIds]);
    assert.equal(historical.rows.length, 0, 'No se pueden cambiar clases ya realizadas o iniciadas');
    console.log(JSON.stringify({ mode: apply ? 'APLICAR' : 'SIMULACION', course: cycle.code, students: enrollmentIds.length, classes: assignments.length, reservations: reservations.length, reservationBlocks: overrides.length, conflicts: 0 }));
    if (!apply) { await client.query('ROLLBACK'); return; }
    await client.query(`UPDATE course_cycle_instructors SET active=FALSE,updated_at=NOW() WHERE cycle_id=$1 AND instructor_id=$2 AND active=TRUE`, [cycleId,oldId]);
    await client.query(`INSERT INTO course_cycle_instructors(cycle_id,instructor_id,role,active) VALUES($1,$2,'practico',TRUE)
      ON CONFLICT(cycle_id,instructor_id) DO UPDATE SET active=TRUE,updated_at=NOW()`, [cycleId,newId]);
    await client.query(`UPDATE course_cycle_schedule_assignments SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1 AND status='activo'`, [cycleId,newId]);
    await client.query(`UPDATE referred_instructor_schedule_blocks SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1 AND instructor_id=$3 AND status='activo'`, [cycleId,newId,oldId]);
    await client.query(`UPDATE enrollment_instructor_assignments SET active=FALSE,end_date=CURRENT_DATE,updated_at=NOW()
      WHERE enrollment_id=ANY($1::uuid[]) AND instructor_id=$2 AND active=TRUE`, [enrollmentIds,oldId]);
    for (const enrollmentId of enrollmentIds) {
      await client.query(`INSERT INTO enrollment_instructor_assignments(enrollment_id,instructor_id,assigned_by,observations)
        SELECT $1,$2,$3,'Correccion de rotacion 10-18 octubre: traslado autorizado a Jesus Elias'
        WHERE NOT EXISTS(SELECT 1 FROM enrollment_instructor_assignments WHERE enrollment_id=$1 AND active=TRUE)`, [enrollmentId,newId,actor.id]);
      await Sync.reconcilePracticalSessions(client,enrollmentId,newId,actor.id);
    }
    await client.query(`UPDATE course_cycle_seat_reservations SET instructor_id=$2::uuid,updated_at=NOW(),
      draft_data=jsonb_set(COALESCE(draft_data,'{}'::jsonb),'{schedulePlan}',
        COALESCE(draft_data->'schedulePlan','{}'::jsonb)||jsonb_build_object('preferredInstructorId',($2::uuid)::text),TRUE)
      WHERE cycle_id=$1 AND status='activo'`, [cycleId,newId]);
    for (const override of overrides) {
      await client.query(`INSERT INTO instructor_availability_overrides(instructor_id,schedule_date,start_time,end_time,status,reason,active,created_by,updated_by)
        VALUES($1,$2,$3,$4,$5,$6,TRUE,$7,$7) ON CONFLICT(instructor_id,schedule_date,start_time,end_time)
        DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
      [newId,override.schedule_date,override.start_time,override.end_time,override.status,override.reason,actor.id]);
      await client.query('UPDATE instructor_availability_overrides SET active=FALSE,updated_by=$2,updated_at=NOW() WHERE id=$1', [override.id,actor.id]);
    }
    await client.query('UPDATE intensive_instructor_rotation_assignments SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1 AND active=TRUE', [cycleId,newId]);
    for (const row of assignments.filter((row,index,list) => list.findIndex(other => other.student_id === row.student_id) === index)) {
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)', [row.student_id,'Traslado autorizado del curso SP_IC1_49_26 de Nelson Zambrano a Jesus Elias Hidalgo, conforme al orden de fin de semana. Fechas, horarios y pagos conservados.']);
    }
    await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
      VALUES($1,$2,$3,'INTENSIVE_INSTRUCTOR_TRANSFERRED','course_cycles',$4,$5::jsonb)`, [actor.id,actor.role,cycle.branch_id,cycleId,
      JSON.stringify({ oldInstructorId:oldId,instructorId:newId,reason:'Traslado solicitado por el usuario conforme a hoja Elias Hidalgo 10-18 octubre',assignmentIds:assignments.map(row=>row.id),reservationIds:reservations.map(row=>row.id),paymentHash:beforePayments })]);
    await client.query(`INSERT INTO notifications(user_id,branch_id,title,message,type,reference_type,reference_id,read)
      SELECT user_id,$1,'Instructor del curso actualizado','SP_IC1_49_26: trasladado a Jesus Elias Hidalgo; fechas y horarios conservados.','warning','COURSE_CYCLE',$2,FALSE
      FROM instructor_profiles WHERE id=ANY($3::uuid[])`, [cycle.branch_id,cycleId,[oldId,newId]]);
    const afterAssignments = (await client.query(`SELECT * FROM course_cycle_schedule_assignments WHERE cycle_id=$1 AND status='activo' ORDER BY id`, [cycleId])).rows;
    assert.equal(hash(afterAssignments.map(({id,enrollment_id,student_id,schedule_date,start_time,end_time,status}) => ({id,enrollment_id,student_id,schedule_date,start_time,end_time,status}))),beforeSchedule);
    assert(afterAssignments.every(row => row.instructor_id === newId));
    assert.equal(hash(await financial()),beforePayments,'Los pagos deben permanecer intactos');
    await client.query('COMMIT'); console.log('COMMIT confirmado. Horarios y pagos intactos.');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
main().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => db.pool.end());
