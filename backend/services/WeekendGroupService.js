const crypto = require('node:crypto');
const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const CourseCycleService = require('./CourseCycleService');
const CycleInstructorAssignmentService = require('./CycleInstructorAssignmentService');
const InstructorAdminService = require('./InstructorAdminService');

const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
const version = rows => crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');

class WeekendGroupService {
  static async context(user, cycleId, instructorId, queryable = db) {
    if (!uuid(cycleId) || !uuid(instructorId)) throw createError(422, 'Curso e instructor no validos');
    const cycle = (await queryable.query(`SELECT cc.*, to_char(CURRENT_DATE,'YYYY-MM-DD') today,
      (SELECT json_agg(json_build_object('day_of_week',t.day_of_week,'start_time',t.start_time,'end_time',t.end_time))
       FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE
       WHERE p.branch_id=cc.branch_id AND p.course_id=cc.course_id AND t.modality=cc.modality) schedule_templates
      FROM course_cycles cc WHERE cc.id=$1 AND cc.active=TRUE AND cc.deleted_at IS NULL`, [cycleId])).rows[0];
    if (!cycle || cycle.modality !== 'intensivo') throw createError(404, 'Curso de fin de semana no encontrado');
    if (!user.global) {
      const scheduleBranch = await InstructorAdminService.resolveScheduleBranchId(user.branch_id);
      const aliases = await queryable.query(`SELECT id FROM branches WHERE id=$1 OR
        (code='SP_IC1' AND city_id=(SELECT city_id FROM branches WHERE id=$1)
         AND EXISTS(SELECT 1 FROM branches WHERE id=$1 AND code='SP_IC'))`, [scheduleBranch]);
      if (!aliases.rows.some(row => String(row.id) === String(cycle.branch_id))) throw createError(403, 'No tienes acceso a este curso');
    }
    const instructors = (await queryable.query(`SELECT DISTINCT ip.id, concat_ws(' ',u.first_name,u.last_name) name
      FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
      WHERE ip.deleted_at IS NULL AND ip.status='activo' AND u.active=TRUE AND (
        EXISTS(SELECT 1 FROM course_cycle_instructors cci WHERE cci.cycle_id=$1 AND cci.instructor_id=ip.id AND cci.active=TRUE)
        OR EXISTS(SELECT 1 FROM instructor_group_members igm WHERE igm.group_id=$2 AND igm.instructor_id=ip.id AND igm.active=TRUE AND igm.ended_at IS NULL))
      ORDER BY name`, [cycleId, cycle.group_id])).rows;
    if (!instructors.some(item => String(item.id) === String(instructorId))) throw createError(422, 'El instructor no pertenece a este curso');
    return { cycle, instructors };
  }

  static async assignments(queryable, cycleId, lock = false) {
    return (await queryable.query(`SELECT a.id,a.enrollment_id,a.student_id,a.instructor_id,
      to_char(a.schedule_date,'YYYY-MM-DD') date,to_char(a.start_time,'HH24:MI') start,
      to_char(a.end_time,'HH24:MI') end,a.updated_at,
      concat_ws(' ',s.first_name,s.last_name) name,s.identification,
      e.status enrollment_status,s.status student_status
      FROM course_cycle_schedule_assignments a JOIN enrollments e ON e.id=a.enrollment_id
      JOIN students s ON s.id=a.student_id WHERE a.cycle_id=$1 AND a.status='activo'
      ORDER BY a.id ${lock ? 'FOR UPDATE OF a' : ''}`, [cycleId])).rows;
  }

