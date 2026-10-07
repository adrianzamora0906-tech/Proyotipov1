const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const enrollmentScope = 'SELECT id FROM enrollments WHERE student_id=$1';
const records = [
  { table: 'enrollments', fields: ['status'], scope: 'student_id=$1', changes: "status='inhabilitado'" },
  { table: 'course_cycle_schedule_assignments', fields: ['status'], scope: 'student_id=$1', changes: "status='cancelado'" },
  { table: 'enrollment_instructor_assignments', fields: ['active'], scope: `enrollment_id IN (${enrollmentScope})`, changes: 'active=FALSE' },
  { table: 'practical_sessions', fields: ['deleted_at'], scope: `enrollment_id IN (${enrollmentScope})`, changes: 'deleted_at=COALESCE(deleted_at,NOW())' },
  { table: 'student_schedules', fields: ['status'], scope: 'student_id=$1', changes: "status='cancelado'" },
  { table: 'referred_instructor_schedule_blocks', fields: ['status'], scope: 'student_id=$1', changes: "status='cancelado'" },
  { table: 'theory_group_students', fields: ['active'], scope: 'student_id=$1', changes: 'active=FALSE' },
  { table: 'additional_driving_practices', fields: ['status'], scope: 'student_id=$1', changes: "status='CANCELLED'" },
  { table: 'users', fields: ['active'], scope: 'student_id=$1', changes: 'active=FALSE' },
];

