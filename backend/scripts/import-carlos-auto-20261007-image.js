const db = require('../config/database');
const Accounts = require('../services/StudentAccountService');
const Assignments = require('../services/CycleInstructorAssignmentService');
const Audit = require('../services/AuditService');

const marker = 'IMPORT_CARLOS_AUTO_20261007_IMAGE';
const dates = ['07', '08', '09', '12', '13', '14', '15', '16'].map(day => `2026-10-${day}`);
const instructorId = 'bd0df996-afd3-4d5c-9bc9-2b3c2b8d47ca';
const roster = [
  { identification: '1311929580', first: 'IVAN RODDY', last: 'PACHAY SILVA', phone: '0963117520',
    slots: [{ start: '08:00', end: '09:40', dates: dates.filter(d => /-(12|13)$/.test(d)) },
      { start: '20:00', end: '21:40', dates: dates.filter(d => !/-(12|13)$/.test(d)) }] },
  { identification: '1314681323', first: 'VALENTINO GABRIEL', last: 'CAMPOS AREVALO', phone: '0987130160',
    slots: [{ start: '16:00', end: '17:40', dates }] },
  { identification: '1316069713', first: 'JEREMY ARGENIS', last: 'LOOR LICOA', phone: '0985711143',
    note: 'Referido: FLAVIO REYES. Nomina indica abono $125 transferencia; falta referencia para verificar. Usuario confirma AUTO.',
    slots: [{ start: '18:00', end: '19:40', dates }] },
];
const blocks = [
  { start: '06:00', end: '07:40', reason: 'OCUPADO' },
  { start: '10:00', end: '11:40', reason: 'OCUPADO POR POLICIA - FRANCO ALMEIDA JOSTYN' },
  { start: '12:00', end: '13:40', reason: 'OCUPADO POR POLICIA - GALARZA SUAREZ CLARK RUPERT' },
  { start: '14:00', end: '15:40', reason: 'OCUPADO POR POLICIA' },
];

