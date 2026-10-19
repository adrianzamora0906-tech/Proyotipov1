const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const SLOT_STARTS = ['06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];

function normalizeTime(value) {
  return String(value || '').slice(0, 5);
}

function normalizeDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value || '').slice(0, 10);
}

class CycleInstructorAssignmentService {
  static async previewForSchedule(user, data = {}) {
    const cycleId = data.cycleId || data.cycle_id;
    const selections = Array.isArray(data.selections) ? data.selections : [];
    const preferredInstructorId = data.preferredInstructorId || data.preferred_instructor_id || null;
    const reservationIdValue = String(data.reservationId || data.reservation_id || '');
    const reservationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(reservationIdValue)
      ? reservationIdValue
      : null;
    if (!cycleId || !selections.length) return null;

    const contextResult = await db.query(`
      SELECT cc.id AS cycle_id, cc.group_id, cc.branch_id
      FROM course_cycles cc
      WHERE cc.id=$1 AND cc.status IN ('proximo','programado','activo')
      LIMIT 1
    `, [cycleId]);
    if (!contextResult.rows.length) throw createError(404, 'Curso no encontrado');
    const context = contextResult.rows[0];
    const membersResult = await db.query(`
      WITH eligible_members AS (
        SELECT igm.instructor_id, igm.position_order
        FROM instructor_group_members igm
        WHERE igm.group_id=$2 AND igm.active=TRUE AND igm.ended_at IS NULL

        UNION ALL

        SELECT cci.instructor_id, NULL::int AS position_order
        FROM course_cycle_instructors cci
        WHERE cci.cycle_id=$1 AND cci.active=TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM instructor_group_members current_igm
            WHERE current_igm.group_id=$2
              AND current_igm.active=TRUE AND current_igm.ended_at IS NULL
          )
      )
      SELECT ip.id AS instructor_id,
             COALESCE(member.position_order, ROW_NUMBER() OVER (ORDER BY u.first_name,u.last_name))::int AS position_order,
             u.first_name,u.last_name,
             CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$3 ELSE u.branch_id=$3 END AS priority_branch,
             priority_rule.branch_id AS priority_branch_id,
             COALESCE(priority_rule.allowed_slots,'[]'::jsonb) AS allowed_slots
      FROM eligible_members member
      JOIN instructor_profiles ip ON ip.id=member.instructor_id
      JOIN users u ON u.id=ip.user_id
      LEFT JOIN LATERAL (
        SELECT rule.branch_id,rule.allowed_slots
        FROM instructor_branch_priorities rule
        WHERE rule.instructor_id=ip.id AND rule.assignment_type='priority' AND rule.active=TRUE
          AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
        ORDER BY (rule.branch_id=$3) DESC,rule.updated_at DESC LIMIT 1
      ) priority_rule ON TRUE
      WHERE ip.status='activo'
        AND ip.deleted_at IS NULL AND u.active=TRUE
        AND ($4::uuid IS NULL OR ip.id=$4::uuid)
      ORDER BY (CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$3 ELSE u.branch_id=$3 END) DESC,
               position_order,u.first_name,u.last_name
    `, [context.cycle_id, context.group_id, context.branch_id, preferredInstructorId]);
    if (!membersResult.rows.length) return null;

    const firstStart = normalizeTime(String(selections[0]?.time || '').split('-')[0]);
    const slotIndex = Math.max(0, SLOT_STARTS.indexOf(firstStart));
    const rotate = members => members.length
      ? [...members.slice(slotIndex % members.length), ...members.slice(0, slotIndex % members.length)]
      : [];
    const ordered = preferredInstructorId
      ? membersResult.rows
      : [
          ...rotate(membersResult.rows.filter(member => member.priority_branch)),
          ...rotate(membersResult.rows.filter(member => !member.priority_branch)),
        ];

    for (const member of ordered) {
      const allowedByPriority = selections.every(selection => {
        if (!member.priority_branch_id || String(member.priority_branch_id) === String(context.branch_id)) return true;
        const startTime = normalizeTime(String(selection.time || '').split('-')[0]);
        const weekday = new Date(`${selection.date}T12:00:00`).getDay();
        return !member.allowed_slots.some(slot => Number(slot.weekday) === weekday
          && normalizeTime(slot.startTime || slot.start_time) === startTime);
      });
      if (!allowedByPriority) continue;

      let conflict = false;
      for (const selection of selections) {
        const [startTime, endTime] = String(selection.time || '').split('-').map(normalizeTime);
        const busyResult = await db.query(`
          SELECT 1 FROM (
            SELECT schedule_date,start_time,end_time FROM course_cycle_schedule_assignments
            WHERE instructor_id=$1 AND status='activo'
            UNION ALL
            SELECT schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks
            WHERE instructor_id=$1 AND status='activo'
          ) busy
          WHERE busy.schedule_date=$2::date AND busy.start_time<$4::time AND busy.end_time>$3::time
          LIMIT 1
        `, [member.instructor_id, selection.date, startTime, endTime]);
        const theoryResult = await db.query(`
          SELECT 1 FROM theory_class_schedules theory
          WHERE theory.instructor_id=$1 AND theory.active=TRUE
            AND (theory.class_date=$2::date OR (theory.recurring=TRUE AND (
              (theory.modality='presencial_regular' AND EXTRACT(DOW FROM $2::date) BETWEEN 1 AND 5)
              OR (theory.modality='presencial_sabado' AND EXTRACT(DOW FROM $2::date)=6)
            )))
            AND theory.start_time<$4::time AND theory.end_time>$3::time
          LIMIT 1
        `, [member.instructor_id, selection.date, startTime, endTime]);
        const overrideResult = await db.query(`
          SELECT 1
          FROM instructor_availability_overrides override
          WHERE override.instructor_id=$1
            AND override.schedule_date=$2::date
            AND override.active=TRUE
            AND override.start_time<$4::time
            AND override.end_time>$3::time
            AND ($5::uuid IS NULL OR override.reason NOT LIKE CONCAT('RESERVA_CURSO:',$5::text,':%'))
          LIMIT 1
        `, [member.instructor_id, selection.date, startTime, endTime, reservationId]);
        if (busyResult.rows.length || theoryResult.rows.length || overrideResult.rows.length) {
          conflict = true;
          break;
        }
      }
      if (!conflict) {
        return {
          instructorId: member.instructor_id,
          instructorName: `${member.first_name} ${member.last_name}`.trim(),
          provisional: true,
        };
      }
    }
    return null;
  }

