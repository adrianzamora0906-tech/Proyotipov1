const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const AutomaticCycleService = require('./AutomaticCycleService');

const WEEKDAY_NAMES = {
  0: 'Domingo',
  1: 'Lunes',
  2: 'Martes',
  3: 'Miercoles',
  4: 'Jueves',
  5: 'Viernes',
  6: 'Sabado',
};

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function nextWeekdaySlotDate(fromDate, weekday) {
  const date = new Date(fromDate);
  date.setHours(12, 0, 0, 0);
  const jsTarget = weekday === 7 ? 0 : weekday;
  let diff = jsTarget - date.getDay();
  if (diff < 0) diff += 7;
  date.setDate(date.getDate() + diff);
  return date;
}

function combineDateTime(date, time) {
  return `${toDateString(date)} ${time}`;
}

class InstructorAdminService {
  static async resolveScheduleBranchId(branchId) {
    if (!branchId) return null;
    const result = await db.query(`
      SELECT COALESCE(reference.id, current.id) AS schedule_branch_id
      FROM branches current
      LEFT JOIN branches reference
        ON current.code = 'SP_IC2'
       AND reference.code = 'SP_IC1'
       AND reference.city_id = current.city_id
       AND reference.active = TRUE
      WHERE current.id = $1
      LIMIT 1
    `, [branchId]);
    return result.rows[0]?.schedule_branch_id || branchId;
  }