async function main() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [marker]);
    const cycle = (await client.query(`SELECT cc.*,c.price,b.city_id FROM course_cycles cc
      JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id
      WHERE cc.code='SP_IC_29_26' FOR UPDATE OF cc`)).rows[0];
    if (!cycle) throw new Error('Ciclo no encontrado');
    const actor = (await client.query("SELECT id FROM users WHERE username='admin' AND active=TRUE")).rows[0];
    if (!actor) throw new Error('Usuario responsable no encontrado');
    if ((await client.query('SELECT 1 FROM history WHERE action=$1 LIMIT 1', [marker])).rows.length) {
      await client.query('ROLLBACK');
      console.log('Importacion ya realizada');
      return;
    }
    // Check every requested interval before creating any roster records.
    for (const slot of [...roster.flatMap(item => item.slots), ...blocks.map(block => ({ ...block, dates }))]) {
      for (const date of slot.dates) {
        const conflict = await client.query(`SELECT id FROM course_cycle_schedule_assignments
          WHERE instructor_id=$1 AND schedule_date=$2::date AND status='activo'
            AND start_time<$4::time AND end_time>$3::time
          UNION ALL SELECT id FROM referred_instructor_schedule_blocks
          WHERE instructor_id=$1 AND schedule_date=$2::date AND status='activo'
            AND start_time<$4::time AND end_time>$3::time
          UNION ALL SELECT id FROM instructor_availability_overrides
          WHERE instructor_id=$1 AND schedule_date=$2::date AND active=TRUE
            AND start_time<$4::time AND end_time>$3::time`, [instructorId, date, slot.start, slot.end]);
        if (conflict.rows.length) throw new Error(`Horario ocupado: ${date} ${slot.start}`);
      }
    }
    const summary = [];
    for (const item of roster) {
      let student = (await client.query('SELECT id,status FROM students WHERE identification=$1 FOR UPDATE', [item.identification])).rows[0];
      if (student?.status === 'inhabilitado') throw new Error('Estudiante inhabilitado');
      if (!student) {
        student = (await client.query(`INSERT INTO students(branch_id,city_id,identification,first_name,last_name,
          phone,blood_type,status,created_by,registration_type,notes)
          VALUES($1,$2,$3,$4,$5,$6,'N/D','pendiente_pago',$7,'REGULAR',$8) RETURNING id`,
        [cycle.branch_id, cycle.city_id, item.identification, item.first, item.last, item.phone, actor.id, `${marker}. ${item.note || ''}`])).rows[0];
      }
      let enrollment = (await client.query(`SELECT id,branch_id FROM enrollments WHERE student_id=$1
        AND course_id=$2 AND status='activo' FOR UPDATE`, [student.id, cycle.course_id])).rows[0];
      if (enrollment && enrollment.branch_id !== cycle.branch_id) throw new Error('Matricula existente en otra sucursal');
      if (!enrollment) enrollment = (await client.query(`INSERT INTO enrollments(student_id,branch_id,course_id,
        status,enrollment_date,created_by,theory_modality,practical_start_date,practical_end_date)
        VALUES($1,$2,$3,'activo',CURRENT_DATE,$4,'presencial_regular',$5,$6) RETURNING id`,
      [student.id, cycle.branch_id, cycle.course_id, actor.id, cycle.start_date, cycle.end_date])).rows[0];
      const existingSchedule = await client.query(`SELECT id FROM course_cycle_schedule_assignments
        WHERE enrollment_id=$1 AND status='activo' LIMIT 1`, [enrollment.id]);
      if (existingSchedule.rows.length) throw new Error('La matricula ya tiene horario; requiere coordinacion');
      await client.query(`UPDATE enrollments SET practical_start_date=$2,practical_end_date=$3 WHERE id=$1`,
        [enrollment.id, cycle.start_date, cycle.end_date]);
      const assigned = await client.query('SELECT id FROM enrollment_instructor_assignments WHERE enrollment_id=$1 AND active=TRUE', [enrollment.id]);
      if (assigned.rows.length) throw new Error('La matricula ya tiene instructor; requiere coordinacion');
      await client.query(`INSERT INTO enrollment_instructor_assignments(enrollment_id,instructor_id,assigned_by,
        start_date,end_date,active,observations) VALUES($1,$2,$3,$4,$5,TRUE,$6)`,
      [enrollment.id, instructorId, actor.id, cycle.start_date, cycle.end_date, marker]);
      const payment = await client.query("SELECT id FROM payments WHERE enrollment_id=$1 AND status<>'anulado'", [enrollment.id]);
      if (!payment.rows.length) await client.query(`INSERT INTO payments(enrollment_id,total,discount,final_amount,balance,status)
        VALUES($1,$2,0,$2,$2,'pendiente')`, [enrollment.id, cycle.price]);
      await Accounts.createForStudent(student.id, client);
      for (const slot of item.slots) for (const date of slot.dates) {
        await client.query(`INSERT INTO course_cycle_schedule_assignments(cycle_id,enrollment_id,student_id,
          schedule_date,start_time,end_time,instructor_id,status,created_by)
          VALUES($1,$2,$3,$4::date,$5::time,$6::time,$7,'activo',$8)`,
        [cycle.id, enrollment.id, student.id, date, slot.start, slot.end, instructorId, actor.id]);
      }
      await Assignments.syncPracticalSessions(client, enrollment.id, instructorId, actor.id);
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)', [student.id, marker]);
      await Audit.log({ userId: actor.id, branchId: cycle.branch_id, role: 'ADMIN_SYSTEM', action: 'ROSTER_IMPORTED',
        module: 'ESTUDIANTES', entityType: 'ENROLLMENT', entityId: enrollment.id,
        description: 'Nomina auto Carlos Velez 7 octubre 2026', metadata: { marker, identification: item.identification,
          cycle: cycle.code, slots: item.slots, paymentNote: item.note || null } }, client);
      summary.push({ identification: item.identification, classes: item.slots.reduce((n, slot) => n + slot.dates.length, 0) });
    }
    for (const block of blocks) for (const date of dates) {
      await client.query(`INSERT INTO instructor_availability_overrides(instructor_id,schedule_date,start_time,end_time,
        status,reason,reason_type,active,created_by,updated_by)
        VALUES($1,$2::date,$3::time,$4::time,'blocked',$5,'occupied',TRUE,$6,$6)`,
      [instructorId, date, block.start, block.end, `${block.reason} - ${marker}`, actor.id]);
    }
    await Audit.log({ userId: actor.id, branchId: cycle.branch_id, role: 'ADMIN_SYSTEM', action: 'INSTRUCTOR_SCHEDULE_BLOCKED',
      module: 'HORARIOS', entityType: 'INSTRUCTOR', entityId: instructorId,
      description: 'Bloques ocupado y Policia segun nomina Carlos', metadata: { marker, dates, blocks } }, client);
    await client.query('COMMIT');
    console.log(JSON.stringify({ cycle: cycle.code, students: summary, blockedIntervals: blocks.length * dates.length }));
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error.message);
    process.exitCode = 1;
  } finally { client.release(); await db.pool.end(); }
}
main();