  static async syncPracticalSessions(client, enrollmentId, instructorId, createdBy = null) {
    // Una clase que ya fue asignada en el calendario debe existir en la agenda
    // del instructor para poder generar su QR. El estado de pago se controla en
    // Caja y no debe convertir una asignación académica válida en una clase
    // inexistente para el instructor.
    const result = await client.query(`
      WITH scheduled AS (
        SELECT a.schedule_date, a.start_time, a.end_time,
               ROW_NUMBER() OVER (ORDER BY a.schedule_date, a.start_time)::int AS session_number,
               e.branch_id, e.course_id
        FROM course_cycle_schedule_assignments a
        JOIN enrollments e ON e.id = a.enrollment_id
        WHERE a.enrollment_id = $1 AND a.status = 'activo'
      )
      INSERT INTO practical_sessions (
        enrollment_id, instructor_id, branch_id, recommended_route_id,
        scheduled_start, scheduled_end, session_number, status, created_by
      )
      SELECT
        $1, $2, scheduled.branch_id,
        (
          SELECT tr.id FROM training_routes tr
          WHERE tr.city_id = (SELECT city_id FROM branches WHERE id = scheduled.branch_id)
            AND (tr.course_id = scheduled.course_id OR tr.course_id IS NULL)
            AND tr.recommended_session_number = scheduled.session_number
            AND tr.active = true AND tr.deleted_at IS NULL
          ORDER BY tr.name
          LIMIT 1
        ),
        scheduled.schedule_date + scheduled.start_time,
        scheduled.schedule_date + scheduled.end_time,
        scheduled.session_number,
        'PROGRAMADA',
        $3
      FROM scheduled
      WHERE NOT EXISTS (
        SELECT 1 FROM practical_sessions ps
        WHERE ps.enrollment_id = $1
          AND ps.scheduled_start = scheduled.schedule_date + scheduled.start_time
          AND ps.deleted_at IS NULL
      )
      RETURNING id
    `, [enrollmentId, instructorId, createdBy]);
    return result.rows.length;
  }

