const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

class ScheduleService {
  static async getStudentTheorySchedule(studentId) {
    const result = await db.query(`
      SELECT e.theory_modality,
        TO_CHAR(e.theory_start_time,'HH24:MI') enrollment_start_time,
        TO_CHAR(e.theory_end_time,'HH24:MI') enrollment_end_time,
        tg.id group_id,tg.modality group_modality,tg.start_date,tg.end_date,
        TO_CHAR(tg.start_time,'HH24:MI') group_start_time,
        TO_CHAR(tg.end_time,'HH24:MI') group_end_time,tg.status,
        NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),'') instructor_name
      FROM enrollments e
      LEFT JOIN theory_group_students tgs ON tgs.enrollment_id=e.id AND tgs.active=TRUE
      LEFT JOIN theory_course_groups tg ON tg.id=tgs.group_id AND tg.status<>'cancelado'
      LEFT JOIN instructor_profiles ip ON ip.id=tg.instructor_id
      LEFT JOIN users u ON u.id=ip.user_id
      WHERE e.student_id=$1
      ORDER BY CASE WHEN e.status='activo' THEN 0 ELSE 1 END,e.enrollment_date DESC,tgs.assigned_at DESC
      LIMIT 1
    `,[studentId]);
    if (!result.rows.length) return null;
    const row = result.rows[0];
    const modality = row.group_modality || row.theory_modality || null;
    return {
      selectionStatus: row.group_id ? 'assigned' : modality ? 'configured' : 'pending',
      modality,
      startDate: row.start_date,
      endDate: row.end_date,
      startTime: row.group_start_time || row.enrollment_start_time,
      endTime: row.group_end_time || row.enrollment_end_time,
      instructor: row.instructor_name,
      status: row.status,
    };
  }

  static async getStudentSchedule(studentId) {
    const theory = await this.getStudentTheorySchedule(studentId);
    const cycleSchedule = await db.query(`
      SELECT
        MIN(a.id::text) AS assignment_id,
        cc.code AS cycle_code,
        cc.vehicle_type,
        cc.start_date,
        cc.end_date,
        c.name AS course,
        COUNT(*)::int AS class_days,
        COUNT(DISTINCT (a.start_time, a.end_time))::int AS distinct_times,
        STRING_AGG(
          CONCAT(
            CASE EXTRACT(DOW FROM a.schedule_date)
              WHEN 1 THEN 'Lunes'
              WHEN 2 THEN 'Martes'
              WHEN 3 THEN 'Miercoles'
              WHEN 4 THEN 'Jueves'
              WHEN 5 THEN 'Viernes'
              WHEN 6 THEN 'Sabado'
              ELSE 'Domingo'
            END,
            ' ',
            TO_CHAR(a.schedule_date, 'YYYY-MM-DD')
          ),
          ', '
          ORDER BY a.schedule_date
        ) AS scheduled_days,
        STRING_AGG(
          DISTINCT CONCAT(TO_CHAR(a.start_time, 'HH24:MI'), '-', TO_CHAR(a.end_time, 'HH24:MI')),
          ', '
        ) AS scheduled_times,
        MIN(TO_CHAR(a.start_time, 'HH24:MI')) AS first_start_time,
        MIN(TO_CHAR(a.end_time, 'HH24:MI')) AS first_end_time
        ,MAX(CONCAT(u.first_name, ' ', u.last_name)) AS instructor_name
      FROM course_cycle_schedule_assignments a
      JOIN course_cycles cc ON cc.id = a.cycle_id
      JOIN courses c ON c.id = cc.course_id
      LEFT JOIN instructor_profiles ip ON ip.id = a.instructor_id
      LEFT JOIN users u ON u.id = ip.user_id
      WHERE a.student_id = $1 AND a.status = 'activo'
      GROUP BY cc.id, c.id
      ORDER BY MIN(a.schedule_date)
      LIMIT 1
    `, [studentId]);

    if (cycleSchedule.rows.length) {
      const row = cycleSchedule.rows[0];
      return {
        type: 'course_cycle',
        assignment_id: row.assignment_id,
        day: `${row.class_days} dias programados`,
        time: Number(row.distinct_times) > 1 ? `Rotativo: ${row.scheduled_times}` : row.scheduled_times,
        instructor: row.instructor_name || 'Pendiente de pago/asignacion',
        course: row.course,
        cycleCode: row.cycle_code,
        startDate: row.start_date,
        endDate: row.end_date,
        scheduledDays: row.scheduled_days,
        theory,
      };
    }

    const examSchedule = await db.query(`
      SELECT ps.id AS assignment_id,
        ps.appointment_type,
        ps.status,
        ps.scheduled_start,
        ps.scheduled_end,
        TO_CHAR(ps.scheduled_start, 'DD/MM/YYYY') AS schedule_date,
        TO_CHAR(ps.scheduled_start, 'HH24:MI') AS start_time,
        TO_CHAR(ps.scheduled_end, 'HH24:MI') AS end_time,
        c.name AS course,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS instructor_name
      FROM practical_sessions ps
      JOIN enrollments e ON e.id = ps.enrollment_id
      JOIN courses c ON c.id = e.course_id
      LEFT JOIN instructor_profiles ip ON ip.id = ps.instructor_id
      LEFT JOIN users u ON u.id = ip.user_id
      WHERE e.student_id = $1
        AND ps.appointment_type = 'EXAM_ONLY'
        AND ps.deleted_at IS NULL
        AND ps.status NOT IN ('CANCELADA', 'REPROGRAMADA')
      ORDER BY ps.scheduled_start DESC
      LIMIT 1
    `, [studentId]);

    if (examSchedule.rows.length) {
      const row = examSchedule.rows[0];
      return {
        type: 'exam_only',
        appointmentType: row.appointment_type,
        assignment_id: row.assignment_id,
        day: row.schedule_date,
        time: `${row.start_time}-${row.end_time}`,
        instructor: row.instructor_name || 'Instructor pendiente',
        course: row.course,
        status: row.status,
        scheduledStart: row.scheduled_start,
        scheduledEnd: row.scheduled_end,
        theory,
      };
    }

    const result = await db.query(`
      SELECT s.*, ss.id AS assignment_id
      FROM student_schedules ss
      JOIN schedules s ON s.id = ss.schedule_id
      WHERE ss.student_id = $1 AND ss.status = 'activo'
      ORDER BY ss.assigned_at DESC
      LIMIT 1
    `, [studentId]);
    return result.rows[0] ? { ...result.rows[0], theory } : (theory ? { type: 'theory_only', theory } : null);
  }