  static async get(user, cycleId, instructorId) {
    const { cycle, instructors } = await this.context(user, cycleId, instructorId);
    const rows = await this.assignments(db, cycleId);
    const members = new Map();
    for (const row of rows) {
      if (row.student_status === 'inhabilitado' || ['cancelado', 'completado'].includes(row.enrollment_status)) continue;
      const member = members.get(row.enrollment_id) || { enrollmentId: row.enrollment_id, studentId: row.student_id,
        name: row.name, identification: row.identification, slots: [] };
      member.slots.push({ date: row.date, time: `${row.start} - ${row.end}`, instructorId: row.instructor_id, editable: row.date >= cycle.today });
      members.set(row.enrollment_id, member);
    }
    const layout = CourseCycleService.calendarLayout(cycle);
    return { cycle: { id: cycle.id, code: cycle.code, branchId: cycle.branch_id }, instructorId,
      instructors, version: version(rows), today: cycle.today,
      dates: layout.dates.filter(date => date >= cycle.today),
      times: layout.slots.map(slot => `${slot[0]} - ${slot[1]}`),
      members: [...members.values()].filter(member => member.slots.some(slot => String(slot.instructorId) === String(instructorId))),
      candidates: [...members.values()].filter(member => !member.slots.some(slot => String(slot.instructorId) === String(instructorId))) };
  }