  static async reconcilePracticalSessions(client, enrollmentId, instructorId = null, createdBy = null) {
    // Keep instructor agendas and payment inputs aligned with the active
    // academic schedule. Historical/completed classes are preserved.
    await client.query(`
      WITH scheduled AS (
        SELECT a.schedule_date, a.start_time, a.end_time,
               ROW_NUMBER() OVER (ORDER BY a.schedule_date, a.start_time)::int AS session_number,
               a.instructor_id, e.branch_id, e.course_id
        FROM course_cycle_schedule_assignments a
        JOIN enrollments e ON e.id = a.enrollment_id
        WHERE a.enrollment_id = $1 AND a.status = 'activo'
      )
      UPDATE practical_sessions ps
      SET instructor_id = scheduled.instructor_id,
          branch_id = scheduled.branch_id,
          scheduled_end = scheduled.schedule_date + scheduled.end_time,
          session_number = scheduled.session_number,
          recommended_route_id = COALESCE(ps.recommended_route_id, (
            SELECT tr.id FROM training_routes tr
            WHERE tr.city_id = (SELECT city_id FROM branches WHERE id = scheduled.branch_id)
              AND (tr.course_id = scheduled.course_id OR tr.course_id IS NULL)
              AND tr.recommended_session_number = scheduled.session_number
              AND tr.active = true AND tr.deleted_at IS NULL
            ORDER BY tr.name
            LIMIT 1
          )),
          updated_at = NOW()
      FROM scheduled
      WHERE ps.enrollment_id = $1
        AND ps.deleted_at IS NULL
        AND COALESCE(ps.appointment_type, 'PRACTICAL_CLASS') = 'PRACTICAL_CLASS'
        AND UPPER(ps.status) IN ('PROGRAMADA', 'PROXIMA')
        AND ps.scheduled_start = scheduled.schedule_date + scheduled.start_time
        AND (
          ps.instructor_id IS DISTINCT FROM scheduled.instructor_id
          OR ps.branch_id IS DISTINCT FROM scheduled.branch_id
          OR ps.scheduled_end IS DISTINCT FROM scheduled.schedule_date + scheduled.end_time
          OR ps.session_number IS DISTINCT FROM scheduled.session_number
        )
    `, [enrollmentId]);

    await client.query(`
      WITH scheduled AS (
        SELECT a.schedule_date + a.start_time AS scheduled_start
        FROM course_cycle_schedule_assignments a
        WHERE a.enrollment_id = $1 AND a.status = 'activo'
      )
      UPDATE practical_sessions ps
      SET status = 'REPROGRAMADA',
          deleted_at = NOW(),
          cancellation_reason = COALESCE(NULLIF(ps.cancellation_reason, ''), 'Sincronizada con la asignacion academica activa'),
          updated_at = NOW()
      WHERE ps.enrollment_id = $1
        AND ps.deleted_at IS NULL
        AND COALESCE(ps.appointment_type, 'PRACTICAL_CLASS') = 'PRACTICAL_CLASS'
        AND UPPER(ps.status) IN ('PROGRAMADA', 'PROXIMA')
        AND NOT EXISTS (
          SELECT 1 FROM scheduled
          WHERE scheduled.scheduled_start = ps.scheduled_start
        )
    `, [enrollmentId]);

    const result = await client.query(`
      WITH scheduled AS (
        SELECT a.schedule_date, a.start_time, a.end_time,
               ROW_NUMBER() OVER (ORDER BY a.schedule_date, a.start_time)::int AS session_number,
               a.instructor_id, e.branch_id, e.course_id
        FROM course_cycle_schedule_assignments a
        JOIN enrollments e ON e.id = a.enrollment_id
        WHERE a.enrollment_id = $1 AND a.status = 'activo'
      )
      INSERT INTO practical_sessions (
        enrollment_id, instructor_id, branch_id, recommended_route_id,
        scheduled_start, scheduled_end, session_number, status, created_by
      )
      SELECT
        $1, scheduled.instructor_id, scheduled.branch_id,
        (
          SELECT tr.id FROM training_routes tr
          WHERE tr.city_id = (SELECT city_id FROM branches WHERE id = scheduled.branch_id)
            AND (tr.course_id = scheduled.course_id OR tr.course_id IS NULL)
            AND tr.recommended_session_number = scheduled.session_number
            AND tr.active = true AND tr.deleted_at IS NULL
          ORDER BY tr.name
          LIMIT 1
        ),
        scheduled.schedule_date + scheduled.start_time,
        scheduled.schedule_date + scheduled.end_time,
        scheduled.session_number,
        'PROGRAMADA',
        $2
      FROM scheduled
      WHERE scheduled.instructor_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM practical_sessions ps
          WHERE ps.enrollment_id = $1
            AND ps.scheduled_start = scheduled.schedule_date + scheduled.start_time
            AND ps.deleted_at IS NULL
        )
      RETURNING id
    `, [enrollmentId, createdBy]);
    return result.rows.length;
  }