  /**
   * Obtener todos los horarios
   */
  static async getAll() {
    const result = await db.query(
      `SELECT * FROM schedules
       ORDER BY CASE day
         WHEN 'Lunes' THEN 1
         WHEN 'Martes' THEN 2
         WHEN 'Miércoles' THEN 3
         WHEN 'Jueves' THEN 4
         WHEN 'Viernes' THEN 5
         WHEN 'Sábado' THEN 6
         WHEN 'Domingo' THEN 7
         ELSE 8
       END, time`
    );
    return result.rows;
  }

  /**
   * Obtener horarios por curso
   */
  static async getByCourse(course) {
    const result = await db.query(
      'SELECT * FROM schedules WHERE course = $1 ORDER BY day, time',
      [course]
    );
    return result.rows;
  }

  /**
   * Asignar horario a estudiante
   */
  static async selectSchedule(scheduleId, studentId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      // Verificar horario
      const scheduleResult = await client.query(
        'SELECT * FROM schedules WHERE id = $1 FOR UPDATE',
        [scheduleId]
      );

      if (scheduleResult.rows.length === 0) {
        throw createError(404, 'Horario no encontrado');
      }

      const schedule = scheduleResult.rows[0];

      if (schedule.available <= 0) {
        throw createError(400, 'No hay espacios disponibles en este horario');
      }

      // Verificar estudiante
      const studentResult = await client.query(
        'SELECT * FROM students WHERE id = $1',
        [studentId]
      );

      if (studentResult.rows.length === 0) {
        throw createError(404, 'Estudiante no encontrado');
      }

      // Un estudiante solo puede tener un horario activo. Si se trata de un
      // cambio, liberamos el cupo anterior dentro de la misma transacción.
      const existing = await client.query(
        'SELECT * FROM student_schedules WHERE student_id = $1 AND status = \'activo\' FOR UPDATE',
        [studentId]
      );

      if (existing.rows.some(assignment => assignment.schedule_id === scheduleId)) {
        throw createError(409, 'El estudiante ya tiene este horario asignado');
      }

      for (const assignment of existing.rows) {
        await client.query("UPDATE student_schedules SET status = 'cancelado' WHERE id = $1", [assignment.id]);
        await client.query('UPDATE schedules SET available = available + 1, updated_at = NOW() WHERE id = $1', [assignment.schedule_id]);
      }

      // Crear asignación
      const assignResult = await client.query(
        `INSERT INTO student_schedules (student_id, schedule_id, status)
         VALUES ($1, $2, 'activo') RETURNING *`,
        [studentId, scheduleId]
      );

      // Reducir disponibilidad
      await client.query(
        'UPDATE schedules SET available = available - 1, updated_at = NOW() WHERE id = $1',
        [scheduleId]
      );

      // Actualizar estado del estudiante
      await client.query(
        "UPDATE students SET status = 'horario_seleccionado', updated_at = NOW() WHERE id = $1",
        [studentId]
      );

      await client.query(
        'INSERT INTO history (student_id, action) VALUES ($1, $2)',
        [studentId, `Horario asignado: ${schedule.day} ${schedule.time} - ${schedule.instructor}`]
      );

      await client.query('COMMIT');

      return assignResult.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancelar asignación de horario
   */
  static async cancelAssignment(scheduleId, studentId) {
    const client = await db.getClient();

    try {
      await client.query('BEGIN');

      const result = await client.query(
        "UPDATE student_schedules SET status = 'cancelado' WHERE student_id = $1 AND schedule_id = $2 AND status = 'activo' RETURNING *",
        [studentId, scheduleId]
      );

      if (result.rows.length === 0) {
        throw createError(404, 'Asignación no encontrada');
      }

      // Restaurar disponibilidad
      await client.query(
        'UPDATE schedules SET available = available + 1, updated_at = NOW() WHERE id = $1',
        [scheduleId]
      );

      const schedule = await client.query('SELECT * FROM schedules WHERE id = $1', [scheduleId]);

      await client.query(
        'INSERT INTO history (student_id, action) VALUES ($1, $2)',
        [studentId, `Horario cancelado: ${schedule.rows[0].day} ${schedule.rows[0].time}`]
      );

      await client.query('COMMIT');

      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = ScheduleService;