  static async getAvailabilityOverrides(user, instructorId, startDate, endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      throw createError(422, 'El periodo de disponibilidad es invalido');
    }
    const result = await db.query(`
      SELECT o.schedule_date, to_char(o.start_time, 'HH24:MI') AS start_time,
             to_char(o.end_time, 'HH24:MI') AS end_time, o.status, o.reason, o.reason_type
      FROM instructor_availability_overrides o
      JOIN instructor_profiles ip ON ip.id = o.instructor_id
      JOIN users u ON u.id = ip.user_id
      WHERE o.instructor_id = $1 AND o.active = TRUE
        AND (u.branch_id = $2 OR EXISTS (
          SELECT 1 FROM instructor_branch_priorities access_priority
          WHERE access_priority.instructor_id=o.instructor_id AND access_priority.branch_id=$2
            AND access_priority.assignment_type='priority' AND access_priority.active=TRUE
            AND access_priority.effective_from<=CURRENT_DATE
            AND (access_priority.effective_until IS NULL OR access_priority.effective_until>=CURRENT_DATE)
        ))
        AND o.schedule_date BETWEEN $3::date AND $4::date
      ORDER BY o.schedule_date, o.start_time
    `, [instructorId, user.branch_id, startDate, endDate]);
    return result.rows;
  }

  static async saveAvailabilityOverrides(user, instructorId, overrides, startDate, endDate, scope = 'daily', slots = []) {
    if (!Array.isArray(overrides)) throw createError(422, 'La disponibilidad debe ser una lista');
    if (!['daily', 'permanent'].includes(scope)) throw createError(422, 'El alcance de disponibilidad es invalido');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(endDate))) {
      throw createError(422, 'El periodo de disponibilidad es invalido');
    }
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const instructor = await client.query(`
        SELECT ip.id FROM instructor_profiles ip JOIN users u ON u.id = ip.user_id
        WHERE ip.id = $1 AND u.active = TRUE AND ip.deleted_at IS NULL
          AND (u.branch_id = $2 OR EXISTS (
            SELECT 1 FROM instructor_branch_priorities access_priority
            WHERE access_priority.instructor_id=ip.id AND access_priority.branch_id=$2
              AND access_priority.assignment_type='priority' AND access_priority.active=TRUE
              AND access_priority.effective_from<=CURRENT_DATE
              AND (access_priority.effective_until IS NULL OR access_priority.effective_until>=CURRENT_DATE)
          ))
      `, [instructorId, user.branch_id]);
      if (!instructor.rows.length) throw createError(404, 'Instructor no disponible para esta sucursal');
      const normalizedOverrides = overrides.map(override => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(override.date)) || !/^\d{2}:\d{2}$/.test(String(override.startTime)) || !/^\d{2}:\d{2}$/.test(String(override.endTime))) {
          throw createError(422, 'Fecha u horario de disponibilidad invalido');
        }
        const reasonType = ['transport', 'occupied', 'other'].includes(override.reasonType)
          ? override.reasonType
          : 'occupied';
        const reason = String(override.reason || '').trim().slice(0, 180) || null;
        if (reasonType === 'other' && !reason) throw createError(422, 'Debes especificar el otro motivo');
        const date = new Date(`${override.date}T12:00:00`);
        return { ...override, reasonType, reason, weekday: date.getDay() };
      });

      if (scope === 'permanent') {
        if (!Array.isArray(slots) || !slots.length) throw createError(422, 'No hay bloques permanentes para actualizar');
        const blockedKeys = new Set(normalizedOverrides.map(override => (
          `${override.weekday}:${override.startTime}:${override.endTime}`
        )));
        const reasonsByKey = new Map(normalizedOverrides.map(override => ([
          `${override.weekday}:${override.startTime}:${override.endTime}`,
          override,
        ])));
        const editableKeys = new Set(slots.map(slot => {
          if (!Number.isInteger(Number(slot.weekday)) || Number(slot.weekday) < 1 || Number(slot.weekday) > 5
            || !/^\d{2}:\d{2}$/.test(String(slot.startTime)) || !/^\d{2}:\d{2}$/.test(String(slot.endTime))) {
            throw createError(422, 'Bloque permanente invalido');
          }
          return `${Number(slot.weekday)}:${slot.startTime}:${slot.endTime}`;
        }));
        const configured = await client.query(`
          SELECT weekday,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time
          FROM instructor_availability
          WHERE instructor_id=$1
          FOR UPDATE
        `, [instructorId]);
        for (const slot of configured.rows) {
          const key = `${slot.weekday}:${slot.start_time}:${slot.end_time}`;
          if (!editableKeys.has(key)) continue;
          const active = !blockedKeys.has(key);
          await client.query(`
            UPDATE instructor_availability
            SET active=$5,reason_type=$6,unavailable_reason=$7,updated_at=NOW()
            WHERE instructor_id=$1 AND weekday=$2 AND start_time=$3::time AND end_time=$4::time
          `, [
            instructorId,
            slot.weekday,
            slot.start_time,
            slot.end_time,
            active,
            active ? null : reasonsByKey.get(key)?.reasonType || 'occupied',
            active ? null : reasonsByKey.get(key)?.reason || null,
          ]);
        }
        await client.query(`
          INSERT INTO audit_logs (user_id,role,branch_id,action,entity,entity_id,metadata)
          VALUES($1,$2,$3,'INSTRUCTOR_AVAILABILITY_PERMANENT','instructor_profiles',$4,$5)
        `, [user.id, user.role, user.branch_id, instructorId, {
          startDate,
          endDate,
          blockedSlots: [...blockedKeys],
          reasons: [...reasonsByKey.entries()].map(([key, value]) => ({
            key,
            reasonType: value.reasonType,
            reason: value.reason,
          })),
        }]);
        await client.query('COMMIT');
        return { updated: editableKeys.size, scope };
      }

      await client.query(`
        UPDATE instructor_availability_overrides
        SET active=FALSE,updated_by=$2,updated_at=NOW()
        WHERE instructor_id=$1 AND active=TRUE AND status='blocked'
          AND schedule_date BETWEEN $3::date AND $4::date
      `, [instructorId, user.id, startDate, endDate]);
      for (const override of normalizedOverrides) {
        const status = override.status === 'reserved' ? 'reserved' : 'blocked';
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `instructor-slot:${instructorId}:${override.date}:${override.startTime}:${override.endTime}`,
        ]);
        await client.query(`
          INSERT INTO instructor_availability_overrides
            (instructor_id,schedule_date,start_time,end_time,status,reason,reason_type,active,created_by,updated_by,updated_at)
          VALUES ($1,$2,$3::time,$4::time,$5,$6,$7,TRUE,$8,$8,NOW())
          ON CONFLICT (instructor_id,schedule_date,start_time,end_time) DO UPDATE SET
            status=CASE WHEN instructor_availability_overrides.status='reserved' THEN 'reserved' ELSE EXCLUDED.status END,
            reason=CASE WHEN instructor_availability_overrides.status='reserved' THEN instructor_availability_overrides.reason ELSE EXCLUDED.reason END,
            reason_type=CASE WHEN instructor_availability_overrides.status='reserved' THEN instructor_availability_overrides.reason_type ELSE EXCLUDED.reason_type END,
            active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()
        `, [instructorId, override.date, override.startTime, override.endTime, status, override.reason, override.reasonType, user.id]);
      }
      await client.query(`
        INSERT INTO audit_logs (user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,'INSTRUCTOR_AVAILABILITY_DAILY','instructor_profiles',$4,$5)
      `, [user.id, user.role, user.branch_id, instructorId, {
        startDate,
        endDate,
        blockedSlots: normalizedOverrides.length,
        reasons: normalizedOverrides.map(override => ({
          date: override.date,
          startTime: override.startTime,
          endTime: override.endTime,
          reasonType: override.reasonType,
          reason: override.reason,
        })),
      }]);
      await client.query('COMMIT');
      return { updated: normalizedOverrides.length, scope };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  static async reserveCalendarSeat(user, instructorId, data = {}) {
    const cycleId = data.cycleId;
    const date = String(data.date || '');
    const startTime = String(data.startTime || '');
    const endTime = String(data.endTime || '');
    const referredName = String(data.referredName || '').trim().slice(0, 160);
    const referredIdentification = String(data.referredIdentification || '').replace(/\D/g, '').slice(0, 30) || null;
    const notes = String(data.notes || '').trim().slice(0, 240) || null;
    if (!cycleId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
      throw createError(422, 'Selecciona un horario valido para reservar');
    }
    if (!referredName) throw createError(422, 'El nombre de la persona es requerido');

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const scheduleBranchId = await this.resolveScheduleBranchId(user.branch_id);
      const cycle = (await client.query(`
        SELECT cc.id,cc.course_id,cc.branch_id,cc.start_date,cc.end_date,cc.modality,cc.code
        FROM course_cycles cc
        WHERE cc.id=$1 AND cc.active=TRUE AND cc.deleted_at IS NULL
          AND cc.status IN ('activo','proximo','por_terminar')
          AND cc.branch_id=$2
        FOR UPDATE
      `, [cycleId, scheduleBranchId])).rows[0];
      if (!cycle) throw createError(404, 'El curso seleccionado no esta disponible para reservar');

      const instructor = await client.query(`
        SELECT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
        WHERE ip.id=$1 AND u.active=TRUE AND ip.deleted_at IS NULL
          AND (u.branch_id=$2 OR EXISTS (
            SELECT 1 FROM instructor_branch_priorities priority
            WHERE priority.instructor_id=ip.id AND priority.branch_id=$2
              AND priority.assignment_type='priority' AND priority.active=TRUE
              AND priority.effective_from<=CURRENT_DATE
              AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
          ))
      `, [instructorId, scheduleBranchId]);
      if (!instructor.rows.length) throw createError(404, 'Instructor no disponible para esta sucursal');

      const belongs = await client.query(`
        SELECT 1 FROM course_cycle_instructors
        WHERE cycle_id=$1 AND instructor_id=$2 AND active=TRUE
      `, [cycle.id, instructorId]);
      if (!belongs.rowCount) throw createError(422, 'El instructor no pertenece a este curso');

      const dates = (await client.query(`
        SELECT day::date schedule_date
        FROM generate_series($1::date,$2::date,INTERVAL '1 day') day
        WHERE EXISTS (
          SELECT 1
          FROM instructor_availability ia
          WHERE ia.instructor_id=$3
            AND ia.weekday=EXTRACT(DOW FROM day)::integer
            AND ia.start_time=$4::time
            AND ia.end_time=$5::time
            AND ia.active=TRUE
        )
        ORDER BY day
      `, [cycle.start_date, cycle.end_date, instructorId, startTime, endTime])).rows.map(row => toDateString(new Date(row.schedule_date)));
      if (!dates.length) throw createError(422, 'El curso no tiene fechas para ese horario');
      if (!dates.includes(date)) throw createError(422, 'El horario seleccionado no esta activo en esa fecha');

      for (const scheduleDate of dates) {
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `instructor-slot:${instructorId}:${scheduleDate}:${startTime}:${endTime}`,
        ]);
        const busy = await client.query(`
          SELECT 1 FROM (
            SELECT instructor_id,schedule_date,start_time,end_time FROM course_cycle_schedule_assignments WHERE status='activo'
            UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks WHERE status='activo'
            UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM instructor_availability_overrides WHERE active=TRUE
          ) occupied
          WHERE instructor_id=$1 AND schedule_date=$2::date AND start_time<$4::time AND end_time>$3::time
          LIMIT 1
        `, [instructorId, scheduleDate, startTime, endTime]);
        if (busy.rowCount) throw createError(409, `El horario ${scheduleDate} ${startTime}-${endTime} ya no esta disponible`);
      }

      const reservation = (await client.query(`
        INSERT INTO course_cycle_seat_reservations
          (cycle_id,instructor_id,referred_name,referred_identification,course_id,branch_id,reserved_start_time,reserved_end_time,notes,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::time,$8::time,$9,$10)
        RETURNING *
      `, [cycle.id, instructorId, referredName, referredIdentification, cycle.course_id, cycle.branch_id, startTime, endTime, notes, user.id])).rows[0];

      for (const scheduleDate of dates) {
        await client.query(`
          INSERT INTO instructor_availability_overrides
            (instructor_id,schedule_date,start_time,end_time,status,reason,active,created_by,updated_by)
          VALUES($1,$2::date,$3::time,$4::time,'reserved',$5,TRUE,$6,$6)
          ON CONFLICT(instructor_id,schedule_date,start_time,end_time) DO UPDATE
          SET status='reserved',reason=EXCLUDED.reason,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()
        `, [instructorId, scheduleDate, startTime, endTime, `RESERVA_CURSO:${reservation.id}:${cycle.id}`, user.id]);
      }

      await client.query(`
        INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,'INSTRUCTOR_CALENDAR_SEAT_RESERVED','course_cycle_seat_reservations',$4,$5::jsonb)
      `, [user.id, user.role, cycle.branch_id, reservation.id, JSON.stringify({
        cycleId: cycle.id,
        instructorId,
        startTime,
        endTime,
        dates,
      })]);
      await client.query('COMMIT');
      return reservation;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }

  static async applyDueGroupAssignments(user) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const pending = await client.query(`
        SELECT pending.instructor_id, pending.group_id
        FROM instructor_group_pending_assignments pending
        JOIN instructor_profiles ip ON ip.id = pending.instructor_id
        JOIN users u ON u.id = ip.user_id
        WHERE pending.active = TRUE
          AND pending.effective_from <= CURRENT_DATE
          AND u.branch_id = $1
        FOR UPDATE OF pending
      `, [user.branch_id]);
      for (const assignment of pending.rows) {
        await client.query(`
          UPDATE instructor_group_members
          SET active = FALSE, ended_at = CURRENT_DATE, updated_at = NOW()
          WHERE instructor_id = $1 AND active = TRUE
        `, [assignment.instructor_id]);
        if (assignment.group_id) {
          const position = await client.query(`
            SELECT COALESCE(MAX(position_order), -1) + 1 AS next_position
            FROM instructor_group_members
            WHERE group_id = $1 AND active = TRUE
          `, [assignment.group_id]);
          await client.query(`
            INSERT INTO instructor_group_members
              (group_id, instructor_id, position_order, active, joined_at, ended_at, updated_at)
            VALUES ($1, $2, $3, TRUE, CURRENT_DATE, NULL, NOW())
            ON CONFLICT (group_id, instructor_id) DO UPDATE SET
              position_order = EXCLUDED.position_order,
              active = TRUE,
              ended_at = NULL,
              updated_at = NOW()
          `, [assignment.group_id, assignment.instructor_id, position.rows[0].next_position]);
        }
        await client.query(`
          UPDATE instructor_group_pending_assignments
          SET active = FALSE, updated_at = NOW()
          WHERE instructor_id = $1 AND active = TRUE
        `, [assignment.instructor_id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getMonthlyPerformanceReport(user, instructorId, month) {
    const summary = await this.getMonthlyPerformance(user, instructorId, month);
    const selectedMonth = `${summary.month}-01`;
    const result = await db.query(`
      SELECT ps.id, ps.actual_start, ps.actual_end,
        ROUND((EXTRACT(EPOCH FROM (ps.actual_end - ps.actual_start)) / 3600)::numeric, 2) AS taught_hours,
        c.name AS course_name, cc.code AS cycle_code,
        cc.start_date AS cycle_start, cc.end_date AS cycle_end,
        s.id AS student_id, CONCAT(s.first_name, ' ', s.last_name) AS student_name,
        CASE WHEN LOWER(c.name) LIKE '%moto%' THEN 'MOTO' ELSE 'AUTO' END AS course_type
      FROM practical_sessions ps
      JOIN enrollments e ON e.id = ps.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      JOIN LATERAL (
        SELECT cycle.id, cycle.code, cycle.start_date, cycle.end_date
        FROM course_cycle_schedule_assignments a
        JOIN course_cycles cycle ON cycle.id = a.cycle_id
        WHERE a.enrollment_id = ps.enrollment_id
          AND a.instructor_id = ps.instructor_id
          AND a.schedule_date = ps.scheduled_start::date
          AND cycle.start_date >= $2::date
          AND cycle.start_date < ($2::date + INTERVAL '1 month')
        LIMIT 1
      ) cc ON TRUE
      WHERE ps.instructor_id = $1 AND ps.deleted_at IS NULL
        AND ps.actual_start IS NOT NULL AND ps.actual_end IS NOT NULL
        AND ps.actual_end >= ps.actual_start
        AND LOWER(COALESCE(ps.attendance_status, '')) IN ('asistio', 'asistió')
      ORDER BY ps.actual_start, student_name
    `, [instructorId, selectedMonth]);

    const rows = result.rows.map(row => ({
      ...row,
      taught_hours: Number(row.taught_hours || 0),
    }));
    const totals = rows.reduce((acc, row) => {
      acc.taughtHours += row.taught_hours;
      acc.autoHours += row.course_type === 'AUTO' ? row.taught_hours : 0;
      acc.motoHours += row.course_type === 'MOTO' ? row.taught_hours : 0;
      acc.students.add(row.student_id);
      return acc;
    }, { taughtHours: 0, autoHours: 0, motoHours: 0, students: new Set() });

    const grouped = new Map();
    for (const row of rows) {
      const date = new Date(row.actual_start).toISOString().slice(0, 10);
      const cycleKey = row.cycle_code || `SIN-CICLO-${row.course_name}`;
      if (!grouped.has(cycleKey)) grouped.set(cycleKey, {
        cycleCode: row.cycle_code || 'Sin ciclo', courseName: row.course_name,
        courseType: row.course_type, startDate: row.cycle_start, endDate: row.cycle_end, days: new Map(), sessions: [],
      });
      const cycle = grouped.get(cycleKey);
      cycle.sessions.push(row);
      if (!cycle.days.has(date)) cycle.days.set(date, {
        date, students: new Map(), completedClasses: 0, taughtHours: 0,
        firstStart: row.actual_start, lastEnd: row.actual_end,
      });
      const day = cycle.days.get(date);
      day.students.set(row.student_id, row.student_name);
      day.completedClasses += 1;
      day.taughtHours += row.taught_hours;
      if (new Date(row.actual_start) < new Date(day.firstStart)) day.firstStart = row.actual_start;
      if (new Date(row.actual_end) > new Date(day.lastEnd)) day.lastEnd = row.actual_end;
    }
    const courseGroups = [...grouped.values()].map(cycle => ({
      ...cycle,
      days: [...cycle.days.values()].map(day => ({
        ...day,
        students: [...day.students.values()],
        taughtHours: Number(day.taughtHours.toFixed(2)),
      })),
    }));

    return {
      ...summary,
      rows,
      courseGroups,
      reportTotals: {
        completedClasses: rows.length,
        attendedStudents: totals.students.size,
        taughtHours: Number(totals.taughtHours.toFixed(2)),
        autoHours: Number(totals.autoHours.toFixed(2)),
        motoHours: Number(totals.motoHours.toFixed(2)),
      },
    };
  }

  static async getMonthlyPerformance(user, instructorId, month) {
    const selectedMonth = /^\d{4}-\d{2}$/.test(String(month || ''))
      ? `${month}-01`
      : new Date().toISOString().slice(0, 7) + '-01';
    const instructorResult = await db.query(`
      SELECT ip.id, u.first_name, u.last_name, u.branch_id, b.name AS branch_name
      FROM instructor_profiles ip
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ip.id = $1 AND u.active = true AND ip.deleted_at IS NULL
    `, [instructorId]);
    if (!instructorResult.rows.length) throw createError(404, 'Instructor no encontrado');
    const instructor = instructorResult.rows[0];
    if (user.branch_id && instructor.branch_id !== user.branch_id) {
      throw createError(403, 'No puedes consultar instructores de otra sucursal');
    }

    const cycles = await db.query(`
      WITH month_range AS (
        SELECT $2::date AS starts_at, ($2::date + INTERVAL '1 month') AS ends_at
      ), assigned AS (
        SELECT DISTINCT a.cycle_id, a.enrollment_id, a.student_id
        FROM course_cycle_schedule_assignments a
        JOIN course_cycles selected_cycle ON selected_cycle.id = a.cycle_id, month_range mr
        WHERE a.instructor_id = $1 AND a.status = 'activo'
          AND selected_cycle.start_date >= mr.starts_at AND selected_cycle.start_date < mr.ends_at
      ), attendance AS (
        SELECT cycle_match.cycle_id, ps.enrollment_id,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(ps.attendance_status, '')) IN ('asistio','asistiÃ³'))::int AS attended_sessions,
          COUNT(*)::int AS scheduled_sessions
        FROM practical_sessions ps
        JOIN LATERAL (
          SELECT a.cycle_id
          FROM course_cycle_schedule_assignments a
          WHERE a.enrollment_id = ps.enrollment_id
            AND a.schedule_date = ps.scheduled_start::date
          LIMIT 1
        ) cycle_match ON true
        JOIN course_cycles selected_cycle ON selected_cycle.id = cycle_match.cycle_id, month_range mr
        WHERE ps.instructor_id = $1 AND ps.deleted_at IS NULL
          AND selected_cycle.start_date >= mr.starts_at AND selected_cycle.start_date < mr.ends_at
        GROUP BY cycle_match.cycle_id, ps.enrollment_id
      )
      SELECT cc.id AS cycle_id, cc.code AS cycle_code, cc.start_date, cc.end_date,
        cc.modality, c.name AS course_name,
        COUNT(DISTINCT assigned.student_id)::int AS assigned_students,
        COUNT(DISTINCT attendance.enrollment_id) FILTER (WHERE attendance.attended_sessions > 0)::int AS attended_students,
        COALESCE(SUM(attendance.attended_sessions), 0)::int AS attendance_count,
        COALESCE(SUM(attendance.scheduled_sessions), 0)::int AS scheduled_sessions
      FROM assigned
      JOIN course_cycles cc ON cc.id = assigned.cycle_id
      JOIN courses c ON c.id = cc.course_id
      LEFT JOIN attendance ON attendance.cycle_id = assigned.cycle_id AND attendance.enrollment_id = assigned.enrollment_id
      GROUP BY cc.id, c.id
      ORDER BY cc.start_date DESC, c.name
    `, [instructorId, selectedMonth]);

    const transportResult = await db.query(`
      SELECT CASE WHEN EXISTS (
        SELECT 1 FROM instructor_availability_overrides availability_override
        WHERE availability_override.instructor_id=$1
          AND availability_override.active=TRUE
          AND availability_override.status='blocked'
          AND availability_override.reason_type='transport'
          AND availability_override.schedule_date >= $2::date
          AND availability_override.schedule_date < ($2::date + INTERVAL '1 month')
        UNION ALL
        SELECT 1 FROM instructor_availability weekly_availability
        WHERE weekly_availability.instructor_id=$1
          AND weekly_availability.active=FALSE
          AND weekly_availability.reason_type='transport'
      ) THEN 1 ELSE 0 END::int AS transport_students
    `, [instructorId, selectedMonth]);
    const transportStudents = Number(transportResult.rows[0]?.transport_students || 0);

    const totals = cycles.rows.reduce((summary, cycle) => ({
      courses: summary.courses + 1,
      assignedStudents: summary.assignedStudents + Number(cycle.assigned_students || 0),
      attendedStudents: summary.attendedStudents + Number(cycle.attended_students || 0),
      attendanceCount: summary.attendanceCount + Number(cycle.attendance_count || 0),
    }), { courses: 0, assignedStudents: transportStudents, attendedStudents: 0, attendanceCount: 0 });
    totals.transportStudents = transportStudents;

    return {
      month: selectedMonth.slice(0, 7),
      instructor: { id: instructor.id, name: `${instructor.first_name} ${instructor.last_name}`, branch: instructor.branch_name },
      totals,
      cycles: cycles.rows,
    };
  }

  static async listInstructors(user, filters = {}) {
    await this.applyDueGroupAssignments(user);
    const params = [];
    let where = `u.role = 'instructor' AND u.active = true AND ip.deleted_at IS NULL`;

    // REGLA PROTEGIDA: Shopin es un punto operativo de Flavio Reyes para la
    // pantalla de horarios; comparte instructores, grupos y cursos académicos.
    const requestedBranchId = filters.branch_id || user.branch_id;
    const branchId = await this.resolveScheduleBranchId(requestedBranchId);
    let branchParameter = null;
    if (branchId) {
      params.push(branchId);
      branchParameter = params.length;
      // Un instructor puede estar registrado administrativamente en otra sede,
      // pero ser prioritario en la sucursal que está consultando el usuario.
      // En ese caso debe aparecer aquí sin traer al resto del personal del cantón.
      where += ` AND (
        u.branch_id = $${branchParameter}
        OR EXISTS (
          SELECT 1
          FROM instructor_branch_priorities scoped_priority
          WHERE scoped_priority.instructor_id = ip.id
            AND scoped_priority.branch_id = $${branchParameter}
            AND scoped_priority.assignment_type = 'priority'
            AND scoped_priority.active = TRUE
            AND scoped_priority.effective_from <= CURRENT_DATE
            AND (scoped_priority.effective_until IS NULL OR scoped_priority.effective_until >= CURRENT_DATE)
        )
      )`;
    }

    if (filters.practice_area) {
      params.push(filters.practice_area);
      const practiceAreaParameter = params.length;
      // En una sucursal prioritaria, la especialidad de esa asignación manda
      // sobre el perfil administrativo/original del instructor.
      const effectiveArea = branchParameter
        ? `COALESCE((SELECT scoped_type.practice_area FROM instructor_branch_priorities scoped_type
            WHERE scoped_type.instructor_id=ip.id AND scoped_type.branch_id=$${branchParameter}
              AND scoped_type.assignment_type='priority' AND scoped_type.active=TRUE
              AND scoped_type.effective_from<=CURRENT_DATE
              AND (scoped_type.effective_until IS NULL OR scoped_type.effective_until>=CURRENT_DATE)
            LIMIT 1), ip.practice_area)`
        : 'ip.practice_area';
      where += ` AND (${effectiveArea}='mixto' OR ${effectiveArea}=$${practiceAreaParameter})`;
    }

    const result = await db.query(`
      SELECT ip.id, ip.user_id, ip.license_number, ip.instructor_type, ip.specialty, ip.practice_area, ip.weekend_practice_area, ip.status,
             u.first_name, u.last_name, u.email, u.phone, u.branch_id, b.name AS branch_name,
             priority_rule.branch_id AS priority_branch_id,
             priority_rule.branch_name AS priority_branch_name,
             COALESCE(json_agg(DISTINCT jsonb_build_object('id', ig.id, 'code', ig.code, 'name', ig.name))
               FILTER (WHERE ig.id IS NOT NULL), '[]') AS groups,
             COALESCE(json_agg(DISTINCT jsonb_build_object(
               'weekday', ia.weekday,
               'day', CASE ia.weekday
                 WHEN 1 THEN 'Lunes'
                 WHEN 2 THEN 'Martes'
                 WHEN 3 THEN 'Miercoles'
                 WHEN 4 THEN 'Jueves'
                 WHEN 5 THEN 'Viernes'
               END,
               'startTime', to_char(ia.start_time, 'HH24:MI'),
               'endTime', to_char(ia.end_time, 'HH24:MI')
             )) FILTER (WHERE ia.id IS NOT NULL), '[]') AS availability,
             COALESCE(json_agg(DISTINCT jsonb_build_object('id', c.id, 'name', c.name))
               FILTER (WHERE c.id IS NOT NULL), '[]') AS courses
      FROM instructor_profiles ip
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN branches b ON b.id = u.branch_id
      LEFT JOIN instructor_availability ia ON ia.instructor_id = ip.id AND ia.active = true
      LEFT JOIN instructor_course_capabilities icc ON icc.instructor_id = ip.id AND icc.active = true
      LEFT JOIN courses c ON c.id = icc.course_id
      LEFT JOIN instructor_group_members igm ON igm.instructor_id = ip.id AND igm.active = true
      LEFT JOIN instructor_groups ig ON ig.id = igm.group_id
        AND ig.active = true AND ig.deleted_at IS NULL AND ig.branch_id = ${branchParameter ? `$${branchParameter}` : 'u.branch_id'}
      LEFT JOIN LATERAL (
        SELECT ibp.branch_id, priority_branch.name AS branch_name, ibp.practice_area
        FROM instructor_branch_priorities ibp
        JOIN branches priority_branch ON priority_branch.id = ibp.branch_id
        WHERE ibp.instructor_id = ip.id
          AND ibp.assignment_type = 'priority'
          AND ibp.active = TRUE
          AND ibp.effective_from <= CURRENT_DATE
          AND (ibp.effective_until IS NULL OR ibp.effective_until >= CURRENT_DATE)
        LIMIT 1
      ) priority_rule ON TRUE
      WHERE ${where}
      GROUP BY ip.id, u.id, b.name, priority_rule.branch_id, priority_rule.branch_name, priority_rule.practice_area
      ORDER BY u.first_name, u.last_name
    `, params);

    const priorityRows = branchId && result.rows.length ? await db.query(`
      SELECT instructor_id, allowed_slots, practice_area
      FROM instructor_branch_priorities
      WHERE branch_id = $1
        AND instructor_id = ANY($2::uuid[])
        AND assignment_type = 'priority'
        AND active = TRUE
        AND effective_from <= CURRENT_DATE
        AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
    `, [branchId, result.rows.map(row => row.id)]) : { rows: [] };
    const priorityByInstructor = new Map(
      priorityRows.rows.map(row => [String(row.instructor_id), {
        slots: Array.isArray(row.allowed_slots) ? row.allowed_slots : [],
        practiceArea: row.practice_area || null,
      }])
    );
    const availableHoursResult = result.rows.length ? await db.query(`
      WITH selected_cycles AS (
        SELECT DISTINCT ON (member.instructor_id)
          member.instructor_id, cc.id AS cycle_id, cc.start_date, cc.end_date
        FROM course_cycles cc
        CROSS JOIN LATERAL (
          SELECT cci.instructor_id
          FROM course_cycle_instructors cci
          WHERE cci.cycle_id = cc.id AND cci.active = TRUE
          UNION
          SELECT igm.instructor_id
          FROM instructor_group_members igm
          WHERE igm.group_id = cc.group_id AND igm.active = TRUE AND igm.ended_at IS NULL
        ) member
        LEFT JOIN LATERAL (
          SELECT priority.branch_id
          FROM instructor_branch_priorities priority
          WHERE priority.instructor_id = member.instructor_id
            AND priority.assignment_type = 'priority'
            AND priority.active = TRUE
            AND priority.effective_from <= CURRENT_DATE
            AND (priority.effective_until IS NULL OR priority.effective_until >= CURRENT_DATE)
          ORDER BY priority.updated_at DESC
          LIMIT 1
        ) effective_priority ON TRUE
        -- Si el instructor pertenece administrativamente a esta sede pero está
        -- priorizado en otra, la tarjeta resume su ciclo operativo real.
        WHERE cc.branch_id = COALESCE(effective_priority.branch_id, $1)
          AND cc.active = TRUE AND cc.deleted_at IS NULL
          AND cc.status IN ('activo', 'proximo', 'por_terminar')
          AND cc.modality = 'normal'
          -- Las tarjetas deben resumir el mismo próximo curso que abre el
          -- calendario, no un curso anterior que todavía siga activo.
          AND cc.end_date >= CURRENT_DATE
          AND member.instructor_id = ANY($2::uuid[])
        ORDER BY member.instructor_id,
          CASE WHEN cc.start_date >= CURRENT_DATE THEN 0 ELSE 1 END,
          cc.start_date ASC, cc.code ASC
      ), configured AS (
        SELECT selected.instructor_id, selected.cycle_id, dates::date AS schedule_date,
               ia.start_time, ia.end_time
        FROM selected_cycles selected
        CROSS JOIN LATERAL generate_series(selected.start_date, selected.end_date, INTERVAL '1 day') dates
        JOIN instructor_availability ia
          ON ia.instructor_id = selected.instructor_id AND ia.active = TRUE
         AND ia.weekday = EXTRACT(DOW FROM dates)::int
      )
      SELECT configured.instructor_id,
        COUNT(*) FILTER (WHERE NOT EXISTS (
          SELECT 1 FROM course_cycle_schedule_assignments assignment
          WHERE assignment.instructor_id = configured.instructor_id
            AND assignment.schedule_date = configured.schedule_date
            AND assignment.start_time = configured.start_time
            AND assignment.end_time = configured.end_time
            AND assignment.status = 'activo'
        ) AND NOT EXISTS (
          SELECT 1 FROM referred_instructor_schedule_blocks block
          WHERE block.instructor_id = configured.instructor_id
            AND block.schedule_date = configured.schedule_date
            AND block.start_time = configured.start_time
            AND block.end_time = configured.end_time
            AND block.status = 'activo'
        ) AND NOT EXISTS (
          SELECT 1 FROM instructor_availability_overrides override
          WHERE override.instructor_id = configured.instructor_id
            AND override.schedule_date = configured.schedule_date
            AND override.start_time = configured.start_time
            AND override.end_time = configured.end_time
            AND override.active = TRUE
        ))::int AS available_hours
      FROM configured
      GROUP BY configured.instructor_id
    `, [branchId, result.rows.map(row => row.id)]) : { rows: [] };
    const availableHoursByInstructor = new Map(
      availableHoursResult.rows.map(row => [String(row.instructor_id), Number(row.available_hours || 0)])
    );

    return result.rows.map(row => {
      const priorityInfo = priorityByInstructor.get(String(row.id));
      const prioritySlots = priorityInfo?.slots;
      const availability = prioritySlots
        ? (row.availability || []).filter(slot => prioritySlots.some(prioritySlot => (
            Number(prioritySlot.weekday) === Number(slot.weekday)
            && String(prioritySlot.startTime || prioritySlot.start_time) === String(slot.startTime || slot.start_time)
            && String(prioritySlot.endTime || prioritySlot.end_time) === String(slot.endTime || slot.end_time)
          )))
        : row.availability;
      return ({
      id: row.id,
      userId: row.user_id,
      name: `${row.first_name} ${row.last_name}`,
      email: row.email,
      phone: row.phone,
      branchId: row.branch_id,
      branch: row.branch_name,
      instructorType: row.instructor_type,
      specialty: row.specialty,
      practiceArea: priorityInfo?.practiceArea || row.practice_area,
      weekendPracticeArea: row.weekend_practice_area || priorityInfo?.practiceArea || row.practice_area,
      isPriorityInOtherBranch: Boolean(row.priority_branch_id && String(row.priority_branch_id) !== String(branchId)),
      priorityBranch: row.priority_branch_name || null,
      status: row.status,
      licenseNumber: row.license_number,
      groups: row.groups,
      availability,
      availableHours: availableHoursByInstructor.get(String(row.id)) ?? 0,
      courses: row.courses,
      });
    });
  }

  static async getInstructorCalendar(user, instructorId, requestedCycleId = null, modality = 'normal') {
    if (!['normal', 'intensivo'].includes(modality)) throw createError(422, 'Modalidad no valida');
    const scheduleBranchId = await this.resolveScheduleBranchId(user.branch_id);
    const scheduleUser = scheduleBranchId === user.branch_id ? user : { ...user, branch_id: scheduleBranchId };
    const instructorResult = await db.query(`
      SELECT ip.id, u.first_name, u.last_name, u.branch_id, b.name AS branch_name
      FROM instructor_profiles ip
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ip.id = $1 AND u.role = 'instructor' AND u.active = true AND ip.deleted_at IS NULL
    `, [instructorId]);

    if (!instructorResult.rows.length) throw createError(404, 'Instructor no encontrado');
    const instructor = instructorResult.rows[0];

    if (scheduleBranchId && instructor.branch_id !== scheduleBranchId) {
      const priorityAccess = await db.query(`
        SELECT 1
        FROM instructor_branch_priorities
        WHERE instructor_id = $1
          AND branch_id = $2
          AND assignment_type = 'priority'
          AND active = TRUE
          AND effective_from <= CURRENT_DATE
          AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
        LIMIT 1
      `, [instructorId, scheduleBranchId]);
      if (!priorityAccess.rows.length) {
        throw createError(403, 'No puedes consultar instructores de otra sucursal');
      }
    }

    const availability = await db.query(`
      SELECT weekday, to_char(start_time, 'HH24:MI') AS start_time, to_char(end_time, 'HH24:MI') AS end_time,
             active, reason_type, unavailable_reason
      FROM instructor_availability
      WHERE instructor_id = $1
      ORDER BY weekday, start_time
    `, [instructorId]);

    const priorityResult = scheduleBranchId ? await db.query(`
      SELECT priority.branch_id, priority.allowed_slots, priority.effective_from,
        branch.name AS branch_name
      FROM instructor_branch_priorities priority
      JOIN branches branch ON branch.id=priority.branch_id
      WHERE priority.instructor_id = $1
        AND priority.assignment_type = 'priority'
        AND priority.active = TRUE
        AND priority.effective_from <= CURRENT_DATE
        AND (priority.effective_until IS NULL OR priority.effective_until >= CURRENT_DATE)
      ORDER BY priority.updated_at DESC
      LIMIT 1
    `, [instructorId]) : { rows: [] };
    // El calendario se consulta en el contexto de la sucursal del usuario. La
    // prioridad en otra sede no debe trasladar silenciosamente el calendario a
    // esa sede: solo determina qué franjas quedan reservadas para ella.
    const priorityBranchId = priorityResult.rows[0]?.branch_id || null;
    const effectiveBranchId = priorityBranchId || scheduleBranchId || instructor.branch_id;
    const effectiveBranchName = priorityResult.rows[0]?.branch_name || instructor.branch_name;
    await AutomaticCycleService.ensureForBranch(effectiveBranchId, user.id);
    const prioritySlots = Array.isArray(priorityResult.rows[0]?.allowed_slots)
      ? priorityResult.rows[0].allowed_slots
      : [];
    const matchesPrioritySlot = slot => prioritySlots.some(prioritySlot => (
          Number(prioritySlot.weekday) === Number(slot.weekday)
          && String(prioritySlot.startTime || prioritySlot.start_time) === slot.start_time
          && String(prioritySlot.endTime || prioritySlot.end_time) === slot.end_time
        ));
    const branchAvailability = !priorityBranchId || !prioritySlots.length
      ? availability.rows
      : String(priorityBranchId) === String(effectiveBranchId)
        ? availability.rows.filter(matchesPrioritySlot)
        : availability.rows.filter(slot => !matchesPrioritySlot(slot));
    const cyclesResult = await db.query(`
      SELECT cc.id, cc.code, cc.course_id, cc.branch_id, cc.start_date, cc.end_date, cc.vehicle_type, cc.modality,
             CURRENT_DATE AS today
      FROM course_cycles cc
      WHERE cc.branch_id = $2
        AND cc.active = TRUE
        AND cc.deleted_at IS NULL
        AND cc.status <> 'cancelado'
        AND cc.modality = $3
        AND EXISTS (
          SELECT 1 FROM course_cycle_instructors cci
          WHERE cci.cycle_id = cc.id
            AND cci.instructor_id = $1
            AND cci.active = TRUE
        )
      ORDER BY cc.start_date ASC,cc.end_date ASC,cc.code ASC
    `, [instructorId, effectiveBranchId, modality]);
    const cycles = cyclesResult.rows;
    const today = cycles[0] ? toDateString(cycles[0].today) : toDateString(new Date());
    let selectedCycleIndex = requestedCycleId
      ? cycles.findIndex(cycle => String(cycle.id) === String(requestedCycleId))
      : cycles.findIndex(cycle => toDateString(cycle.start_date) <= today
        && toDateString(cycle.end_date) >= today);
    if (!requestedCycleId && selectedCycleIndex < 0) {
      selectedCycleIndex = cycles.findIndex(cycle => toDateString(cycle.start_date) >= today);
    }
    if (requestedCycleId && selectedCycleIndex < 0) {
      throw createError(404, 'El curso solicitado no pertenece a este instructor');
    }
    if (selectedCycleIndex < 0 && cycles.length) {
      selectedCycleIndex = cycles.length - 1;
    }
    const nextCycle = selectedCycleIndex >= 0 ? cycles[selectedCycleIndex] : null;

    if (!nextCycle) {
      return {
        instructor: {
          id: instructor.id,
          name: `${instructor.first_name} ${instructor.last_name}`,
          branch: effectiveBranchName,
        },
        week: null,
        course: null,
        days: [],
        slots: [],
      };
    }

    const rangeStart = new Date(`${toDateString(nextCycle.start_date)}T12:00:00`);
    const rangeEnd = new Date(`${toDateString(nextCycle.end_date)}T12:00:00`);
    const queryEnd = new Date(rangeEnd);
    queryEnd.setDate(queryEnd.getDate() + 1);
    const calendarDates = [];
    let calendarAvailability = branchAvailability;
    if (modality === 'intensivo') {
      const templates = await db.query(`SELECT t.day_of_week,t.start_time,t.end_time
        FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id
        WHERE p.branch_id=$1 AND p.course_id=$2 AND t.modality=$3 AND t.active=TRUE`,
      [nextCycle.branch_id, nextCycle.course_id, modality]);
      const layout = require('./CourseCycleService').calendarLayout({ ...nextCycle, schedule_templates: templates.rows });
      calendarDates.push(...layout.dates.map(date => new Date(`${date}T12:00:00`)));
      calendarAvailability = calendarDates.flatMap(date => layout.slots
        .filter(([start, end]) => !templates.rows.length || templates.rows.some(t =>
          Number(t.day_of_week) === date.getDay() && String(t.start_time).slice(0, 5) === start && String(t.end_time).slice(0, 5) === end))
        .map(([start, end]) => ({ weekday: date.getDay(), start_time: start, end_time: end, active: true })));
      calendarAvailability = [...new Map(calendarAvailability.map(slot => [`${slot.weekday}:${slot.start_time}:${slot.end_time}`, slot])).values()];
    } else {
      for (const cursor = new Date(rangeStart); cursor <= rangeEnd; cursor.setDate(cursor.getDate() + 1)) {
        if (cursor.getDay() >= 1 && cursor.getDay() <= 5) calendarDates.push(new Date(cursor));
      }
    }

    const overrides = await this.getAvailabilityOverrides(scheduleUser, instructorId, toDateString(rangeStart), toDateString(queryEnd));
    const overrideBySlot = new Map(overrides.map(item => ([
      `${item.schedule_date.toISOString?.().slice(0, 10) || String(item.schedule_date).slice(0, 10)}:${item.start_time}:${item.end_time}`,
      item,
    ])));

    const sessions = await db.query(`
      SELECT assignment.id,
             assignment.schedule_date + assignment.start_time AS scheduled_start,
             assignment.schedule_date + assignment.end_time AS scheduled_end,
             assignment.status, NULL::int AS session_number,
             CASE WHEN e.branch_id=$4 THEN s.first_name ELSE 'Ocupado en' END first_name,
             CASE WHEN e.branch_id=$4 THEN s.last_name ELSE work_branch.name END last_name,
             CASE WHEN e.branch_id=$4 THEN c.name ELSE NULL END course_name
      FROM course_cycle_schedule_assignments assignment
      JOIN enrollments e ON e.id = assignment.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      JOIN branches work_branch ON work_branch.id=e.branch_id
      WHERE assignment.instructor_id = $1
        AND LOWER(assignment.status) = 'activo'
        AND LOWER(e.status) NOT IN ('cancelado','completado')
        AND assignment.schedule_date >= $2::date
        AND assignment.schedule_date < $3::date
      UNION ALL
      SELECT block.id,
             block.schedule_date + block.start_time AS scheduled_start,
             block.schedule_date + block.end_time AS scheduled_end,
             block.status, NULL::int AS session_number,
             CASE WHEN e.branch_id=$4 THEN s.first_name ELSE 'Ocupado en' END first_name,
             CASE WHEN e.branch_id=$4 THEN s.last_name ELSE work_branch.name END last_name,
             CASE WHEN e.branch_id=$4 THEN c.name ELSE NULL END course_name
      FROM referred_instructor_schedule_blocks block
      JOIN enrollments e ON e.id = block.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = block.student_id
      JOIN courses c ON c.id = e.course_id
      JOIN branches work_branch ON work_branch.id=e.branch_id
      WHERE block.instructor_id = $1
        AND block.status = 'activo'
        AND LOWER(e.status) NOT IN ('cancelado','completado')
        AND block.schedule_date >= $2::date
        AND block.schedule_date < $3::date
      ORDER BY scheduled_start
    `, [instructorId, toDateString(rangeStart), toDateString(queryEnd), scheduleBranchId]);

    const additionalPractices = await db.query(`
      SELECT ap.id,ap.student_id,ap.branch_id,day_offset,
        ap.start_date+day_offset+ap.daily_start_time scheduled_start,
        ap.start_date+day_offset+ap.daily_start_time+INTERVAL '100 minutes' scheduled_end,
        CASE WHEN ap.branch_id=$4 THEN s.first_name ELSE 'Ocupado en' END first_name,
        CASE WHEN ap.branch_id=$4 THEN s.last_name ELSE b.name END last_name,
        CASE WHEN ap.branch_id=$4 THEN 'Practicas adicionales' ELSE NULL END course_name,
        s.identification,s.phone,
        to_char(ap.daily_start_time,'HH24:MI') start_time,
        to_char(ap.daily_start_time+INTERVAL '100 minutes','HH24:MI') end_time
      FROM additional_driving_practices ap
      JOIN students s ON s.id=ap.student_id AND s.status<>'inhabilitado'
      JOIN branches b ON b.id=ap.branch_id
      CROSS JOIN LATERAL generate_series(0,ap.number_of_days-1) day_offset
      WHERE ap.instructor_id=$1 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
        AND day_offset>=ap.completed_days
        AND ap.start_date+day_offset >= $2::date AND ap.start_date+day_offset < $3::date
    `, [instructorId, toDateString(rangeStart), toDateString(queryEnd), scheduleBranchId]);
    sessions.rows.push(...additionalPractices.rows.map(practice => ({
      ...practice, status: 'PROGRAMADA', session_number: practice.day_offset+1,
    })));

    const theorySchedules = await db.query(`
      SELECT class_date, recurring, modality, day_of_week,
             to_char(start_time, 'HH24:MI') AS start_time,
             to_char(end_time, 'HH24:MI') AS end_time
      FROM theory_class_schedules
      WHERE instructor_id = $1
        AND active = TRUE
        AND (recurring = TRUE OR (class_date >= $2::date AND class_date < $3::date))
    `, [instructorId, toDateString(rangeStart), toDateString(queryEnd)]);

    const enrolledStudents = await db.query(`
      SELECT s.id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.phone,
        MIN(to_char(assignment.start_time,'HH24:MI')) start_time,
        MAX(to_char(assignment.end_time,'HH24:MI')) end_time
      FROM course_cycle_schedule_assignments assignment
      JOIN enrollments e ON e.id=assignment.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=assignment.student_id
      WHERE assignment.cycle_id=$1 AND assignment.instructor_id=$2
        AND assignment.status='activo' AND LOWER(e.status) NOT IN ('cancelado','completado')
      GROUP BY s.id
      ORDER BY start_time,name
    `, [nextCycle.id, instructorId]);
    const reservedStudents = await db.query(`
      SELECT reservation.id,reservation.referred_identification identification,
        COALESCE(NULLIF(TRIM(reservation.referred_name),''),TRIM(CONCAT(s.first_name,' ',s.last_name))) name,
        COALESCE(reservation.referred_phone,s.phone) phone,
        requested.start_time,requested.end_time
      FROM course_cycle_seat_reservations reservation
      LEFT JOIN students s ON s.id=reservation.student_id
      LEFT JOIN LATERAL (
        SELECT to_char(o.start_time,'HH24:MI') start_time,to_char(o.end_time,'HH24:MI') end_time
        FROM instructor_availability_overrides o
        WHERE o.instructor_id=reservation.instructor_id AND o.active=TRUE AND o.status='reserved'
          AND o.reason LIKE CONCAT('RESERVA_CURSO:',reservation.id,':%')
        ORDER BY o.schedule_date,o.start_time LIMIT 1
      ) requested ON TRUE
      WHERE reservation.cycle_id=$1 AND reservation.instructor_id=$2 AND reservation.status='activo'
        AND NOT EXISTS (
          SELECT 1 FROM course_cycle_schedule_assignments assignment
          WHERE assignment.cycle_id=reservation.cycle_id
            AND assignment.enrollment_id=reservation.enrollment_id
            AND assignment.status='activo'
        )
      ORDER BY requested.start_time,name
    `, [nextCycle.id, instructorId]);

    const slots = calendarDates.flatMap(date => calendarAvailability
      .filter(slot => Number(slot.weekday) === Number(date.getDay()))
      .map(slot => {
      const start = `${toDateString(date)} ${slot.start_time}:00`;
      const end = `${toDateString(date)} ${slot.end_time}:00`;
      const busySession = sessions.rows.find(session => (
        new Date(session.scheduled_start) < new Date(end)
        && new Date(session.scheduled_end) > new Date(start)
      ));
      const dateString = toDateString(date);
      const slotOverride = overrideBySlot.get(`${dateString}:${slot.start_time}:${slot.end_time}`);
      const overrideStatus = slotOverride?.status;
      const theoryConflict = theorySchedules.rows.find(theory => {
        const appliesToDate = theory.recurring
          ? (Number(theory.day_of_week) === Number(slot.weekday)
            || (theory.modality === 'presencial_regular' && Number(slot.weekday) >= 1 && Number(slot.weekday) <= 5)
            || (theory.modality === 'presencial_sabado' && Number(slot.weekday) === 6))
          : toDateString(new Date(theory.class_date)) === dateString;
        return appliesToDate && theory.start_time < slot.end_time && theory.end_time > slot.start_time;
      });
      const occupied = busySession || theoryConflict;

        return {
        weekday: slot.weekday,
        day: WEEKDAY_NAMES[slot.weekday],
        date: toDateString(date),
        startTime: slot.start_time,
        endTime: slot.end_time,
        permanentlyAvailable: slot.active !== false,
        permanentReasonType: slot.reason_type || null,
        permanentReason: slot.unavailable_reason || null,
        blockReasonType: slotOverride?.reason_type || (slot.active === false ? slot.reason_type : null),
        blockReason: slotOverride?.reason || (slot.active === false ? slot.unavailable_reason : null),
        availabilityBlocked: overrideStatus === 'blocked' || slot.active === false,
        status: overrideStatus === 'reserved' ? 'reserved' : overrideStatus === 'blocked' || slot.active === false ? 'occupied' : occupied ? 'ocupado' : 'disponible',
        session: occupied ? {
          id: busySession?.id || null,
          status: busySession?.status || 'teoria',
          sessionNumber: busySession?.session_number||null,
          student: busySession ? `${busySession.first_name} ${busySession.last_name}` : null,
          course: busySession?.course_name || 'Clase teórica',
          cycleCode: null,
        } : null,
        };
      }));

    const canViewEffectiveBranchStudents = String(effectiveBranchId) === String(scheduleBranchId)
      || (String(instructor.branch_id) === String(scheduleBranchId)
        && String(priorityBranchId) === String(effectiveBranchId));
    const transportSlots = slots.filter(slot => slot.blockReasonType === 'transport');
    const transportStudent = transportSlots.length ? [{
      id: `transport-${instructorId}-${nextCycle.id}`,
      identification: null,
      name: 'Transporte',
      phone: null,
      start_time: transportSlots.map(slot => slot.startTime).sort()[0],
      end_time: transportSlots.map(slot => slot.endTime).sort().at(-1),
      status: 'transporte',
    }] : [];
    return {
      instructor: {
        id: instructor.id,
        name: `${instructor.first_name} ${instructor.last_name}`,
        branch: effectiveBranchName,
      },
      week: {
        startDate: toDateString(rangeStart),
        endDate: toDateString(rangeEnd),
      },
      course: nextCycle ? {
        id: nextCycle.id,
        code: nextCycle.code,
        courseId: nextCycle.course_id,
        branchId: nextCycle.branch_id,
        vehicleType: nextCycle.vehicle_type,
        modality: nextCycle.modality,
      } : null,
      courseNavigation: {
        position: selectedCycleIndex >= 0 ? selectedCycleIndex + 1 : 0,
        total: cycles.length,
        previousCycleId: selectedCycleIndex > 0 ? cycles[selectedCycleIndex - 1].id : null,
        nextCycleId: selectedCycleIndex >= 0 && selectedCycleIndex < cycles.length - 1 ? cycles[selectedCycleIndex + 1].id : null,
      },
      days: calendarDates.map(date => ({
        date: toDateString(date),
        day: WEEKDAY_NAMES[date.getDay()],
      })),
      availability: {
        configuredSlots: slots.length,
        availableSlots: slots.filter(slot => slot.status === 'disponible').length,
        occupiedSlots: slots.filter(slot => slot.status === 'ocupado').length,
      },
      students: canViewEffectiveBranchStudents ? [
        ...enrolledStudents.rows.map(student => ({ ...student, status: 'matriculado' })),
        ...[...new Map(additionalPractices.rows
          .filter(practice => String(practice.branch_id)===String(scheduleBranchId))
          .map(practice => [practice.id, {
            id: practice.student_id, identification: practice.identification,
            name: `${practice.first_name} ${practice.last_name}`.trim(), phone: practice.phone,
            start_time: practice.start_time, end_time: practice.end_time,
            status: 'practica_adicional',
          }])).values()],
        ...reservedStudents.rows.map(student => ({ ...student, status: 'reservado' })),
        ...transportStudent,
      ] : [],
      slots,
    };
  }

  static async updateGroupAssignments(user, changes) {
    if (!Array.isArray(changes) || !changes.length) throw createError(422, 'No hay cambios de grupos para guardar');
    if (!user.branch_id) throw createError(403, 'No tienes una sucursal asignada');

    const scheduleBranchId = await this.resolveScheduleBranchId(user.branch_id);
    const instructorIds = changes.map(change => change?.instructorId);
    const groupIds = changes.map(change => change?.groupId).filter(Boolean);
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (instructorIds.some(id => !uuidPattern.test(String(id)))) throw createError(422, 'ID de instructor invalido');
    if (groupIds.some(id => !uuidPattern.test(String(id)))) throw createError(422, 'ID de grupo invalido');
    if (new Set(instructorIds.map(String)).size !== instructorIds.length) throw createError(422, 'No se permiten instructores duplicados');

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const instructors = await client.query(`
        SELECT ip.id
        FROM instructor_profiles ip
        JOIN users u ON u.id = ip.user_id
        WHERE ip.id = ANY($1::uuid[])
          AND u.branch_id = $2
          AND u.role = 'instructor'
          AND u.active = TRUE
          AND ip.deleted_at IS NULL
      `, [instructorIds, scheduleBranchId]);
      if (instructors.rowCount !== instructorIds.length) throw createError(404, 'Uno o mas instructores no pertenecen a esta sucursal');

      if (groupIds.length) {
        const groups = await client.query(`
          SELECT id
          FROM instructor_groups
          WHERE id = ANY($1::uuid[])
            AND branch_id = $2
            AND active = TRUE
            AND deleted_at IS NULL
        `, [groupIds, scheduleBranchId]);
        if (groups.rowCount !== new Set(groupIds.map(String)).size) throw createError(404, 'Uno o mas grupos no pertenecen a esta sucursal');
      }

      for (const change of changes) {
        const effective = await client.query(`
          SELECT COALESCE(MAX(cc.end_date) + 1, CURRENT_DATE)::date AS effective_from
          FROM course_cycle_instructors cci
          JOIN course_cycles cc ON cc.id = cci.cycle_id
          WHERE cci.instructor_id = $1
            AND cci.active = TRUE
            AND cc.active = TRUE
            AND cc.deleted_at IS NULL
            AND cc.status IN ('activo', 'por_terminar')
            AND cc.end_date >= CURRENT_DATE
        `, [change.instructorId]);
        await client.query(`
          INSERT INTO instructor_group_pending_assignments
            (instructor_id, group_id, effective_from, active, created_by, updated_at)
          VALUES ($1, $2, $3, TRUE, $4, NOW())
          ON CONFLICT (instructor_id) DO UPDATE SET
            group_id = EXCLUDED.group_id,
            effective_from = EXCLUDED.effective_from,
            active = TRUE,
            updated_at = NOW(),
            updated_by = EXCLUDED.created_by
        `, [change.instructorId, change.groupId || null, effective.rows[0].effective_from, user.id]);
      }
      await client.query('COMMIT');
      return { updated: changes.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getMonthlyAvailability(user, monthValue, modalityValue='normal', vehicleTypeValue=null) {
    if (!user.branch_id) throw createError(422, 'Selecciona una sucursal para consultar la disponibilidad');
    const scheduleBranchId = await this.resolveScheduleBranchId(user.branch_id);
    const month = /^\d{4}-\d{2}$/.test(String(monthValue || '')) ? String(monthValue) : new Date().toISOString().slice(0, 7);
    const modality=modalityValue==='intensivo'?'intensivo':'normal';
    const vehicleType=['carro','moto'].includes(vehicleTypeValue)?vehicleTypeValue:null;
    const instructorsResult = await db.query(`SELECT ip.id,u.first_name || ' ' || u.last_name name,
        CASE WHEN priority_rule.branch_id=$1 THEN COALESCE(priority_rule.practice_area,ip.practice_area) ELSE ip.practice_area END vehicle_type,
        u.branch_id home_branch_id,priority_rule.branch_id priority_branch_id,priority_rule.branch_name priority_branch
      FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
      LEFT JOIN LATERAL (
        SELECT priority.branch_id,priority.practice_area,branch.name branch_name
        FROM instructor_branch_priorities priority
        JOIN branches branch ON branch.id=priority.branch_id
        WHERE priority.instructor_id=ip.id AND priority.assignment_type='priority' AND priority.active=TRUE
          AND priority.effective_from<=CURRENT_DATE
          AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
        ORDER BY priority.updated_at DESC LIMIT 1
      ) priority_rule ON TRUE
      WHERE (u.branch_id=$1 OR priority_rule.branch_id=$1)
        AND u.active=TRUE AND ip.deleted_at IS NULL AND LOWER(ip.status)='activo'
        AND ($2::text IS NULL OR
          (CASE WHEN priority_rule.branch_id=$1 THEN COALESCE(priority_rule.practice_area,ip.practice_area) ELSE ip.practice_area END)='mixto' OR
          (CASE WHEN priority_rule.branch_id=$1 THEN COALESCE(priority_rule.practice_area,ip.practice_area) ELSE ip.practice_area END)=$2)
      ORDER BY u.first_name,u.last_name`, [scheduleBranchId,vehicleType]);
    // La selección real del instructor intensivo se mantiene bajo la rotación
    // existente; este cambio de visibilidad no altera ese flujo.
    if(modality==='intensivo') instructorsResult.rows=instructorsResult.rows.slice(0,1);
    const templatesResult=await db.query(`SELECT t.day_of_week,to_char(t.start_time,'HH24:MI') start_time,to_char(t.end_time,'HH24:MI') end_time
      FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE
      WHERE p.branch_id=$1 AND p.vehicle_type=$2 AND t.modality=$3 ORDER BY t.day_of_week,t.start_time`,[scheduleBranchId,vehicleType||'carro',modality]);
    const availabilityResult={rows:instructorsResult.rows.flatMap(instructor=>templatesResult.rows.map(slot=>({...slot,instructor_id:instructor.id})))};
    const assignmentsResult = await db.query(`SELECT assignment.instructor_id,assignment.schedule_date,
      to_char(assignment.start_time,'HH24:MI') start_time,to_char(assignment.end_time,'HH24:MI') end_time,
      CASE WHEN e.branch_id=$1 THEN s.first_name || ' ' || s.last_name ELSE 'Ocupado en ' || work_branch.name END student,
      CASE WHEN e.branch_id=$1 THEN c.name ELSE NULL END course,work_branch.name work_branch
      FROM course_cycle_schedule_assignments assignment JOIN course_cycles cc ON cc.id=assignment.cycle_id
      JOIN enrollments e ON e.id=assignment.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=assignment.student_id JOIN courses c ON c.id=e.course_id
      JOIN branches work_branch ON work_branch.id=e.branch_id
      WHERE assignment.instructor_id=ANY($5::uuid[]) AND LOWER(assignment.status)='activo'
        AND LOWER(e.status) NOT IN ('cancelado','completado')
        AND cc.modality=$3 AND ($4::text IS NULL OR cc.vehicle_type=$4)
        AND assignment.schedule_date >= $2::date
        AND assignment.schedule_date < ($2::date+INTERVAL '1 month')
      UNION ALL
      SELECT block.instructor_id,block.schedule_date,
        to_char(block.start_time,'HH24:MI') start_time,to_char(block.end_time,'HH24:MI') end_time,
        CASE WHEN e.branch_id=$1 THEN s.first_name || ' ' || s.last_name ELSE 'Ocupado en ' || work_branch.name END student,
        CASE WHEN e.branch_id=$1 THEN c.name ELSE NULL END course,work_branch.name work_branch
      FROM referred_instructor_schedule_blocks block JOIN course_cycles cc ON cc.id=block.cycle_id
      JOIN enrollments e ON e.id=block.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=block.student_id JOIN courses c ON c.id=e.course_id
      JOIN branches work_branch ON work_branch.id=e.branch_id
      WHERE block.instructor_id=ANY($5::uuid[]) AND block.status='activo'
        AND LOWER(e.status) NOT IN ('cancelado','completado')
        AND cc.modality=$3 AND ($4::text IS NULL OR cc.vehicle_type=$4)
        AND block.schedule_date >= $2::date
        AND block.schedule_date < ($2::date+INTERVAL '1 month')`, [scheduleBranchId, `${month}-01`,modality,vehicleType,instructorsResult.rows.map(item=>item.id)]);
    const branch = await db.query('SELECT name FROM branches WHERE id=$1', [scheduleBranchId]);
    const minimum = new Date(); minimum.setHours(0,0,0,0); minimum.setDate(minimum.getDate()+1);
    const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
    const assignments=assignmentsResult.rows.map(item=>({...item,schedule_date:dateOnly(item.schedule_date)}));
    const overridesResult = await db.query(`
      SELECT instructor_id,schedule_date,to_char(start_time,'HH24:MI') start_time,to_char(end_time,'HH24:MI') end_time,status
      FROM instructor_availability_overrides
      WHERE active=TRUE AND schedule_date >= $2::date AND schedule_date < ($2::date + INTERVAL '1 month')
        AND instructor_id=ANY($1::uuid[])
    `, [instructorsResult.rows.map(item => item.id), `${month}-01`]);
    const cursor=new Date(`${month}-01T00:00:00`),days=[];
    while(cursor.getMonth()===Number(month.slice(5,7))-1){const date=cursor.toISOString().slice(0,10),weekday=cursor.getDay();const details=instructorsResult.rows.map(instructor=>{const slots=availabilityResult.rows.filter(slot=>String(slot.instructor_id)===String(instructor.id)&&Number(slot.day_of_week)===weekday).map(slot=>{const assignment=assignments.find(item=>String(item.instructor_id)===String(instructor.id)&&item.schedule_date===date&&item.start_time===slot.start_time&&item.end_time===slot.end_time);const override=overridesResult.rows.find(item=>String(item.instructor_id)===String(instructor.id)&&String(item.schedule_date).slice(0,10)===date&&item.start_time===slot.start_time&&item.end_time===slot.end_time);const status=override?.status==='reserved'?'reserved':override?.status==='blocked'?'occupied':assignment?'occupied':'available';return{startTime:slot.start_time,endTime:slot.end_time,status,busy:status!=='available',student:assignment?.student||null,course:assignment?.course||null,workBranch:assignment?.work_branch||null};});const busy=slots.length>0&&slots.every(slot=>slot.status!=='available');return{id:instructor.id,name:instructor.name,vehicleType:instructor.vehicle_type,homeBranchId:instructor.home_branch_id,priorityBranchId:instructor.priority_branch_id,priorityBranch:instructor.priority_branch,instructors:1,busy,slots};}).filter(item=>item.slots.length);days.push({date,total:details.length,busy:details.filter(item=>item.busy).length,available:details.filter(item=>!item.busy).length,groups:details});cursor.setDate(cursor.getDate()+1);}
    return {month,modality,vehicleType,branch:branch.rows[0]?.name||'',minimumBookingDate:minimum.toISOString().slice(0,10),groups:instructorsResult.rows,days};
  }

  static async assignInstructor(user, enrollmentId, instructorId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const enrollmentResult = await client.query(`
        SELECT e.*, s.first_name, s.last_name, c.id AS course_id, c.name AS course_name
        FROM enrollments e
        JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
        JOIN courses c ON c.id = e.course_id
        WHERE e.id = $1
        FOR UPDATE
      `, [enrollmentId]);
      if (!enrollmentResult.rows.length) throw createError(404, 'Matricula no encontrada');
      const enrollment = enrollmentResult.rows[0];

      if (user.branch_id && enrollment.branch_id !== user.branch_id) {
        throw createError(403, 'No puedes asignar instructores en otra sucursal');
      }

      const instructorResult = await client.query(`
        SELECT ip.id, u.branch_id, u.first_name, u.last_name
        FROM instructor_profiles ip
        JOIN users u ON u.id = ip.user_id
        WHERE ip.id = $1 AND u.role = 'instructor' AND u.active = true AND ip.deleted_at IS NULL
        FOR UPDATE
      `, [instructorId]);
      if (!instructorResult.rows.length) throw createError(404, 'Instructor no encontrado');
      const instructor = instructorResult.rows[0];

      if (instructor.branch_id !== enrollment.branch_id) {
        throw createError(422, 'El instructor no pertenece a la sucursal de la matricula');
      }

      const capability = await client.query(`
        SELECT 1 FROM instructor_course_capabilities
        WHERE instructor_id = $1 AND course_id = $2 AND active = true
      `, [instructorId, enrollment.course_id]);
      if (!capability.rows.length) throw createError(422, 'El instructor no esta habilitado para este curso');

      await client.query(`
        UPDATE enrollment_instructor_assignments
        SET active = false, end_date = CURRENT_DATE, updated_at = NOW()
        WHERE enrollment_id = $1 AND active = true
      `, [enrollmentId]);

      const assignment = await client.query(`
        INSERT INTO enrollment_instructor_assignments (enrollment_id, instructor_id, assigned_by, active, observations)
        VALUES ($1, $2, $3, true, 'Asignado desde Secretaria')
        RETURNING *
      `, [enrollmentId, instructorId, user.id]);

      const session = await this.createNextSession(client, {
        user,
        enrollment,
        instructorId,
      });

      await client.query(`
        INSERT INTO history (student_id, action)
        VALUES ($1, $2)
      `, [
        enrollment.student_id,
        `Instructor asignado: ${instructor.first_name} ${instructor.last_name}. Proxima clase: ${session.scheduled_start}`,
      ]);

      await client.query(`
        INSERT INTO audit_logs (user_id, role, branch_id, action, entity, entity_id, metadata)
        VALUES ($1, $2, $3, 'INSTRUCTOR_ASSIGN', 'enrollment_instructor_assignments', $4, $5)
      `, [
        user.id,
        user.role,
        user.branch_id || enrollment.branch_id,
        assignment.rows[0].id,
        { enrollmentId, instructorId, sessionId: session.id },
      ]);

      await client.query('COMMIT');
      return {
        assignment: assignment.rows[0],
        session,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async createNextSession(client, { user, enrollment, instructorId }) {
    const nextNumberResult = await client.query(`
      SELECT COALESCE(MAX(session_number), 0) + 1 AS next_number
      FROM practical_sessions
      WHERE enrollment_id = $1 AND deleted_at IS NULL
    `, [enrollment.id]);
    const sessionNumber = Number(nextNumberResult.rows[0].next_number);

    const routeResult = await client.query(`
      SELECT id
      FROM training_routes
      WHERE city_id = (SELECT city_id FROM branches WHERE id = $1)
        AND (course_id = $2 OR course_id IS NULL)
        AND active = true
        AND deleted_at IS NULL
      ORDER BY
        CASE WHEN recommended_session_number = $3 THEN 0 ELSE 1 END,
        recommended_session_number NULLS LAST,
        name
      LIMIT 1
    `, [enrollment.branch_id, enrollment.course_id, sessionNumber]);

    const slot = await this.findNextAvailableSlot(client, instructorId);
    const result = await client.query(`
      INSERT INTO practical_sessions (
        enrollment_id, instructor_id, branch_id, recommended_route_id,
        scheduled_start, scheduled_end, session_number, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'PROXIMA', $8)
      RETURNING *
    `, [
      enrollment.id,
      instructorId,
      enrollment.branch_id,
      routeResult.rows[0]?.id || null,
      slot.start,
      slot.end,
      sessionNumber,
      user.id,
    ]);

    return result.rows[0];
  }

  static async findNextAvailableSlot(client, instructorId) {
    const availability = await client.query(`
      SELECT weekday, to_char(start_time, 'HH24:MI:SS') AS start_time, to_char(end_time, 'HH24:MI:SS') AS end_time
      FROM instructor_availability
      WHERE instructor_id = $1 AND active = true
      ORDER BY weekday, start_time
    `, [instructorId]);

    if (!availability.rows.length) throw createError(422, 'El instructor no tiene horarios disponibles configurados');

    const today = new Date();
    for (let week = 0; week < 8; week += 1) {
      for (const item of availability.rows) {
        const date = nextWeekdaySlotDate(today, item.weekday);
        date.setDate(date.getDate() + (week * 7));
        const start = combineDateTime(date, item.start_time);
        const end = combineDateTime(date, item.end_time);

        const busy = await client.query(`
          SELECT 1
          FROM practical_sessions
          WHERE instructor_id = $1
            AND deleted_at IS NULL
            AND status IN ('PROGRAMADA', 'PROXIMA', 'EN_CURSO')
            AND scheduled_start < $3::timestamp
            AND scheduled_end > $2::timestamp
          LIMIT 1
        `, [instructorId, start, end]);

        if (!busy.rows.length && new Date(start) > today) {
          return {
            start,
            end,
            weekday: item.weekday,
            day: WEEKDAY_NAMES[item.weekday],
          };
        }
      }
    }

    throw createError(409, 'No hay espacios libres para este instructor en las proximas semanas');
  }
}

module.exports = InstructorAdminService;