class StudentSuspensionService {
  static async setEnabled(id, enabled, user = {}) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`student-suspension:${id}`]);
      const student = (await client.query('SELECT * FROM students WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!student) throw createError(404, 'Estudiante no encontrado');
      const suspension = (await client.query('SELECT snapshot FROM student_suspensions WHERE student_id=$1 FOR UPDATE', [id])).rows[0];
      if (!enabled && suspension) {
        await client.query('COMMIT');
        return student;
      }
      if (enabled && !suspension) throw createError(409, 'El estudiante no tiene una inhabilitacion reversible');
      let snapshot;
      if (!enabled) {
        snapshot = { status: student.status, records: {} };
        for (const record of records) {
          snapshot.records[record.table] = (await client.query(`SELECT id,${record.fields.join(',')} FROM ${record.table} WHERE ${record.scope} FOR UPDATE`, [id])).rows;
        }
        await client.query('INSERT INTO student_suspensions(student_id,snapshot,disabled_by) VALUES($1,$2::jsonb,$3)', [id, JSON.stringify(snapshot), user.id || null]);
        for (const record of records) await client.query(`UPDATE ${record.table} SET ${record.changes} WHERE ${record.scope}`, [id]);
      } else {
        snapshot = suspension.snapshot;
        const restoreSlots = [];
        for (const table of ['course_cycle_schedule_assignments', 'referred_instructor_schedule_blocks']) {
          const ids = snapshot.records[table].filter(row => row.status === 'activo').map(row => row.id);
          restoreSlots.push(...(await client.query(`SELECT instructor_id,schedule_date,start_time,end_time FROM ${table} WHERE id=ANY($1::uuid[])`, [ids])).rows);
        }
        const sessionIds = snapshot.records.practical_sessions.filter(row => row.deleted_at === null).map(row => row.id);
        restoreSlots.push(...(await client.query(`SELECT instructor_id,scheduled_start::date schedule_date,
          scheduled_start::time start_time,scheduled_end::time end_time FROM practical_sessions
          WHERE id=ANY($1::uuid[]) AND status IN ('PROGRAMADA','PROXIMA','EN_CURSO')`, [sessionIds])).rows);
        const practiceIds = snapshot.records.additional_driving_practices.filter(row => ['SCHEDULED','IN_PROGRESS'].includes(row.status)).map(row => row.id);
        restoreSlots.push(...(await client.query(`SELECT p.instructor_id,d::date schedule_date,p.daily_start_time start_time,
          (p.daily_start_time+INTERVAL '100 minutes')::time end_time FROM additional_driving_practices p
          CROSS JOIN LATERAL generate_series(p.start_date,p.start_date+(p.number_of_days-1),INTERVAL '1 day') d
          WHERE p.id=ANY($1::uuid[])`, [practiceIds])).rows);
        const checked = new Set();
        for (const slot of restoreSlots) {
          const date = slot.schedule_date instanceof Date ? slot.schedule_date.toISOString().slice(0, 10) : String(slot.schedule_date).slice(0, 10);
          const key = `${slot.instructor_id}:${date}:${slot.start_time}:${slot.end_time}`;
          if (checked.has(key)) continue;
          checked.add(key);
          await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`instructor-slot:${slot.instructor_id}:${date}:${slot.start_time.slice(0, 5)}:${slot.end_time.slice(0, 5)}`]);
          const conflict = await client.query(`
            SELECT 1 FROM course_cycle_schedule_assignments a
            WHERE a.instructor_id=$1 AND a.student_id<>$2 AND a.status='activo'
              AND a.schedule_date=$3::date AND a.schedule_date>=CURRENT_DATE
              AND a.start_time<$5::time AND a.end_time>$4::time
            UNION ALL SELECT 1 FROM instructor_availability_overrides o
            WHERE o.instructor_id=$1 AND o.active AND o.schedule_date=$3::date AND o.schedule_date>=CURRENT_DATE
              AND o.start_time<$5::time AND o.end_time>$4::time
            UNION ALL SELECT 1 FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id
            WHERE ps.instructor_id=$1 AND e.student_id<>$2 AND ps.deleted_at IS NULL
              AND ps.status NOT IN ('CANCELADA','REPROGRAMADA') AND ps.scheduled_start::date=$3::date
              AND ps.scheduled_start::date>=CURRENT_DATE AND ps.scheduled_start::time<$5::time AND ps.scheduled_end::time>$4::time
            UNION ALL SELECT 1 FROM referred_instructor_schedule_blocks b
            WHERE b.instructor_id=$1 AND b.student_id<>$2 AND b.status='activo'
              AND b.schedule_date=$3::date AND b.schedule_date>=CURRENT_DATE AND b.start_time<$5::time AND b.end_time>$4::time
            UNION ALL SELECT 1 FROM additional_driving_practices p
            WHERE p.instructor_id=$1 AND p.student_id<>$2 AND p.status IN ('SCHEDULED','IN_PROGRESS')
              AND $3::date>=CURRENT_DATE AND $3::date BETWEEN p.start_date AND p.start_date+(p.number_of_days-1)
              AND p.daily_start_time<$5::time AND (p.daily_start_time+INTERVAL '100 minutes')::time>$4::time
          `, [slot.instructor_id, id, slot.schedule_date, slot.start_time, slot.end_time]);
          if (conflict.rowCount) throw createError(409, 'No se puede habilitar: uno de sus horarios ya esta ocupado. Coordina el horario antes de habilitarlo.');
        }
        const legacyIds = snapshot.records.student_schedules.filter(row => row.status === 'activo').map(row => row.id);
        const fullSchedule = await client.query(`SELECT 1 FROM schedules s WHERE s.id IN
          (SELECT schedule_id FROM student_schedules WHERE id=ANY($1::uuid[])) AND
          (SELECT COUNT(*) FROM student_schedules ss WHERE ss.schedule_id=s.id AND ss.status='activo')+
          (SELECT COUNT(*) FROM student_schedules ss WHERE ss.schedule_id=s.id AND ss.id=ANY($1::uuid[]))>s.capacity`, [legacyIds]);
        if (fullSchedule.rowCount) throw createError(409, 'No se puede habilitar: el horario ya no tiene cupos disponibles');
        for (const record of records) {
          for (const row of snapshot.records[record.table]) {
            const values = record.fields.map(field => row[field]);
            const sets = record.fields.map((field, index) => `${field}=$${index + 2}`).join(',');
            await client.query(`UPDATE ${record.table} SET ${sets} WHERE id=$1`, [row.id, ...values]);
          }
        }
        await client.query('DELETE FROM student_suspensions WHERE student_id=$1', [id]);
      }
      await client.query(`UPDATE schedules SET available=GREATEST(capacity-(SELECT COUNT(*) FROM student_schedules ss
        WHERE ss.schedule_id=schedules.id AND ss.status='activo'),0)
        WHERE id IN (SELECT schedule_id FROM student_schedules WHERE student_id=$1)`, [id]);
      const result = (await client.query('UPDATE students SET status=$2,updated_by=$3,updated_at=NOW() WHERE id=$1 RETURNING *',
        [id, enabled ? snapshot.status : 'inhabilitado', user.id || null])).rows[0];
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)', [id, enabled ? 'Estudiante habilitado; registros operativos restaurados' : 'Estudiante inhabilitado; registros operativos suspendidos']);
      await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,$4,'students',$5,$6::jsonb)`, [user.id || null, user.role || null, student.branch_id,
        enabled ? 'STUDENT_ENABLED' : 'STUDENT_DISABLED', id, JSON.stringify({ identification: student.identification, reversible: true })]);
      await client.query('COMMIT');
      return result;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

module.exports = StudentSuspensionService;