  static async assignForEnrollment(client, enrollmentId, assignedBy = null) {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`cycle-instructor:${enrollmentId}`]);

    const contextResult = await client.query(`
      SELECT e.id AS enrollment_id, e.student_id, e.branch_id, e.course_id,
             s.first_name, s.last_name, cc.id AS cycle_id, cc.code AS cycle_code,
             cc.group_id
      FROM enrollments e
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN course_cycle_schedule_assignments a
        ON a.enrollment_id = e.id AND a.status = 'activo'
      JOIN course_cycles cc ON cc.id = a.cycle_id
      WHERE e.id = $1 AND e.status = 'activo'
      ORDER BY a.schedule_date
      LIMIT 1
      FOR UPDATE OF e
    `, [enrollmentId]);
    if (!contextResult.rows.length) return null;
    const context = contextResult.rows[0];

    const existingResult = await client.query(`
      SELECT eia.*, u.first_name, u.last_name
      FROM enrollment_instructor_assignments eia
      JOIN instructor_profiles ip ON ip.id = eia.instructor_id
      JOIN users u ON u.id = ip.user_id
      WHERE eia.enrollment_id = $1 AND eia.active = true
      LIMIT 1
    `, [enrollmentId]);
    if (existingResult.rows.length) {
      const conflictResult = await client.query(`
        SELECT 1
        FROM course_cycle_schedule_assignments occupied
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id = $2 AND requested.status = 'activo'
         AND occupied.schedule_date = requested.schedule_date
         AND occupied.start_time = requested.start_time
         AND occupied.end_time = requested.end_time
        WHERE occupied.instructor_id = $1
          AND occupied.status = 'activo'
          AND occupied.enrollment_id <> $2
        LIMIT 1
      `, [existingResult.rows[0].instructor_id, enrollmentId]);
      const blockConflictResult = await client.query(`
        SELECT 1
        FROM referred_instructor_schedule_blocks block
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id = $2 AND requested.status = 'activo'
         AND block.schedule_date = requested.schedule_date
         AND block.start_time = requested.start_time
         AND block.end_time = requested.end_time
        WHERE block.instructor_id = $1 AND block.status = 'activo'
          AND block.enrollment_id <> $2
        LIMIT 1
      `, [existingResult.rows[0].instructor_id, enrollmentId]);
      const overrideConflictResult = await client.query(`
        SELECT 1
        FROM instructor_availability_overrides override
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id=$2 AND requested.status='activo'
         AND override.schedule_date=requested.schedule_date
         AND override.start_time<requested.end_time
         AND override.end_time>requested.start_time
        WHERE override.instructor_id=$1 AND override.active=TRUE
          AND NOT EXISTS (
            SELECT 1 FROM course_cycle_seat_reservations own_seat
            WHERE own_seat.enrollment_id=$2 AND own_seat.status='activo'
              AND override.reason LIKE CONCAT('RESERVA_CURSO:',own_seat.id::text,':%')
          )
        LIMIT 1
      `, [existingResult.rows[0].instructor_id, enrollmentId]);
      if (conflictResult.rows.length || blockConflictResult.rows.length || overrideConflictResult.rows.length) {
        throw createError(409, 'El instructor asignado ya está ocupado en ese horario');
      }
      await client.query(`
        UPDATE course_cycle_schedule_assignments
        SET instructor_id = $1, updated_at = NOW()
        WHERE enrollment_id = $2 AND status = 'activo' AND instructor_id IS NULL
      `, [existingResult.rows[0].instructor_id, enrollmentId]);
      await this.reconcilePracticalSessions(
        client,
        enrollmentId,
        existingResult.rows[0].instructor_id,
        assignedBy
      );
      return existingResult.rows[0];
    }

    const schedulesResult = await client.query(`
      SELECT id, schedule_date, start_time, end_time
      FROM course_cycle_schedule_assignments
      WHERE enrollment_id = $1 AND status = 'activo'
      ORDER BY schedule_date
      FOR UPDATE
    `, [enrollmentId]);
    if (!schedulesResult.rows.length) return null;

    const membersResult = await client.query(`
      WITH eligible_members AS (
        SELECT igm.instructor_id, igm.position_order
        FROM instructor_group_members igm
        WHERE igm.group_id=$2 AND igm.active=TRUE AND igm.ended_at IS NULL

        UNION ALL

        SELECT cci.instructor_id, NULL::int AS position_order
        FROM course_cycle_instructors cci
        WHERE cci.cycle_id=$1 AND cci.active=TRUE
          AND NOT EXISTS (
            SELECT 1
            FROM instructor_group_members current_igm
            WHERE current_igm.group_id=$2
              AND current_igm.active=TRUE AND current_igm.ended_at IS NULL
          )
      )
      SELECT ip.id AS instructor_id,
             COALESCE(member.position_order,
               ROW_NUMBER() OVER (ORDER BY u.first_name, u.last_name))::int AS position_order,
             u.first_name, u.last_name,
             CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$3 ELSE u.branch_id=$3 END AS priority_branch,
             priority_rule.branch_id AS priority_branch_id,
             COALESCE(priority_rule.allowed_slots,'[]'::jsonb) AS allowed_slots
      FROM eligible_members member
      JOIN instructor_profiles ip ON ip.id = member.instructor_id
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN LATERAL (SELECT rule.branch_id,rule.allowed_slots FROM instructor_branch_priorities rule
        WHERE rule.instructor_id=ip.id AND rule.assignment_type='priority' AND rule.active=TRUE
          AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
        ORDER BY (rule.branch_id=$3) DESC,rule.updated_at DESC LIMIT 1) priority_rule ON TRUE
      WHERE u.active = true AND ip.deleted_at IS NULL AND ip.status = 'activo'
      ORDER BY (CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$3 ELSE u.branch_id=$3 END) DESC,
        position_order, u.first_name, u.last_name
    `, [context.cycle_id, context.group_id, context.branch_id]);
    if (!membersResult.rows.length) throw createError(409, 'El grupo del curso no tiene instructores activos');

    const firstStart = normalizeTime(schedulesResult.rows[0].start_time);
    const slotIndex = Math.max(0, SLOT_STARTS.indexOf(firstStart));
    const rotate = members => {
      if (!members.length) return [];
      const start = slotIndex % members.length;
      return [...members.slice(start), ...members.slice(0, start)];
    };
    const priorityMembers = membersResult.rows.filter(member => member.priority_branch);
    const cantonMembers = membersResult.rows.filter(member => !member.priority_branch);
    const orderedMembers = [...rotate(priorityMembers), ...rotate(cantonMembers)];

    let selected = null;
    for (const member of orderedMembers) {
      if (member.priority_branch_id && String(member.priority_branch_id) !== String(context.branch_id)) {
        const permitted = Array.isArray(member.allowed_slots) && schedulesResult.rows.every(schedule => !member.allowed_slots.some(slot => {
          const scheduleDate = schedule.schedule_date instanceof Date
            ? schedule.schedule_date : new Date(`${String(schedule.schedule_date).slice(0,10)}T12:00:00`);
          return Number(slot.weekday) === scheduleDate.getDay()
            && String(slot.startTime || slot.start_time).slice(0,5) === normalizeTime(schedule.start_time);
        }));
        if (!permitted) continue;
      }
      const lockKeys = schedulesResult.rows.map(schedule =>
        `instructor-slot:${member.instructor_id}:${normalizeDate(schedule.schedule_date)}:${normalizeTime(schedule.start_time)}:${normalizeTime(schedule.end_time)}`
      ).sort();
      for (const lockKey of lockKeys) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
      }
      const conflictResult = await client.query(`
        SELECT 1
        FROM course_cycle_schedule_assignments occupied
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id = $2 AND requested.status = 'activo'
         AND occupied.schedule_date = requested.schedule_date
         AND occupied.start_time = requested.start_time
         AND occupied.end_time = requested.end_time
        WHERE occupied.instructor_id = $1
          AND occupied.status = 'activo'
          AND occupied.enrollment_id <> $2
        LIMIT 1
      `, [member.instructor_id, enrollmentId]);
      const blockConflictResult = await client.query(`
        SELECT 1
        FROM referred_instructor_schedule_blocks block
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id = $2 AND requested.status = 'activo'
         AND block.schedule_date = requested.schedule_date
         AND block.start_time = requested.start_time
         AND block.end_time = requested.end_time
        WHERE block.instructor_id = $1 AND block.status = 'activo'
          AND block.enrollment_id <> $2
        LIMIT 1
      `, [member.instructor_id, enrollmentId]);
      const theoryConflictResult = await client.query(`SELECT 1 FROM theory_class_schedules theory
        JOIN course_cycle_schedule_assignments requested ON requested.enrollment_id=$2 AND requested.status='activo'
          AND (theory.class_date=requested.schedule_date OR (theory.recurring=TRUE AND (
            (theory.modality='presencial_regular' AND EXTRACT(DOW FROM requested.schedule_date) BETWEEN 1 AND 5)
            OR (theory.modality='presencial_sabado' AND EXTRACT(DOW FROM requested.schedule_date)=6)
          ))) AND theory.start_time<requested.end_time AND theory.end_time>requested.start_time
        WHERE theory.instructor_id=$1 AND theory.active=TRUE LIMIT 1`,[member.instructor_id,enrollmentId]);
      const overrideConflictResult = await client.query(`
        SELECT 1
        FROM instructor_availability_overrides override
        JOIN course_cycle_schedule_assignments requested
          ON requested.enrollment_id=$2 AND requested.status='activo'
         AND override.schedule_date=requested.schedule_date
         AND override.start_time<requested.end_time
         AND override.end_time>requested.start_time
        WHERE override.instructor_id=$1 AND override.active=TRUE
          AND NOT EXISTS (
            SELECT 1 FROM course_cycle_seat_reservations own_seat
            WHERE own_seat.enrollment_id=$2 AND own_seat.status='activo'
              AND override.reason LIKE CONCAT('RESERVA_CURSO:',own_seat.id::text,':%')
          )
        LIMIT 1
      `, [member.instructor_id, enrollmentId]);
      if (!conflictResult.rows.length && !blockConflictResult.rows.length
        && !theoryConflictResult.rows.length && !overrideConflictResult.rows.length) {
        selected = member;
        break;
      }
    }
    if (!selected) throw createError(409, `No hay instructor disponible para el horario ${firstStart}`);

    await client.query(`
      UPDATE course_cycle_schedule_assignments
      SET instructor_id = $1, updated_at = NOW()
      WHERE enrollment_id = $2 AND status = 'activo'
    `, [selected.instructor_id, enrollmentId]);

    const assignmentResult = await client.query(`
      INSERT INTO enrollment_instructor_assignments (
        enrollment_id, instructor_id, assigned_by, active, observations
      ) VALUES ($1, $2, $3, true, $4)
      RETURNING *
    `, [
      enrollmentId,
      selected.instructor_id,
      assignedBy,
      `Asignación automática rotativa en ${context.cycle_code}`,
    ]);

    await client.query(`
      INSERT INTO history (student_id, action)
      VALUES ($1, $2)
    `, [
      context.student_id,
      `Instructor asignado automáticamente: ${selected.first_name} ${selected.last_name} (${context.cycle_code}, ${firstStart})`,
    ]);
    await this.reconcilePracticalSessions(client, enrollmentId, selected.instructor_id, assignedBy);

    return {
      ...assignmentResult.rows[0],
      first_name: selected.first_name,
      last_name: selected.last_name,
    };
  }
}

module.exports = CycleInstructorAssignmentService;