  static validate(data, context) {
    const reason = String(data.reason || '').trim();
    if (!reason || reason.length > 1000) throw createError(422, 'Indica el motivo del cambio (maximo 1000 caracteres)');
    if (!Array.isArray(data.changes) || !data.changes.length || data.changes.length > 100) throw createError(422, 'No hay cambios validos');
    const seen = new Set(), slots = [];
    const layout = CourseCycleService.calendarLayout(context.cycle);
    for (const change of data.changes) {
      if (!uuid(change.enrollmentId) || seen.has(change.enrollmentId)) throw createError(422, 'Matricula repetida o no valida');
      seen.add(change.enrollmentId);
      if (change.remove === true) continue;
      if (!context.instructors.some(item => String(item.id) === String(change.instructorId))) throw createError(422, 'Instructor no habilitado para el curso');
      if (!Array.isArray(change.slots) || !change.slots.length || change.slots.length > layout.dates.length) throw createError(422, 'Selecciona las practicas futuras');
      const dates = new Set();
      for (const slot of change.slots) {
        if (!layout.dates.includes(slot.date) || slot.date < context.cycle.today || dates.has(slot.date)) throw createError(422, 'Fecha pasada, repetida o fuera del curso');
        dates.add(slot.date);
        const match = String(slot.time || '').match(/^(\d{2}:\d{2}) - (\d{2}:\d{2})$/);
        if (!match || !layout.slots.some(time => time[0] === match[1] && time[1] === match[2])) throw createError(422, 'Horario no permitido');
        if (context.cycle.schedule_templates?.length && !context.cycle.schedule_templates.some(template =>
          Number(template.day_of_week) === new Date(`${slot.date}T12:00:00`).getDay() &&
          String(template.start_time).slice(0,5) === match[1] && String(template.end_time).slice(0,5) === match[2])) throw createError(422, 'El horario no corresponde a ese dia');
        slots.push({ enrollmentId: change.enrollmentId, instructorId: change.instructorId, date: slot.date, start: match[1], end: match[2] });
      }
    }
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i], b = slots[j];
      if (a.date === b.date && a.instructorId === b.instructorId && a.start < b.end && a.end > b.start) throw createError(409, 'Dos estudiantes no pueden ocupar al mismo instructor a la misma hora');
    }
    return { reason, slots };
  }

  static async save(user, cycleId, instructorId, data) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const context = await this.context(user, cycleId, instructorId, client);
      await client.query('SELECT id FROM course_cycles WHERE id=$1 FOR UPDATE', [cycleId]);
      const current = await this.assignments(client, cycleId, true);
      if (version(current) !== data.version) throw createError(409, 'El grupo cambio. Cierra y vuelve a abrir la edicion');
      const { reason, slots } = this.validate(data, context);
      const enrollments = data.changes.map(change => change.enrollmentId);
      for (const change of data.changes) {
        const existing = current.filter(row => row.enrollment_id === change.enrollmentId);
        if (!existing.length || existing.some(row => row.student_status === 'inhabilitado' || ['cancelado','completado'].includes(row.enrollment_status))) throw createError(422, 'El estudiante no pertenece a este curso activo');
        if (change.remove && !existing.some(row => String(row.instructor_id) === String(instructorId))) throw createError(403, 'Solo puedes retirar integrantes de este grupo');
        const future = existing.filter(row => row.date >= context.cycle.today);
        if (!future.length) throw createError(422, 'No hay clases futuras para modificar');
        if (!change.remove && change.slots.length !== future.length) throw createError(422, 'Debes conservar la cantidad de practicas pendientes');
      }
      const otherCourses = await client.query(`SELECT 1 FROM course_cycle_schedule_assignments
        WHERE enrollment_id=ANY($1::uuid[]) AND cycle_id<>$2 AND status='activo' AND schedule_date>=CURRENT_DATE LIMIT 1`, [enrollments, cycleId]);
      if (otherCourses.rows.length) throw createError(409, 'Una matricula tiene practicas en otro curso. Debe revisarse individualmente');
      // Use the same slot locks as enrollment and temporary reservation flows.
      const locks = new Set(slots.flatMap(slot => [`instructor-slot:${slot.instructorId}:${slot.date}:${slot.start}:${slot.end}`, `${cycleId}:${slot.date}:${slot.start}:${slot.end}`]));
      for (const key of [...locks].sort()) await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [key]);
      const completed = await client.query(`SELECT 1 FROM practical_sessions ps WHERE ps.enrollment_id=ANY($1::uuid[])
        AND ps.deleted_at IS NULL AND ps.scheduled_start::date>=CURRENT_DATE
        AND (UPPER(ps.status) NOT IN ('PROGRAMADA','PROXIMA','REPROGRAMADA','CANCELADA')
          OR COALESCE(ps.appointment_type,'PRACTICAL_CLASS')<>'PRACTICAL_CLASS') LIMIT 1`, [enrollments]);
      if (completed.rows.length) throw createError(409, 'Hay clases iniciadas, registradas o citas especiales. Deben revisarse individualmente');
      for (const slot of slots) {
        const studentId = current.find(row => row.enrollment_id === slot.enrollmentId).student_id;
        const conflict = await client.query(`SELECT 1 FROM (
          SELECT a.instructor_id,a.student_id,a.schedule_date date,a.start_time,a.end_time FROM course_cycle_schedule_assignments a
            WHERE a.status='activo' AND NOT(a.cycle_id=$1 AND a.enrollment_id=ANY($2::uuid[]) AND a.schedule_date>=CURRENT_DATE)
          UNION ALL SELECT b.instructor_id,b.student_id,b.schedule_date,b.start_time,b.end_time FROM referred_instructor_schedule_blocks b
            WHERE b.status='activo' AND NOT(b.cycle_id=$1 AND b.enrollment_id=ANY($2::uuid[]) AND b.schedule_date>=CURRENT_DATE)
          UNION ALL SELECT ps.instructor_id,e.student_id,ps.scheduled_start::date,ps.scheduled_start::time,ps.scheduled_end::time
            FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id
            WHERE ps.deleted_at IS NULL AND UPPER(ps.status) NOT IN ('CANCELADA','REPROGRAMADA')
            AND NOT(ps.enrollment_id=ANY($2::uuid[]) AND UPPER(ps.status) IN ('PROGRAMADA','PROXIMA'))
          UNION ALL SELECT o.instructor_id,NULL::uuid,o.schedule_date,o.start_time,o.end_time FROM instructor_availability_overrides o WHERE o.active=TRUE
          UNION ALL SELECT t.instructor_id,NULL::uuid,$4::date,t.start_time,t.end_time FROM theory_class_schedules t
            WHERE t.active=TRUE AND (t.class_date=$4::date OR (t.recurring=TRUE AND
              (t.day_of_week=EXTRACT(DOW FROM $4::date) OR (t.day_of_week IS NULL AND EXTRACT(DOW FROM $4::date) BETWEEN 1 AND 5))))
        ) busy WHERE (busy.instructor_id=$3 OR busy.student_id=$7) AND busy.date=$4::date
          AND busy.start_time<$6::time AND busy.end_time>$5::time LIMIT 1`,
        [cycleId, enrollments, slot.instructorId, slot.date, slot.start, slot.end, studentId]);
        if (conflict.rows.length) throw createError(409, `Cruce de horario o reserva el ${slot.date} a las ${slot.start}`);
        const capacity = Number(context.cycle.published_capacity) || context.instructors.length * Math.max(1, Number(context.cycle.capacity_per_instructor) || 1);
        const occupied = await client.query(`SELECT (
          (SELECT COUNT(*) FROM course_cycle_schedule_assignments WHERE cycle_id=$1 AND status='activo'
            AND NOT(enrollment_id=ANY($2::uuid[])) AND schedule_date=$3::date AND start_time<$5::time AND end_time>$4::time)
          + (SELECT COUNT(*) FROM course_cycle_seat_reservations WHERE cycle_id=$1 AND status='activo'
            AND expires_at>NOW() AND reserved_start_time<$5::time AND reserved_end_time>$4::time)
        )::int occupied`, [cycleId,enrollments,slot.date,slot.start,slot.end]);
        const incoming = slots.filter(item => item.date === slot.date && item.start < slot.end && item.end > slot.start).length;
        if (Number(occupied.rows[0].occupied) + incoming > capacity) throw createError(409, `No hay cupos disponibles el ${slot.date} a las ${slot.start}`);
      }
      const before = current.filter(row => enrollments.includes(row.enrollment_id) && row.date >= context.cycle.today);
      await client.query(`UPDATE course_cycle_schedule_assignments SET status='cancelado',updated_at=NOW()
        WHERE cycle_id=$1 AND enrollment_id=ANY($2::uuid[]) AND schedule_date>=CURRENT_DATE AND status='activo'`, [cycleId, enrollments]);
      await client.query(`UPDATE referred_instructor_schedule_blocks SET status='cancelado',updated_at=NOW()
        WHERE cycle_id=$1 AND enrollment_id=ANY($2::uuid[]) AND schedule_date>=CURRENT_DATE AND status='activo'`, [cycleId, enrollments]);
      for (const slot of slots) {
        const row = current.find(item => item.enrollment_id === slot.enrollmentId);
        await client.query(`INSERT INTO course_cycle_schedule_assignments(cycle_id,enrollment_id,student_id,instructor_id,schedule_date,start_time,end_time,status,created_by)
          VALUES($1,$2,$3,$4,$5::date,$6::time,$7::time,'activo',$8)`, [cycleId, slot.enrollmentId, row.student_id, slot.instructorId, slot.date, slot.start, slot.end, user.id]);
      }
      for (const change of data.changes) {
        const row = current.find(item => item.enrollment_id === change.enrollmentId);
        await client.query(`UPDATE enrollment_instructor_assignments SET active=FALSE,end_date=CURRENT_DATE,updated_at=NOW()
          WHERE enrollment_id=$1 AND active=TRUE`, [change.enrollmentId]);
        if (!change.remove) await client.query(`INSERT INTO enrollment_instructor_assignments(enrollment_id,instructor_id,assigned_by,observations)
          VALUES($1,$2,$3,$4)`, [change.enrollmentId, change.instructorId, user.id, reason]);
        await CycleInstructorAssignmentService.reconcilePracticalSessions(client, change.enrollmentId, change.instructorId || null, user.id);
        await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)', [row.student_id, `Grupo de fin de semana ${context.cycle.code}: ${change.remove ? 'retirado de practicas futuras' : 'horario o instructor actualizado'}. Motivo: ${reason}`]);
        const notified = [...new Set([...before.filter(item => item.enrollment_id === change.enrollmentId).map(item => item.instructor_id), change.instructorId].filter(Boolean))];
        await client.query(`INSERT INTO notifications(student_id,user_id,branch_id,title,message,type,reference_type,reference_id,read)
          SELECT $1,ip.user_id,$2,'Grupo de fin de semana actualizado',$3,'warning','SCHEDULE_CHANGE',$1,FALSE
          FROM instructor_profiles ip WHERE ip.id=ANY($4::uuid[])`, [row.student_id,context.cycle.branch_id,`${row.name}: ${reason}`,notified]);
      }
      await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,'WEEKEND_GROUP_UPDATED','course_cycles',$4,$5::jsonb)`, [user.id,user.role,context.cycle.branch_id,cycleId,JSON.stringify({ instructorId, reason, before, changes: data.changes })]);
      await client.query('COMMIT');
      return { updated: data.changes.length };
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
}
module.exports = WeekendGroupService;
