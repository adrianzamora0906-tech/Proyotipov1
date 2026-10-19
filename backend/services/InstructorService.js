const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const { mileageEnabledSql, mileageRequiredSql } = require('./sessionMileage');

const ACTIVE_SESSION_STATUS = 'EN_CURSO';
const STARTABLE_STATUSES = ['PROGRAMADA', 'PROXIMA'];
const COMPLETED_STATUSES = ['COMPLETADA', 'AUSENTE', 'CANCELADA', 'REPROGRAMADA'];
const UNLIMITED_ATTENDANCE_MARKER = 'ATTENDANCE_NO_TIME_LIMIT';
const ATTENDANCE_EARLY_MINUTES = 10;
const ATTENDANCE_CLOSE_GRACE_MINUTES = 30;

function toDateRange(query) {
  const today = new Date();
  const date = query.date || today.toISOString().slice(0, 10);
  const startDate = query.startDate || date;
  const endDate = query.endDate || date;
  return {
    start: `${startDate} 00:00:00`,
    end: `${endDate} 23:59:59`,
  };
}

function mapSession(row) {
  if (!row) return null;
  const now = new Date();
  const scheduledStart = new Date(row.scheduled_start);
  const attendanceStart = new Date(scheduledStart.getTime() - ATTENDANCE_EARLY_MINUTES * 60 * 1000);
  const scheduledEnd = new Date(row.scheduled_end);
  const attendanceEnd = scheduledEnd;
  const startable = STARTABLE_STATUSES.includes(row.status);
  const unlimitedAttendance = String(row.observations || '').includes(UNLIMITED_ATTENDANCE_MARKER);
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    courseId: row.enrollment_course_id,
    branchId: row.branch_id,
    studentId: row.student_id,
    studentName: `${row.student_first_name || ''} ${row.student_last_name || ''}`.trim(),
    pickupAddress: row.student_address || null,
    pickupBranchName: row.pickup_branch_name || null,
    secretaryRecommendations: row.student_notes || null,
    course: row.course_name,
    branch: row.branch_name,
    vehicle: row.vehicle_code ? `${row.vehicle_code}${row.plate ? ` - ${row.plate}` : ''}` : null,
    sessionNumber: row.session_number,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    status: row.status,
    isExpired: startable && !unlimitedAttendance && attendanceEnd < now,
    canStart: !row.is_additional_practice && startable && (unlimitedAttendance || (attendanceStart <= now && attendanceEnd >= now)),
    attendanceStatus: row.attendance_status,
    performanceLevel: row.performance_level,
    observations: row.observations,
    appointmentType: row.appointment_type || 'PRACTICAL_CLASS',
    isExamOnly: row.appointment_type === 'EXAM_ONLY',
    topics: Array.isArray(row.topics) ? row.topics : [],
    isQrTest: Boolean(row.is_qr_test),
    recommendedRoute: row.route_id ? mapRoute(row) : null,
    isScheduleOnly: Boolean(row.is_schedule_only),
    isAdditionalPractice: Boolean(row.is_additional_practice),
    additionalPracticeId: row.additional_practice_id || null,
  };
}

function mapRoute(row) {
  return {
    id: row.route_id,
    code: row.route_code,
    name: row.route_name,
    level: row.route_level,
    recommendedSessionNumber: row.route_session_number,
    originLabel: row.origin_label,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    destinationLabel: row.destination_label,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    waypoints: row.waypoints || [],
    focusTopics: row.focus_topics || [],
    estimatedMinutes: row.estimated_minutes,
    mapsUrl: buildMapsDirectionsUrl(row),
    embedUrl: buildMapsEmbedUrl(row),
    mapTiler: buildMapTilerConfig(row),
  };
}

function routePoint(label, lat, lng) {
  if (lat !== null && lat !== undefined && lng !== null && lng !== undefined) return `${lat},${lng}`;
  return label || '';
}

function buildMapsDirectionsUrl(row) {
  const origin = routePoint(row.origin_label, row.origin_lat, row.origin_lng);
  const destination = routePoint(row.destination_label, row.destination_lat, row.destination_lng);
  const waypoints = Array.isArray(row.waypoints) ? row.waypoints : [];
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    origin,
    destination,
  });
  const waypointText = waypoints.map(point => routePoint(point.label, point.lat, point.lng)).filter(Boolean).join('|');
  if (waypointText) params.set('waypoints', waypointText);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function buildMapsEmbedUrl(row) {
  const key = process.env.GOOGLE_MAPS_EMBED_API_KEY;
  if (!key) return null;
  const origin = routePoint(row.origin_label, row.origin_lat, row.origin_lng);
  const destination = routePoint(row.destination_label, row.destination_lat, row.destination_lng);
  const waypoints = Array.isArray(row.waypoints) ? row.waypoints : [];
  const params = new URLSearchParams({
    key,
    origin,
    destination,
    mode: 'driving',
  });
  const waypointText = waypoints.map(point => routePoint(point.label, point.lat, point.lng)).filter(Boolean).join('|');
  if (waypointText) params.set('waypoints', waypointText);
  return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
}

function buildMapTilerConfig(row) {
  const key = process.env.MAPTILER_API_KEY || process.env.MAPTILER_KEY;
  if (!key) return null;

  const points = [];
  if (row.origin_lat !== null && row.origin_lng !== null) {
    points.push({
      label: row.origin_label,
      coordinates: [Number(row.origin_lng), Number(row.origin_lat)],
      type: 'origin',
    });
  }

  const waypoints = Array.isArray(row.waypoints) ? row.waypoints : [];
  waypoints.forEach((point, index) => {
    if (point?.lat !== undefined && point?.lng !== undefined) {
      points.push({
        label: point.label || `Punto ${index + 1}`,
        coordinates: [Number(point.lng), Number(point.lat)],
        type: 'waypoint',
      });
    }
  });

  if (row.destination_lat !== null && row.destination_lng !== null) {
    points.push({
      label: row.destination_label,
      coordinates: [Number(row.destination_lng), Number(row.destination_lat)],
      type: 'destination',
    });
  }

  if (points.length < 2) return null;

  return {
    apiKey: key,
    style: 'streets-v2',
    points,
    lineCoordinates: points.map(point => point.coordinates),
  };
}

class InstructorService {
  static async getInstructorContext(user) {
    if (!user || user.role !== 'instructor') throw createError(403, 'Acceso permitido solo para instructores');

    const result = await db.query(`
      SELECT ip.*, u.branch_id, b.name AS branch_name, u.first_name, u.last_name, u.email, u.city
      FROM instructor_profiles ip
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE ip.user_id = $1 AND ip.deleted_at IS NULL
    `, [user.id]);

    if (result.rows.length === 0) throw createError(403, 'Perfil de instructor no configurado');
    return result.rows[0];
  }

  static async audit(client, user, action, entity, entityId, metadata = {}) {
    await client.query(`
      INSERT INTO audit_logs (user_id, role, branch_id, action, entity, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [user.id, user.role, user.branch_id || null, action, entity, entityId || null, metadata]);
  }

  static async getDashboard(user) {
    const instructor = await this.getInstructorContext(user);
    const { start, end } = toDateRange({ date: new Date().toISOString().slice(0, 10) });

    const upcomingLimit = new Date();
    upcomingLimit.setFullYear(upcomingLimit.getFullYear() + 1);
    const [sessions, upcomingSessions, pendingAttendance, openIncidents, routePreview, monthlyActivity, completedMonth, scheduleRoster, practiceRoster] = await Promise.all([
      this.getAgenda(user, { startDate: start.slice(0, 10), endDate: end.slice(0, 10) }),
      this.getAgenda(user, {
        startDate: new Date().toISOString().slice(0, 10),
        endDate: upcomingLimit.toISOString().slice(0, 10),
      }),
      db.query(`
        SELECT COUNT(*)::int AS count
        FROM practical_sessions
        WHERE instructor_id = $1 AND status = 'COMPLETADA' AND attendance_status IS NULL
      `, [instructor.id]),
      db.query(`
        SELECT i.id,i.incident_type,i.priority,i.status,i.description,i.reported_at,
               CONCAT_WS(' ',s.first_name,s.last_name) student_name
        FROM incidents i
        LEFT JOIN enrollments e ON e.id=i.enrollment_id
        LEFT JOIN students s ON s.id=e.student_id
        WHERE i.instructor_id=$1 AND i.status IN ('ABIERTA','EN_REVISION')
        ORDER BY i.reported_at DESC
      `, [instructor.id]),
      db.query(`
        SELECT tr.id AS route_id, tr.code AS route_code, tr.name AS route_name,
               tr.level AS route_level, tr.recommended_session_number AS route_session_number,
               tr.origin_label, tr.origin_lat, tr.origin_lng, tr.destination_label,
               tr.destination_lat, tr.destination_lng, tr.waypoints, tr.focus_topics,
               tr.estimated_minutes
        FROM training_routes tr
        WHERE tr.city_id = (SELECT city_id FROM branches WHERE id = $1)
          AND tr.active = true AND tr.deleted_at IS NULL
        -- Si hoy no existe una clase con ruta asignada, la tarjeta funciona
        -- como vista previa y debe enseñar la configuración recién cargada.
        ORDER BY tr.updated_at DESC, tr.recommended_session_number DESC, tr.name
        LIMIT 1
      `, [instructor.branch_id]),
      db.query(`
        SELECT COUNT(*)::int AS completed_sessions,
               COUNT(DISTINCT enrollment_id)::int AS students,
               COALESCE(ROUND((SUM(EXTRACT(EPOCH FROM
                 (COALESCE(actual_end,scheduled_end)-COALESCE(actual_start,scheduled_start))))
               / 3600.0)::numeric, 1), 0)::numeric AS hours
        FROM practical_sessions
        WHERE instructor_id=$1 AND deleted_at IS NULL
          AND status='COMPLETADA'
          AND scheduled_start >= DATE_TRUNC('month', CURRENT_DATE)
          AND scheduled_start < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
      `, [instructor.id]),
      db.query(`
        SELECT ps.id,ps.session_number,ps.scheduled_start,ps.actual_start,ps.actual_end,
               CONCAT_WS(' ',s.first_name,s.last_name) student_name,c.name course_name,
               ROUND((EXTRACT(EPOCH FROM (COALESCE(ps.actual_end,ps.scheduled_end)
                 -COALESCE(ps.actual_start,ps.scheduled_start)))/3600.0)::numeric,2) duration_hours
        FROM practical_sessions ps
        JOIN enrollments e ON e.id=ps.enrollment_id
        JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        JOIN courses c ON c.id=e.course_id
        WHERE ps.instructor_id=$1 AND ps.deleted_at IS NULL AND ps.status='COMPLETADA'
          AND ps.scheduled_start>=DATE_TRUNC('month',CURRENT_DATE)
          AND ps.scheduled_start<DATE_TRUNC('month',CURRENT_DATE)+INTERVAL '1 month'
        ORDER BY c.name,ps.scheduled_start,s.first_name,s.last_name
      `, [instructor.id]),
      db.query(`
        WITH cycle_candidates AS (
          SELECT cc.id,cc.start_date,cc.end_date,cc.code,
                 EXISTS (SELECT 1 FROM course_cycle_schedule_assignments assigned
                   JOIN enrollments enrolled ON enrolled.id=assigned.enrollment_id
                     AND LOWER(enrolled.status)='activo'
                   WHERE assigned.cycle_id=cc.id AND assigned.instructor_id=$1
                     AND assigned.status='activo') AS has_students,
                 CASE
                   WHEN (NOW() AT TIME ZONE 'America/Guayaquil')::date BETWEEN cc.start_date AND cc.end_date THEN 'current'
                   WHEN cc.start_date > (NOW() AT TIME ZONE 'America/Guayaquil')::date THEN 'next'
                   ELSE 'past'
                 END AS schedule_bucket
          FROM course_cycles cc
          WHERE cc.active=TRUE AND cc.deleted_at IS NULL
            AND (
              EXISTS (SELECT 1 FROM course_cycle_schedule_assignments a
                JOIN enrollments e ON e.id=a.enrollment_id AND LOWER(e.status)='activo'
                WHERE a.cycle_id=cc.id AND a.instructor_id=$1 AND a.status='activo')
              OR EXISTS (SELECT 1 FROM course_cycle_instructors cci
                WHERE cci.cycle_id=cc.id AND cci.instructor_id=$1 AND cci.active=TRUE)
              OR EXISTS (SELECT 1 FROM instructor_group_members igm
                WHERE igm.group_id=cc.group_id AND igm.instructor_id=$1
                  AND igm.active=TRUE AND igm.ended_at IS NULL)
            )
            AND cc.end_date >= (NOW() AT TIME ZONE 'America/Guayaquil')::date
          GROUP BY cc.id,cc.start_date,cc.end_date,cc.code
        ),
        selected_cycle AS (
          SELECT id
          FROM (
            SELECT id,schedule_bucket,
                   ROW_NUMBER() OVER (
                     PARTITION BY schedule_bucket
                     ORDER BY
                       CASE WHEN schedule_bucket='current' AND has_students THEN 0 ELSE 1 END,
                       start_date,code
                   ) AS bucket_position
            FROM cycle_candidates
            WHERE schedule_bucket IN ('current','next')
          ) ranked
          WHERE bucket_position=1
          ORDER BY
            CASE
              WHEN schedule_bucket='current' THEN 0
              ELSE 1
            END
        )
        SELECT CASE
                 WHEN (NOW() AT TIME ZONE 'America/Guayaquil')::date BETWEEN cc.start_date AND cc.end_date THEN 0
                 ELSE 1
               END sort_bucket,
               'student' row_type,cc.id cycle_id,cc.code cycle_code,cc.start_date,cc.end_date,
               c.name course_name,e.id enrollment_id,s.id student_id,s.identification,
               CONCAT_WS(' ',s.first_name,s.last_name) student_name,s.phone,
               MIN(a.start_time)::text start_time,MAX(a.end_time)::text end_time,
               COUNT(DISTINCT a.schedule_date)::int class_days,
               NULL::text block_reason_type,NULL::text block_reason,s.notes AS student_notes
        FROM course_cycle_schedule_assignments a
        JOIN selected_cycle sc ON sc.id=a.cycle_id
        JOIN course_cycles cc ON cc.id=a.cycle_id
        JOIN enrollments e ON e.id=a.enrollment_id AND LOWER(e.status)='activo'
        JOIN students s ON s.status <> 'inhabilitado' AND s.id=a.student_id
        JOIN courses c ON c.id=cc.course_id
        WHERE a.instructor_id=$1 AND a.status='activo'
          AND cc.active=TRUE AND cc.deleted_at IS NULL
          AND cc.end_date >= (NOW() AT TIME ZONE 'America/Guayaquil')::date
        GROUP BY cc.id,c.id,e.id,s.id
        UNION ALL
        SELECT CASE WHEN (NOW() AT TIME ZONE 'America/Guayaquil')::date BETWEEN cc.start_date AND cc.end_date THEN 0 ELSE 1 END sort_bucket,
               'student' row_type,cc.id cycle_id,cc.code cycle_code,cc.start_date,cc.end_date,
               c.name course_name,e.id enrollment_id,s.id student_id,s.identification,
               CONCAT_WS(' ',s.first_name,s.last_name) student_name,s.phone,
               MIN(ps.scheduled_start::time)::text start_time,MAX(ps.scheduled_end::time)::text end_time,
               COUNT(DISTINCT ps.scheduled_start::date)::int class_days,
               NULL::text block_reason_type,NULL::text block_reason,
               CONCAT_WS(' - ', 'Solo examen', NULLIF(s.notes,'')) student_notes
        FROM practical_sessions ps
        JOIN enrollments e ON e.id=ps.enrollment_id AND LOWER(e.status)='activo'
        JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        JOIN selected_cycle sc ON TRUE
        JOIN course_cycles cc ON cc.id=sc.id AND cc.branch_id=ps.branch_id AND cc.course_id=e.course_id
          AND ps.scheduled_start::date BETWEEN cc.start_date AND cc.end_date
        JOIN courses c ON c.id=e.course_id
        WHERE ps.instructor_id=$1 AND ps.appointment_type='EXAM_ONLY' AND ps.deleted_at IS NULL
          AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
        GROUP BY cc.id,c.id,e.id,s.id
        UNION ALL
        SELECT CASE
                 WHEN (NOW() AT TIME ZONE 'America/Guayaquil')::date BETWEEN cc.start_date AND cc.end_date THEN 0
                 ELSE 1
               END sort_bucket,
               'block' row_type,cc.id cycle_id,cc.code cycle_code,cc.start_date,cc.end_date,
               c.name course_name,NULL::uuid enrollment_id,NULL::uuid student_id,NULL::text identification,
               COALESCE(
                 NULLIF(REGEXP_REPLACE(o.reason,'^[^:]+:\\s*','','i'),''),
                 CASE
                   WHEN o.reason_type='transport' THEN 'OCUPADO TRANSPORTE'
                   WHEN o.reason_type='other' THEN 'OCUPADO'
                   ELSE 'OCUPADO'
                 END
               ) student_name,NULL::text phone,
               MIN(o.start_time)::text start_time,MAX(o.end_time)::text end_time,
               COUNT(DISTINCT o.schedule_date)::int class_days,
               o.reason_type::text block_reason_type,MAX(o.reason)::text block_reason,NULL::text student_notes
        FROM instructor_availability_overrides o
        JOIN selected_cycle sc ON TRUE
        JOIN course_cycles cc ON cc.id=sc.id
        JOIN courses c ON c.id=cc.course_id
        WHERE o.instructor_id=$1 AND o.active=TRUE AND o.status='blocked'
          AND o.schedule_date BETWEEN cc.start_date AND cc.end_date
        GROUP BY cc.id,c.id,o.reason_type,o.start_time,o.end_time,
                 COALESCE(
                   NULLIF(REGEXP_REPLACE(o.reason,'^[^:]+:\\s*','','i'),''),
                   CASE
                     WHEN o.reason_type='transport' THEN 'OCUPADO TRANSPORTE'
                     WHEN o.reason_type='other' THEN 'OCUPADO'
                     ELSE 'OCUPADO'
                   END
                 )
        ORDER BY
          sort_bucket,start_date,cycle_code,start_time,student_name
      `, [instructor.id]),
      this.getAdditionalPracticeScheduleRoster(instructor.id),
    ]);

    const todaySessions = sessions.data;
    const completedToday = todaySessions.filter(item => COMPLETED_STATUSES.includes(item.status)).length;
    const nextSession = upcomingSessions.data.find(item => (
      item.status === ACTIVE_SESSION_STATUS
      || (STARTABLE_STATUSES.includes(item.status) && !item.isExpired)
    )) || null;
    if (nextSession && !nextSession.recommendedRoute) {
      const routeDay = Math.max(Number(nextSession.sessionNumber || 1), 2);
      const matchedRoute = await db.query(`
        SELECT tr.id AS route_id, tr.code AS route_code, tr.name AS route_name,
               tr.level AS route_level, tr.recommended_session_number AS route_session_number,
               tr.origin_label, tr.origin_lat, tr.origin_lng, tr.destination_label,
               tr.destination_lat, tr.destination_lng, tr.waypoints, tr.focus_topics,
               tr.estimated_minutes
        FROM training_routes tr
        WHERE tr.city_id=(SELECT city_id FROM branches WHERE id=$1)
          AND (tr.course_id=$2 OR tr.course_id IS NULL)
          AND tr.recommended_session_number=$3
          AND tr.active=TRUE AND tr.deleted_at IS NULL
        ORDER BY (tr.course_id=$2) DESC, tr.updated_at DESC, tr.name
        LIMIT 1
      `, [nextSession.branchId, nextSession.courseId, routeDay]);
      if (matchedRoute.rows[0]) nextSession.recommendedRoute = mapRoute(matchedRoute.rows[0]);
    }
    const expiredToday = todaySessions.filter(item => item.isExpired).length;
    const pendingToday = todaySessions.filter(item =>
      item.status === ACTIVE_SESSION_STATUS
      || (STARTABLE_STATUSES.includes(item.status) && !item.isExpired)
    ).length;
    const scheduleCourses = [...[...scheduleRoster.rows, ...practiceRoster.rows].reduce((groups, row) => {
      const key = String(row.cycle_id);
      if (!groups.has(key)) groups.set(key, {
        id: row.cycle_id,
        code: row.cycle_code,
        course: row.course_name,
        startDate: row.start_date,
        endDate: row.end_date,
        isAdditionalPractice: row.row_type === 'practice',
        students: [],
      });
      groups.get(key).students.push({
        type: row.row_type || 'student',
        enrollmentId: row.enrollment_id,
        studentId: row.student_id,
        name: row.student_name,
        identification: row.identification,
        phone: row.phone,
        notes: row.student_notes || null,
        startTime: String(row.start_time || '').slice(0, 5),
        endTime: String(row.end_time || '').slice(0, 5),
        classDays: Number(row.class_days || 0),
        status: row.row_type === 'block'
          ? (row.block_reason_type === 'transport' ? 'transporte' : 'ocupacion')
          : row.row_type === 'practice' ? 'practica_adicional' : 'matriculado',
        blockReasonType: row.block_reason_type || null,
        blockReason: row.block_reason || null,
      });
      return groups;
    }, new Map()).values()];

    return {
      instructor: {
        name: `${instructor.first_name} ${instructor.last_name}`,
        roleLabel: 'Instructor practico',
        branch: instructor.branch_name || user.branch || '',
        status: instructor.status,
        specialty: instructor.specialty,
      },
      summary: {
        scheduledToday: todaySessions.length,
        completedToday,
        nextSession,
        pendingToday,
        pendingAttendance: Number(pendingAttendance.rows[0]?.count || 0) + expiredToday,
        monthlyStudents: monthlyActivity.rows[0]?.students || 0,
        monthlyCompletedSessions: monthlyActivity.rows[0]?.completed_sessions || 0,
        monthlyHours: monthlyActivity.rows[0]?.hours || 0,
        openIncidents: openIncidents.rows.length,
      },
      todayAgenda: todaySessions,
      scheduleCourses,
      completedMonth: completedMonth.rows.map(row => ({
        id: row.id,
        studentName: row.student_name,
        course: row.course_name,
        sessionNumber: row.session_number,
        scheduledStart: row.scheduled_start,
        durationHours: Number(row.duration_hours || 0),
      })),
      openIncidents: openIncidents.rows.map(row => ({
        id: row.id,
        type: row.incident_type,
        priority: row.priority,
        status: row.status,
        description: row.description,
        reportedAt: row.reported_at,
        studentName: row.student_name || null,
      })),
      routePreview: null,
    };
  }

  static async getAdditionalPracticeScheduleRoster(instructorId) {
    return db.query(`SELECT 'practice'::text row_type,CONCAT('practice:',ap.id) cycle_id,
      'Horas practicas'::text cycle_code,'Practicas adicionales'::text course_name,
      ap.start_date,(ap.start_date+ap.number_of_days-1) end_date,
      s.id student_id,s.identification,CONCAT_WS(' ',s.first_name,s.last_name) student_name,
      s.phone,s.notes student_notes,ap.daily_start_time::text start_time,
      (ap.daily_start_time+INTERVAL '100 minutes')::time::text end_time,
      ap.number_of_days class_days
      FROM additional_driving_practices ap
      JOIN students s ON s.id=ap.student_id AND s.status<>'inhabilitado'
      WHERE ap.instructor_id=$1 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
        AND ap.start_date+ap.number_of_days-1 >= (NOW() AT TIME ZONE 'America/Guayaquil')::date
      ORDER BY ap.start_date,ap.daily_start_time,s.last_name,ap.id`,[instructorId]);
  }

  static async getAgenda(user, query) {
    const instructor = await this.getInstructorContext(user);
    const { start, end } = toDateRange(query);
    const params = [instructor.id, start, end];
    let where = `
      ps.instructor_id = $1
      AND ps.deleted_at IS NULL
      AND (ps.scheduled_start BETWEEN $2 AND $3
        ${String(query.includePendingExams || '') === '1' && query.appointmentType === 'EXAM_ONLY'
          ? "OR (ps.appointment_type='EXAM_ONLY' AND ps.status IN ('PROGRAMADA','PROXIMA','EN_CURSO'))" : ''})
    `;

    if (query.status) {
      params.push(query.status);
      where += ` AND ps.status = $${params.length}`;
    }
    if (query.course) {
      params.push(`%${query.course}%`);
      where += ` AND co.name ILIKE $${params.length}`;
    }
    if (query.student) {
      params.push(`%${query.student}%`);
      where += ` AND (CONCAT_WS(' ',s.first_name,s.last_name) ILIKE $${params.length}
        OR s.identification ILIKE $${params.length})`;
    }
    if (query.appointmentType) {
      params.push(query.appointmentType);
      where += ` AND ps.appointment_type = $${params.length}`;
    }

    const result = await db.query(`
      SELECT ps.*, e.course_id AS enrollment_course_id,
             s.id AS student_id, s.first_name AS student_first_name,
             s.last_name AS student_last_name,
             s.address AS student_address, s.notes AS student_notes,
             pickup.name AS pickup_branch_name,
             co.name AS course_name, b.name AS branch_name,
             (s.identification = '1792601140') AS is_qr_test,
             v.code AS vehicle_code, v.plate,
             tr.id AS route_id, tr.code AS route_code, tr.name AS route_name, tr.level AS route_level,
             tr.recommended_session_number AS route_session_number, tr.origin_label, tr.origin_lat,
             tr.origin_lng, tr.destination_label, tr.destination_lat, tr.destination_lng,
             tr.waypoints, tr.focus_topics, tr.estimated_minutes,
             COALESCE((SELECT json_agg(json_build_object('code',st.code,'name',st.name) ORDER BY st.name)
               FROM practical_session_topic_records pstr JOIN session_topics st ON st.id=pstr.topic_id
               WHERE pstr.practical_session_id=ps.id),'[]'::json) AS topics
      FROM practical_sessions ps
      JOIN enrollments e ON e.id = ps.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses co ON co.id = e.course_id
      JOIN branches b ON b.id = ps.branch_id
      LEFT JOIN branches pickup ON pickup.id = COALESCE(s.pickup_branch_id, s.branch_id)
      LEFT JOIN vehicles v ON v.id = ps.vehicle_id
      LEFT JOIN training_routes tr ON tr.id = ps.recommended_route_id
        AND tr.city_id = b.city_id AND tr.deleted_at IS NULL
      WHERE ${where}
      ORDER BY ps.scheduled_start ASC
    `, params);

    const scheduleParams = [instructor.id, start, end];
    let scheduleWhere = '';
    if (query.status && !['PROGRAMADA', 'PROXIMA'].includes(query.status)) {
      scheduleWhere += ' AND FALSE';
    }
    if (query.course) {
      scheduleParams.push(`%${query.course}%`);
      scheduleWhere += ` AND co.name ILIKE $${scheduleParams.length}`;
    }
    if (query.student) {
      scheduleParams.push(`%${query.student}%`);
      scheduleWhere += ` AND (CONCAT_WS(' ',s.first_name,s.last_name) ILIKE $${scheduleParams.length}
        OR s.identification ILIKE $${scheduleParams.length})`;
    }
    if (query.appointmentType && query.appointmentType !== 'PRACTICAL_CLASS') {
      scheduleWhere += ' AND FALSE';
    }
    const scheduledAssignments = await db.query(`
      SELECT assignment.id,assignment.enrollment_id,assignment.instructor_id,e.branch_id,
        assignment.schedule_date+assignment.start_time AS scheduled_start,
        assignment.schedule_date+assignment.end_time AS scheduled_end,
        (SELECT COUNT(*)::int FROM course_cycle_schedule_assignments previous
          WHERE previous.enrollment_id=assignment.enrollment_id AND previous.status='activo'
            AND (previous.schedule_date,previous.start_time)<=(assignment.schedule_date,assignment.start_time)) AS session_number,
        'PROGRAMADA'::text AS status,NULL::timestamp AS actual_start,NULL::timestamp AS actual_end,
        NULL::text AS attendance_status,NULL::text AS performance_level,NULL::text AS observations,
        'PRACTICAL_CLASS'::text AS appointment_type,TRUE AS is_schedule_only,
        e.course_id AS enrollment_course_id,s.id AS student_id,s.first_name AS student_first_name,
        s.last_name AS student_last_name,s.address AS student_address,s.notes AS student_notes,
        pickup.name AS pickup_branch_name,
        co.name AS course_name,b.name AS branch_name,(s.identification='1792601140') AS is_qr_test,
        NULL::text AS vehicle_code,NULL::text AS plate,NULL::uuid AS route_id,'[]'::json AS topics
      FROM course_cycle_schedule_assignments assignment
      JOIN enrollments e ON e.id=assignment.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
      JOIN courses co ON co.id=e.course_id
      JOIN branches b ON b.id=e.branch_id
      LEFT JOIN branches pickup ON pickup.id=COALESCE(s.pickup_branch_id,s.branch_id)
      WHERE assignment.instructor_id=$1 AND assignment.status='activo'
        AND assignment.schedule_date+assignment.start_time BETWEEN $2::timestamp AND $3::timestamp
        AND NOT EXISTS(SELECT 1 FROM practical_sessions ps
          WHERE ps.enrollment_id=assignment.enrollment_id AND ps.instructor_id=assignment.instructor_id
            AND ps.scheduled_start=assignment.schedule_date+assignment.start_time AND ps.deleted_at IS NULL)
        ${scheduleWhere}
      ORDER BY scheduled_start
    `, scheduleParams);

    const additionalParams = [instructor.id, start, end];
    let additionalWhere = '';
    if (query.status && !['PROGRAMADA', 'PROXIMA'].includes(query.status)) additionalWhere += ' AND FALSE';
    if (query.appointmentType && query.appointmentType !== 'PRACTICAL_CLASS') additionalWhere += ' AND FALSE';
    if (query.course) {
      additionalParams.push(`%${query.course}%`);
      additionalWhere += ` AND 'Practicas adicionales' ILIKE $${additionalParams.length}`;
    }
    if (query.student) {
      additionalParams.push(`%${query.student}%`);
      additionalWhere += ` AND (CONCAT_WS(' ',s.first_name,s.last_name) ILIKE $${additionalParams.length}
        OR s.identification ILIKE $${additionalParams.length})`;
    }
    const additionalSessions = await db.query(`
      SELECT CONCAT('additional:',ap.id,':',day_offset) id,ap.id additional_practice_id,
        ap.branch_id,ap.student_id,s.first_name student_first_name,s.last_name student_last_name,
        s.address student_address,s.notes student_notes,pickup.name pickup_branch_name,
        b.name branch_name,'Practicas adicionales'::text course_name,
        ap.start_date+day_offset+ap.daily_start_time scheduled_start,
        ap.start_date+day_offset+ap.daily_start_time+INTERVAL '100 minutes' scheduled_end,
        day_offset+1 session_number,'PROGRAMADA'::text status,
        TRUE is_schedule_only,TRUE is_additional_practice
      FROM additional_driving_practices ap
      JOIN students s ON s.id=ap.student_id AND s.status<>'inhabilitado'
      JOIN branches b ON b.id=ap.branch_id
      LEFT JOIN branches pickup ON pickup.id=COALESCE(s.pickup_branch_id,s.branch_id)
      CROSS JOIN LATERAL generate_series(0,ap.number_of_days-1) day_offset
      WHERE ap.instructor_id=$1 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
        AND day_offset>=ap.completed_days
        AND ap.start_date+day_offset+ap.daily_start_time BETWEEN $2::timestamp AND $3::timestamp
        ${additionalWhere}
    `, additionalParams);
    return { data: [...result.rows, ...scheduledAssignments.rows, ...additionalSessions.rows]
      .map(mapSession)
      .sort((first, second) => new Date(first.scheduledStart) - new Date(second.scheduledStart)) };
  }

  static async getReferrals(user) {
    const instructor = await this.getInstructorContext(user);
    const [students, cycles] = await Promise.all([
      db.query(`SELECT s.id student_id,e.id enrollment_id,s.first_name || ' ' || s.last_name student_name,
        s.identification,c.name course_name,e.course_id,e.branch_id,b.name branch_name,
        reservation.id reservation_id,reservation.cycle_id,reservation.status reservation_status,
        reservation.reserved_start_time,reservation.reserved_end_time,
        cc.code reserved_cycle_code,cc.start_date reserved_start_date
        FROM students s JOIN enrollments e ON e.student_id=s.id AND e.status='activo'
        JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id
        LEFT JOIN course_cycle_seat_reservations reservation ON reservation.enrollment_id=e.id AND reservation.status='activo'
        LEFT JOIN course_cycles cc ON cc.id=reservation.cycle_id
        WHERE s.referred_by_user_id=$1
        ORDER BY s.first_name,s.last_name`, [user.id]),
      db.query(`SELECT cc.id,cc.code,cc.branch_id,cc.course_id,cc.start_date,cc.end_date,
        c.name course_name,b.name branch_name,
        (COALESCE(NULLIF((SELECT COUNT(DISTINCT CONCAT(slot.start_time,'-',slot.end_time))
          FROM branch_course_programs program
          JOIN branch_course_schedule_templates slot ON slot.program_id=program.id
            AND slot.modality=cc.modality AND slot.active=TRUE
          WHERE program.branch_id=cc.branch_id AND program.course_id=cc.course_id),0),1)
          * GREATEST(cc.capacity_per_instructor,1))::int capacity,
        (SELECT COUNT(DISTINCT occupied.enrollment_id)::int FROM (
          SELECT assignment.enrollment_id FROM course_cycle_schedule_assignments assignment
            WHERE assignment.cycle_id=cc.id AND assignment.instructor_id=$1 AND assignment.status='activo'
          UNION SELECT COALESCE(seat.enrollment_id,seat.id) FROM course_cycle_seat_reservations seat
            WHERE seat.cycle_id=cc.id AND seat.instructor_id=$1 AND seat.status='activo') occupied) occupied
        FROM course_cycles cc JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id
        LEFT JOIN course_cycle_instructors cci ON cci.cycle_id=cc.id AND cci.active=TRUE
        LEFT JOIN instructor_group_members igm ON igm.group_id=cc.group_id AND igm.active=TRUE AND igm.ended_at IS NULL
        WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.status IN ('proximo','activo') AND cc.modality='normal' AND cc.start_date>CURRENT_DATE
          AND (EXISTS(SELECT 1 FROM course_cycle_instructors own_cycle WHERE own_cycle.cycle_id=cc.id AND own_cycle.instructor_id=$1 AND own_cycle.active=TRUE)
            OR EXISTS(SELECT 1 FROM instructor_group_members own_group WHERE own_group.group_id=cc.group_id AND own_group.instructor_id=$1 AND own_group.active=TRUE AND own_group.ended_at IS NULL))
        GROUP BY cc.id,c.id,b.id ORDER BY cc.start_date`, [instructor.id]),
    ]);
    const prospects=await db.query(`SELECT seat.id reservation_id,NULL::uuid enrollment_id,NULL::uuid student_id,
      seat.referred_name student_name,seat.referred_identification identification,
      c.name course_name,seat.course_id,seat.branch_id,b.name branch_name,seat.cycle_id,
      seat.status reservation_status,cc.code reserved_cycle_code,cc.start_date reserved_start_date,
      seat.reserved_start_time,seat.reserved_end_time
      FROM course_cycle_seat_reservations seat JOIN course_cycles cc ON cc.id=seat.cycle_id
      JOIN courses c ON c.id=seat.course_id JOIN branches b ON b.id=seat.branch_id
      WHERE seat.instructor_id=$1 AND seat.status='activo' AND seat.enrollment_id IS NULL`,[instructor.id]);
    const slots = cycles.rows.length
      ? await this.getReferralCycleSlots(db, cycles.rows.map(row=>row.id), instructor.id)
      : [];
    const slotsByCycle = slots.reduce((map, slot) => {
      const values = map.get(String(slot.cycle_id)) || [];
      values.push({
        startTime: String(slot.start_time).slice(0,5),
        endTime: String(slot.end_time).slice(0,5),
        dates: slot.schedule_dates || [],
      });
      map.set(String(slot.cycle_id), values);
      return map;
    }, new Map());
    return {
      data: [...students.rows,...prospects.rows],
      cycles: cycles.rows.map(row=>({
        ...row,
        capacity:Number(row.capacity),
        occupied:Number(row.occupied),
        available:Math.max(Number(row.capacity)-Number(row.occupied),0),
        availableSlots:slotsByCycle.get(String(row.id)) || [],
      })),
      instructor: { id: instructor.id, name: `${instructor.first_name} ${instructor.last_name}` },
    };
  }

  static async getReferralCycleSlots(queryable, cycleIds, instructorId, excludedReservationId = null) {
    const ids = Array.isArray(cycleIds) ? cycleIds : [cycleIds];
    if (!ids.length) return [];
    const result = await queryable.query(`
      WITH configured_slots AS (
        SELECT DISTINCT cc.id cycle_id,cc.start_date,cc.end_date,t.day_of_week,t.start_time,t.end_time
        FROM course_cycles cc
        JOIN branch_course_programs p ON p.branch_id=cc.branch_id AND p.course_id=cc.course_id
        JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.modality=cc.modality AND t.active=TRUE
        WHERE cc.id=ANY($1::uuid[])
      ), slot_dates AS (
        SELECT slot.*,day::date schedule_date
        FROM configured_slots slot
        CROSS JOIN LATERAL generate_series(slot.start_date,slot.end_date,INTERVAL '1 day') day
        WHERE EXTRACT(DOW FROM day)=slot.day_of_week
      )
      SELECT cycle_id,start_time,end_time,array_agg(schedule_date ORDER BY schedule_date) schedule_dates
      FROM slot_dates selected
      WHERE (
        NOT EXISTS(SELECT 1 FROM instructor_availability base WHERE base.instructor_id=$2 AND base.active=TRUE)
        OR EXISTS(SELECT 1 FROM instructor_availability base
          WHERE base.instructor_id=$2 AND base.active=TRUE AND base.weekday=selected.day_of_week
            AND base.start_time<=selected.start_time AND base.end_time>=selected.end_time)
      )
      AND NOT EXISTS (
        SELECT 1 FROM course_cycle_schedule_assignments assigned
        WHERE assigned.instructor_id=$2 AND assigned.status='activo'
          AND assigned.schedule_date=selected.schedule_date
          AND assigned.start_time<selected.end_time AND assigned.end_time>selected.start_time
      )
      AND NOT EXISTS (
        SELECT 1 FROM referred_instructor_schedule_blocks block
        WHERE block.instructor_id=$2 AND block.status='activo'
          AND block.schedule_date=selected.schedule_date
          AND block.start_time<selected.end_time AND block.end_time>selected.start_time
      )
      AND NOT EXISTS (
        SELECT 1 FROM instructor_availability_overrides override
        WHERE override.instructor_id=$2 AND override.active=TRUE
          AND override.schedule_date=selected.schedule_date
          AND override.start_time<selected.end_time AND override.end_time>selected.start_time
          AND ($3::uuid IS NULL OR override.reason NOT LIKE CONCAT('RESERVA_CURSO:',$3::text,':%'))
      )
      AND NOT EXISTS (
        SELECT 1 FROM theory_class_schedules theory
        WHERE theory.instructor_id=$2 AND theory.active=TRUE
          AND theory.start_time<selected.end_time AND theory.end_time>selected.start_time
          AND (theory.class_date=selected.schedule_date OR (theory.recurring=TRUE AND (
            (theory.modality='presencial_regular' AND selected.day_of_week BETWEEN 1 AND 5)
            OR (theory.modality='presencial_sabado' AND selected.day_of_week=6))))
      )
      GROUP BY cycle_id,start_time,end_time
      HAVING COUNT(*)=(SELECT COUNT(*) FROM slot_dates expected
        WHERE expected.cycle_id=selected.cycle_id AND expected.start_time=selected.start_time AND expected.end_time=selected.end_time)
      ORDER BY cycle_id,start_time
    `,[ids,instructorId,excludedReservationId]);
    return result.rows;
  }

  static async reserveReferralSeat(user, data = {}) {
    const instructor = await this.getInstructorContext(user);
    if (!data.cycleId) throw createError(422, 'El próximo inicio es requerido');
    const scheduleMatch=String(data.scheduleTime||'').match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if(!scheduleMatch)throw createError(422,'El horario práctico es requerido');
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`cycle-seat:${data.cycleId}`]);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`referral-slot:${instructor.id}:${data.cycleId}:${data.scheduleTime}`]);
      let candidate=data.enrollmentId?(await client.query(`SELECT e.id enrollment_id,e.student_id,e.course_id,e.branch_id
        FROM enrollments e JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        WHERE e.id=$1 AND e.status='activo' AND s.referred_by_user_id=$2 FOR UPDATE OF e`,[data.enrollmentId,user.id])).rows[0]:null;
      if(data.enrollmentId&&!candidate)throw createError(404,'El estudiante no pertenece a tus referidos activos');
      if(!candidate){if(!String(data.referredName||'').trim()||!data.courseId||!data.branchId)throw createError(422,'Nombre, curso y sucursal del referido son requeridos');candidate={enrollment_id:null,student_id:null,course_id:data.courseId,branch_id:data.branchId};}
      const cycle=(await client.query(`SELECT cc.id,cc.code,cc.start_date,
        (COALESCE(NULLIF((SELECT COUNT(DISTINCT CONCAT(slot.start_time,'-',slot.end_time))
          FROM branch_course_programs program
          JOIN branch_course_schedule_templates slot ON slot.program_id=program.id
            AND slot.modality=cc.modality AND slot.active=TRUE
          WHERE program.branch_id=cc.branch_id AND program.course_id=cc.course_id),0),1)
          * GREATEST(cc.capacity_per_instructor,1))::int capacity
        FROM course_cycles cc
        WHERE cc.id=$1 AND cc.course_id=$2 AND cc.branch_id=$3 AND cc.active=TRUE AND cc.deleted_at IS NULL
          AND cc.status IN ('proximo','activo') AND cc.start_date>CURRENT_DATE`,[data.cycleId,candidate.course_id,candidate.branch_id])).rows[0];
      if(!cycle)throw createError(422,'El próximo inicio no corresponde al curso y sucursal del estudiante');
      const belongs=await client.query(`SELECT 1 FROM course_cycles cc WHERE cc.id=$1 AND
        (EXISTS(SELECT 1 FROM course_cycle_instructors cci WHERE cci.cycle_id=cc.id AND cci.instructor_id=$2 AND cci.active=TRUE)
          OR EXISTS(SELECT 1 FROM instructor_group_members igm WHERE igm.group_id=cc.group_id AND igm.instructor_id=$2 AND igm.active=TRUE AND igm.ended_at IS NULL))`,[cycle.id,instructor.id]);
      if(!belongs.rows.length)throw createError(403,'Ese próximo curso no pertenece al instructor');
      const availableSlots=await this.getReferralCycleSlots(client,[cycle.id],instructor.id);
      const selectedSlot=availableSlots.find(slot=>String(slot.start_time).slice(0,5)===scheduleMatch[1]&&String(slot.end_time).slice(0,5)===scheduleMatch[2]);
      if(!selectedSlot)throw createError(409,'Ese horario ya no está disponible para todas las fechas prácticas del curso');
      const occupied=Number((await client.query(`SELECT COUNT(DISTINCT enrollment_id)::int occupied FROM (
        SELECT enrollment_id FROM course_cycle_schedule_assignments WHERE cycle_id=$1 AND instructor_id=$2 AND status='activo'
        UNION SELECT COALESCE(enrollment_id,id) FROM course_cycle_seat_reservations WHERE cycle_id=$1 AND instructor_id=$2 AND status='activo'
          AND ($3::uuid IS NULL OR enrollment_id IS DISTINCT FROM $3)) rows`,[cycle.id,instructor.id,candidate.enrollment_id])).rows[0].occupied);
      if(occupied>=Number(cycle.capacity))throw createError(409,'Ese próximo inicio ya no tiene cupos disponibles');
      if(candidate.enrollment_id){
        const previous=await client.query(`UPDATE course_cycle_seat_reservations SET status='cancelado',cancelled_by=$2,updated_at=NOW()
          WHERE enrollment_id=$1 AND status='activo' RETURNING id`,[candidate.enrollment_id,user.id]);
        for(const oldReservation of previous.rows){
          await client.query(`UPDATE instructor_availability_overrides SET active=FALSE,updated_by=$2,updated_at=NOW()
            WHERE instructor_id=$1 AND active=TRUE AND reason LIKE $3`,[instructor.id,user.id,`RESERVA_CURSO:${oldReservation.id}:%`]);
        }
      }
      const reservation=(await client.query(`INSERT INTO course_cycle_seat_reservations
        (cycle_id,enrollment_id,student_id,instructor_id,referred_name,referred_phone,referred_identification,course_id,branch_id,reserved_start_time,reserved_end_time,notes,created_by)
        VALUES($1,$2,$3,$4,NULLIF($5,''),NULLIF($6,''),NULLIF($7,''),$8,$9,$10::time,$11::time,NULLIF($12,''),$13) RETURNING *`,
      [cycle.id,candidate.enrollment_id,candidate.student_id,instructor.id,String(data.referredName||'').trim().slice(0,160),null,String(data.referredIdentification||'').trim().slice(0,30),candidate.course_id,candidate.branch_id,scheduleMatch[1],scheduleMatch[2],String(data.notes||'').slice(0,240),user.id])).rows[0];
      for(const scheduleDate of selectedSlot.schedule_dates){
        await client.query(`INSERT INTO instructor_availability_overrides
          (instructor_id,schedule_date,start_time,end_time,status,reason,active,created_by,updated_by)
          VALUES($1,$2,$3::time,$4::time,'reserved',$5,TRUE,$6,$6)
          ON CONFLICT(instructor_id,schedule_date,start_time,end_time) DO UPDATE
          SET status='reserved',reason=EXCLUDED.reason,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,
        [instructor.id,scheduleDate,scheduleMatch[1],scheduleMatch[2],`RESERVA_CURSO:${reservation.id}:${cycle.id}`,user.id]);
      }
      await this.audit(client,user,'REFERRAL_COURSE_SEAT_RESERVED','course_cycle_seat_reservations',reservation.id,{cycleId:cycle.id,enrollmentId:candidate.enrollment_id,startDate:cycle.start_date,scheduleTime:data.scheduleTime});
      await client.query('COMMIT'); return {data:reservation};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }

  static async cancelReferralSeat(user, reservationId) {
    const instructor=await this.getInstructorContext(user); const client=await db.getClient();
    try{await client.query('BEGIN');const row=(await client.query(`UPDATE course_cycle_seat_reservations SET status='cancelado',cancelled_by=$3,updated_at=NOW()
      WHERE id=$1 AND instructor_id=$2 AND status='activo' RETURNING *`,[reservationId,instructor.id,user.id])).rows[0];
      if(!row)throw createError(404,'Reserva activa no encontrada');
      await client.query(`UPDATE instructor_availability_overrides
        SET active=FALSE,updated_by=$2,updated_at=NOW()
        WHERE instructor_id=$1 AND active=TRUE AND reason LIKE $3`,
      [instructor.id,user.id,`RESERVA_CURSO:${row.id}:%`]);
      await this.audit(client,user,'REFERRAL_COURSE_SEAT_CANCELLED','course_cycle_seat_reservations',row.id,{cycleId:row.cycle_id,enrollmentId:row.enrollment_id});
      await client.query('COMMIT');return{data:row};}catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }

  static async resetQrTestSession(user, sessionId) {
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const session = (await client.query(`
        SELECT ps.id
        FROM practical_sessions ps
        JOIN enrollments e ON e.id = ps.enrollment_id
        JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
        WHERE ps.id = $1 AND ps.instructor_id = $2 AND ps.deleted_at IS NULL
          AND s.identification = '1792601140'
        FOR UPDATE OF ps
      `, [sessionId, instructor.id])).rows[0];
      if (!session) throw createError(404, 'Clase de prueba no encontrada');
      await client.query('DELETE FROM attendance_qr_challenges WHERE practical_session_id = $1', [sessionId]);
      await client.query('DELETE FROM practical_session_topic_records WHERE practical_session_id = $1', [sessionId]);
      await client.query('DELETE FROM practical_evaluations WHERE practical_session_id = $1', [sessionId]);
      await client.query(`
        UPDATE practical_sessions
        SET status = 'PROGRAMADA', actual_start = NULL, actual_end = NULL,
            attendance_status = NULL, performance_level = NULL,
            observations = 'PRUEBA_QR_11H40_20260824', updated_at = NOW()
        WHERE id = $1
      `, [sessionId]);
      await this.audit(client, user, 'QR_TEST_SESSION_RESET', 'practical_sessions', sessionId, {
        temporaryTestControl: true,
      });
      await client.query('COMMIT');
      return { data: { id: sessionId, status: 'PROGRAMADA' } };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAdditionalPracticeStudents(instructorId, query = {}) {
    const params = [instructorId];
    let filter = '';
    if (query.search) {
      params.push(`%${query.search}%`);
      filter += ` AND CONCAT_WS(' ',s.first_name,s.last_name) ILIKE $${params.length}`;
    }
    if (query.course) {
      params.push(`%${query.course}%`);
      filter += ` AND 'Practicas adicionales' ILIKE $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      filter += ` AND s.status=$${params.length}`;
    }
    const result = await db.query(`
      SELECT ap.id,ap.student_id,CONCAT_WS(' ',s.first_name,s.last_name) name,s.email,
        s.status academic_status,b.name branch,ap.number_of_days,ap.completed_days,
        ap.start_date+ap.completed_days+ap.daily_start_time next_session,
        CASE WHEN ap.completed_days>0 THEN 'completed'
          WHEN (NOW() AT TIME ZONE 'America/Guayaquil')::date BETWEEN ap.start_date
            AND ap.start_date+ap.number_of_days-1
            AND (NOW() AT TIME ZONE 'America/Guayaquil')::time>=ap.daily_start_time
            AND (NOW() AT TIME ZONE 'America/Guayaquil')::time<ap.daily_start_time+INTERVAL '100 minutes'
          THEN 'active' ELSE 'upcoming' END stage
      FROM additional_driving_practices ap
      JOIN students s ON s.id=ap.student_id AND s.status<>'inhabilitado'
      JOIN branches b ON b.id=ap.branch_id
      WHERE ap.instructor_id=$1 AND ap.status IN ('SCHEDULED','IN_PROGRESS') ${filter}
      ORDER BY ap.start_date,ap.daily_start_time,s.last_name
    `, params);
    return result.rows.filter(row => !query.stage || row.stage===query.stage).map(row => ({
      additionalPracticeId: row.id, isAdditionalPractice: true, studentId: row.student_id,
      name: row.name, email: row.email, branch: row.branch, course: 'Practicas adicionales',
      completedSessions: row.completed_days, totalSessions: row.number_of_days,
      progress: Math.round(row.completed_days / row.number_of_days * 100),
      nextSession: row.completed_days<row.number_of_days ? row.next_session : null,
      academicStatus: row.academic_status, stage: row.stage,
    }));
  }

  static async getStudents(user, query = {}) {
    const instructor = await this.getInstructorContext(user);
    const additionalPractices = await this.getAdditionalPracticeStudents(instructor.id, query);
    const limit = Math.min(Number(query.limit) || 50, 100);
    const offset = Math.max(Number(query.offset) || 0, 0);
    const params = [instructor.id];
    let filter = '';
    let stageFilter = '';

    if (query.search) {
      params.push(`%${query.search}%`);
      filter += ` AND (s.first_name ILIKE $${params.length} OR s.last_name ILIKE $${params.length})`;
    }
    if (query.course) {
      params.push(`%${query.course}%`);
      filter += ` AND c.name ILIKE $${params.length}`;
    }
    if (query.status) {
      params.push(query.status);
      filter += ` AND e.status = $${params.length}`;
    }
    if (String(query.latestActiveCycle || '') === '1') {
      const latestParams = [instructor.id];
      let latestFilter = '';
      if (query.search) {
        latestParams.push(`%${query.search}%`);
        latestFilter += ` AND (s.first_name ILIKE $${latestParams.length} OR s.last_name ILIKE $${latestParams.length})`;
      }
      if (query.course) {
        latestParams.push(`%${query.course}%`);
        latestFilter += ` AND c.name ILIKE $${latestParams.length}`;
      }

      const result = await db.query(`
        WITH latest_cycle AS (
          SELECT latest_cycle.id, latest_cycle.start_date, latest_cycle.end_date,
                 latest_cycle.course_id, latest_cycle.branch_id
          FROM course_cycle_schedule_assignments latest
          JOIN course_cycles latest_cycle ON latest_cycle.id = latest.cycle_id
          JOIN enrollments latest_enrollment ON latest_enrollment.id = latest.enrollment_id
          WHERE latest.instructor_id = $1
            AND latest.status = 'activo'
            AND LOWER(latest_enrollment.status) = 'activo'
            AND LOWER(COALESCE(latest_cycle.status, '')) IN ('activo', 'proximo')
          ORDER BY latest_cycle.start_date DESC, latest_cycle.created_at DESC
          LIMIT 1
        ),
        instructor_roster AS (
          SELECT csa.id AS source_id, csa.enrollment_id, csa.instructor_id,
                 csa.schedule_date+csa.start_time AS scheduled_start,
                 csa.schedule_date+csa.end_time AS scheduled_end
          FROM course_cycle_schedule_assignments csa
          JOIN latest_cycle lc ON lc.id = csa.cycle_id
          WHERE csa.instructor_id = $1 AND csa.status = 'activo'
          UNION ALL
          SELECT ps.id AS source_id, ps.enrollment_id, ps.instructor_id,
                 ps.scheduled_start, ps.scheduled_end
          FROM practical_sessions ps
          JOIN latest_cycle lc ON ps.branch_id = lc.branch_id
          JOIN enrollments ps_enrollment ON ps_enrollment.id = ps.enrollment_id
            AND ps_enrollment.course_id = lc.course_id
          WHERE ps.instructor_id = $1
            AND ps.deleted_at IS NULL
            AND ps.status IN ('PROGRAMADA', 'PROXIMA', 'EN_CURSO', 'COMPLETADA', 'AUSENTE')
            AND (ps.scheduled_start::date BETWEEN lc.start_date::date AND lc.end_date::date
              OR (ps.appointment_type='EXAM_ONLY' AND ps.status IN ('PROGRAMADA','PROXIMA','EN_CURSO')))
          UNION ALL
          SELECT eia.id AS source_id, eia.enrollment_id, eia.instructor_id,
                 NULL::timestamp AS scheduled_start, NULL::timestamp AS scheduled_end
          FROM enrollment_instructor_assignments eia
          JOIN enrollments exam_enrollment ON exam_enrollment.id=eia.enrollment_id
          JOIN latest_cycle lc ON exam_enrollment.branch_id=lc.branch_id
            AND exam_enrollment.course_id=lc.course_id
          WHERE eia.instructor_id=$1 AND eia.active=TRUE
            AND eia.observations ILIKE 'Solo examen%'
            AND (eia.start_date BETWEEN lc.start_date::date AND lc.end_date::date
              OR eia.start_date=CURRENT_DATE)
            AND NOT EXISTS(SELECT 1 FROM practical_sessions exam
              WHERE exam.enrollment_id=eia.enrollment_id AND exam.instructor_id=eia.instructor_id
                AND exam.deleted_at IS NULL)
        )
        SELECT e.id AS enrollment_id, e.status AS enrollment_status, s.id AS student_id,
               s.first_name, s.last_name, s.email,
               s.status AS academic_status, b.name AS branch_name, c.name AS course_name,
               u.first_name AS instructor_first_name, u.last_name AS instructor_last_name,
               COUNT(DISTINCT roster.source_id)::int AS total_sessions,
               COUNT(DISTINCT ps.id) FILTER (WHERE ps.status IN ('COMPLETADA', 'AUSENTE'))::int AS completed_sessions,
               MIN(roster.scheduled_start)
                 FILTER (WHERE roster.scheduled_start>=CURRENT_TIMESTAMP) AS next_session,
               ARRAY_AGG(DISTINCT TO_CHAR(roster.scheduled_start, 'YYYY-MM'))
                 FILTER (WHERE roster.scheduled_start IS NOT NULL) AS session_months,
               CASE
                 WHEN BOOL_OR(CURRENT_TIMESTAMP BETWEEN roster.scheduled_start AND roster.scheduled_end) THEN 'active'
                 WHEN COUNT(ps.id) FILTER (WHERE ps.status IN ('COMPLETADA','AUSENTE')) > 0 THEN 'completed'
                 ELSE 'upcoming'
               END AS stage
        FROM instructor_roster roster
        JOIN enrollments e ON e.id = roster.enrollment_id
        JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
        JOIN branches b ON b.id = e.branch_id
        JOIN courses c ON c.id = e.course_id
        JOIN instructor_profiles ip ON ip.id = roster.instructor_id
        JOIN users u ON u.id = ip.user_id
        LEFT JOIN practical_sessions ps ON ps.enrollment_id = e.id
          AND ps.instructor_id = roster.instructor_id
          AND ps.deleted_at IS NULL
        WHERE LOWER(e.status) = 'activo'
          ${latestFilter}
        GROUP BY e.id, s.id, b.name, c.name, u.first_name, u.last_name
        ORDER BY s.last_name, s.first_name
        LIMIT $${latestParams.length + 1} OFFSET $${latestParams.length + 2}
      `, [...latestParams, limit, offset]);

      return {
        additionalPractices,
        data: result.rows.map(row => ({
          enrollmentId: row.enrollment_id,
          studentId: row.student_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          course: row.course_name,
          branch: row.branch_name,
          instructor: `${row.instructor_first_name} ${row.instructor_last_name}`,
          completedSessions: row.completed_sessions,
          totalSessions: row.total_sessions,
          progress: row.total_sessions ? Math.round((row.completed_sessions / row.total_sessions) * 100) : 0,
          nextSession: row.next_session,
          sessionMonths: row.session_months || [],
          enrollmentStatus: row.enrollment_status,
          academicStatus: row.academic_status,
          stage: row.stage,
        })),
        pagination: { limit, offset },
      };
    }
    if (query.stage === 'upcoming') {
      stageFilter = ` HAVING COUNT(ps.id) FILTER (WHERE ps.status IN ('COMPLETADA','AUSENTE')) = 0
        AND NOT COALESCE(BOOL_OR(ps.status='EN_CURSO' OR
          (ps.status IN ('PROGRAMADA','PROXIMA') AND CURRENT_TIMESTAMP BETWEEN ps.scheduled_start AND ps.scheduled_end)
          OR (csa.id IS NOT NULL AND CURRENT_TIMESTAMP BETWEEN csa.schedule_date+csa.start_time AND csa.schedule_date+csa.end_time)), false)`;
    } else if (query.stage === 'active') {
      stageFilter = ` HAVING BOOL_OR(ps.status='EN_CURSO' OR
        (ps.status IN ('PROGRAMADA','PROXIMA') AND CURRENT_TIMESTAMP BETWEEN ps.scheduled_start AND ps.scheduled_end)
        OR (csa.id IS NOT NULL AND CURRENT_TIMESTAMP BETWEEN csa.schedule_date+csa.start_time AND csa.schedule_date+csa.end_time))`;
    } else if (query.stage === 'completed') {
      stageFilter = ` HAVING COUNT(ps.id) FILTER (WHERE ps.status IN ('COMPLETADA','AUSENTE')) > 0
        AND NOT COALESCE(BOOL_OR(ps.status='EN_CURSO' OR
          (ps.status IN ('PROGRAMADA','PROXIMA') AND CURRENT_TIMESTAMP BETWEEN ps.scheduled_start AND ps.scheduled_end)), false)`;
    }

    const result = await db.query(`
      SELECT e.id AS enrollment_id, e.status AS enrollment_status, s.id AS student_id,
             s.first_name, s.last_name, s.email,
             s.status AS academic_status, b.name AS branch_name, c.name AS course_name,
             u.first_name AS instructor_first_name, u.last_name AS instructor_last_name,
             GREATEST(COUNT(DISTINCT ps.id),COUNT(DISTINCT csa.id))::int AS total_sessions,
             COUNT(DISTINCT ps.id) FILTER (WHERE ps.status IN ('COMPLETADA', 'AUSENTE'))::int AS completed_sessions,
             COALESCE(
               MIN(ps.scheduled_start) FILTER (WHERE ps.status IN ('PROGRAMADA', 'PROXIMA') AND ps.scheduled_start>=CURRENT_TIMESTAMP),
               MIN(csa.schedule_date+csa.start_time) FILTER (WHERE csa.schedule_date+csa.start_time>=CURRENT_TIMESTAMP)
             ) AS next_session,
             ARRAY_AGG(DISTINCT TO_CHAR(ps.scheduled_start, 'YYYY-MM'))
               FILTER (WHERE ps.scheduled_start IS NOT NULL) AS session_months,
             CASE
               WHEN BOOL_OR(ps.status='EN_CURSO'
                 OR (ps.status IN ('PROGRAMADA','PROXIMA') AND CURRENT_TIMESTAMP BETWEEN ps.scheduled_start AND ps.scheduled_end)
                 OR (csa.id IS NOT NULL AND CURRENT_TIMESTAMP BETWEEN csa.schedule_date+csa.start_time AND csa.schedule_date+csa.end_time)) THEN 'active'
               WHEN COUNT(ps.id) FILTER (WHERE ps.status IN ('COMPLETADA','AUSENTE')) > 0 THEN 'completed'
               ELSE 'upcoming'
             END AS stage
      FROM enrollment_instructor_assignments eia
      JOIN enrollments e ON e.id = eia.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN branches b ON b.id = e.branch_id
      JOIN courses c ON c.id = e.course_id
      JOIN instructor_profiles ip ON ip.id = eia.instructor_id
      JOIN users u ON u.id = ip.user_id
      LEFT JOIN practical_sessions ps ON ps.enrollment_id = e.id AND ps.deleted_at IS NULL
      LEFT JOIN course_cycle_schedule_assignments csa ON csa.enrollment_id=e.id
        AND csa.instructor_id=eia.instructor_id AND csa.status='activo'
      WHERE eia.instructor_id = $1 AND eia.active = true ${filter}
      GROUP BY e.id, s.id, b.name, c.name, u.first_name, u.last_name
      ${stageFilter}
      ORDER BY s.last_name, s.first_name
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    return {
      additionalPractices,
      data: result.rows.map(row => ({
        enrollmentId: row.enrollment_id,
        studentId: row.student_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        course: row.course_name,
        branch: row.branch_name,
        instructor: `${row.instructor_first_name} ${row.instructor_last_name}`,
        completedSessions: row.completed_sessions,
        totalSessions: row.total_sessions,
        progress: row.total_sessions ? Math.round((row.completed_sessions / row.total_sessions) * 100) : 0,
        nextSession: row.next_session,
        sessionMonths: row.session_months || [],
        enrollmentStatus: row.enrollment_status,
        academicStatus: row.academic_status,
        stage: row.stage,
      })),
      pagination: { limit, offset },
    };
  }

  static async getStudentDetail(user, enrollmentId) {
    const instructor = await this.getInstructorContext(user);
    const assignment = await db.query(`
      SELECT e.id AS enrollment_id, e.status AS enrollment_status, s.id AS student_id,
             s.first_name, s.last_name, s.email,
             c.name AS course_name, b.name AS branch_name
      FROM enrollment_instructor_assignments eia
      JOIN enrollments e ON e.id = eia.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      JOIN branches b ON b.id = e.branch_id
      WHERE eia.enrollment_id = $1 AND eia.instructor_id = $2 AND eia.active = true
    `, [enrollmentId, instructor.id]);

    if (assignment.rows.length === 0) throw createError(404, 'Estudiante no asignado al instructor');

    const [sessions, evaluations, incidents, history] = await Promise.all([
      db.query(`SELECT ps.*,
        COALESCE((SELECT json_agg(json_build_object('code', st.code, 'name', st.name) ORDER BY st.name)
          FROM practical_session_topic_records pstr
          JOIN session_topics st ON st.id = pstr.topic_id
          WHERE pstr.practical_session_id = ps.id), '[]'::json) AS topics
        FROM practical_sessions ps
        WHERE ps.enrollment_id = $1 AND ps.instructor_id = $2 AND ps.deleted_at IS NULL
        ORDER BY ps.scheduled_start DESC`, [enrollmentId, instructor.id]),
      db.query('SELECT * FROM practical_evaluations WHERE enrollment_id = $1 AND instructor_id = $2 ORDER BY evaluated_at DESC', [enrollmentId, instructor.id]),
      db.query('SELECT * FROM incidents WHERE enrollment_id = $1 AND instructor_id = $2 ORDER BY reported_at DESC', [enrollmentId, instructor.id]),
      db.query('SELECT * FROM history WHERE student_id = $1 ORDER BY timestamp DESC LIMIT 20', [assignment.rows[0].student_id]),
    ]);

    return {
      data: {
        ...assignment.rows[0],
        sessions: sessions.rows,
        evaluations: evaluations.rows,
        incidents: incidents.rows,
        history: history.rows,
      },
    };
  }

  static async getSession(user, sessionId) {
    const instructor = await this.getInstructorContext(user);
    const result = await db.query(`
      SELECT ps.*, s.id AS student_id, s.first_name AS student_first_name,
             s.last_name AS student_last_name, co.name AS course_name, b.name AS branch_name,
             v.code AS vehicle_code, v.plate,
             tr.id AS route_id, tr.code AS route_code, tr.name AS route_name, tr.level AS route_level,
             tr.recommended_session_number AS route_session_number, tr.origin_label, tr.origin_lat,
             tr.origin_lng, tr.destination_label, tr.destination_lat, tr.destination_lng,
             tr.waypoints, tr.focus_topics, tr.estimated_minutes,
             COALESCE((SELECT json_agg(json_build_object('code',st.code,'name',st.name) ORDER BY st.name)
               FROM practical_session_topic_records pstr JOIN session_topics st ON st.id=pstr.topic_id
               WHERE pstr.practical_session_id=ps.id),'[]'::json) AS topics
      FROM practical_sessions ps
      JOIN enrollments e ON e.id = ps.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses co ON co.id = e.course_id
      JOIN branches b ON b.id = ps.branch_id
      LEFT JOIN vehicles v ON v.id = ps.vehicle_id
      LEFT JOIN training_routes tr ON tr.id = ps.recommended_route_id
        AND tr.city_id = b.city_id AND tr.deleted_at IS NULL
      WHERE ps.id = $1 AND ps.instructor_id = $2 AND ps.deleted_at IS NULL
    `, [sessionId, instructor.id]);

    if (result.rows.length === 0) throw createError(404, 'Clase no encontrada');
    return { data: mapSession(result.rows[0]) };
  }

  static async startSession(user, sessionId) {
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(`
        SELECT * FROM practical_sessions
        WHERE id = $1 AND instructor_id = $2 AND deleted_at IS NULL
        FOR UPDATE
      `, [sessionId, instructor.id]);

      if (sessionResult.rows.length === 0) throw createError(404, 'Clase no encontrada');
      const session = sessionResult.rows[0];
      if (!STARTABLE_STATUSES.includes(session.status)) throw createError(409, 'La clase no se puede iniciar en su estado actual');
      if (new Date(session.scheduled_start).getTime() - ATTENDANCE_EARLY_MINUTES * 60 * 1000 > Date.now()) {
        throw createError(409, 'La clase todavía no ha llegado a su hora de inicio');
      }
      if (new Date(session.scheduled_end).getTime() < Date.now()) {
        throw createError(409, 'La hora de esta clase ya terminó; registra la asistencia o reprograma la clase');
      }

      await require('./PracticalSessionAutoCloseService').closePreviousForStart(client, session, user);
      const active = await client.query(`
        SELECT id FROM practical_sessions
        WHERE instructor_id = $1 AND status = $2 AND id <> $3 AND deleted_at IS NULL
        LIMIT 1
      `, [instructor.id, ACTIVE_SESSION_STATUS, sessionId]);
      if (active.rows.length) throw createError(409, 'Ya existe una clase activa para este instructor');

      if (session.vehicle_id) {
        const vehicleActive = await client.query(`
          SELECT id FROM practical_sessions
          WHERE vehicle_id = $1 AND status = $2 AND id <> $3 AND deleted_at IS NULL
          LIMIT 1
        `, [session.vehicle_id, ACTIVE_SESSION_STATUS, sessionId]);
        if (vehicleActive.rows.length) throw createError(409, 'El vehiculo asignado ya esta en uso');
      }

      const updated = await client.query(`
        UPDATE practical_sessions
        SET status = 'EN_CURSO', actual_start = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `, [sessionId]);

      await this.audit(client, user, 'SESSION_START', 'practical_sessions', sessionId, { enrollmentId: session.enrollment_id });
      await client.query('COMMIT');
      return { data: updated.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async registerStartMileage(user, sessionId, value) {
    const rawValue = String(value ?? '').trim();
    if (!/^\d{3,7}$/.test(rawValue)) {
      throw createError(422, 'Ingresa el kilometraje inicial con 3 a 7 digitos, usando solo numeros');
    }
    const startMileage = Number(rawValue);
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(`
        SELECT ps.*, ${mileageEnabledSql} AS mileage_enabled
        FROM practical_sessions ps
        WHERE ps.id=$1 AND ps.instructor_id=$2 AND ps.deleted_at IS NULL
        FOR UPDATE
      `, [sessionId, instructor.id]);
      if (!sessionResult.rows.length) throw createError(404, 'Clase no encontrada');
      const session = sessionResult.rows[0];
      if (!session.mileage_enabled) throw createError(409, 'El kilometraje solo corresponde a clases de carro');
      if (session.status !== ACTIVE_SESSION_STATUS) {
        throw createError(409, 'El estudiante debe confirmar su entrada antes de registrar el kilometraje');
      }
      const confirmedEntry = await client.query(`
        SELECT 1 FROM attendance_qr_challenges
        WHERE practical_session_id=$1 AND attendance_phase='ENTRY' AND used_at IS NOT NULL
        LIMIT 1
      `, [sessionId]);
      if (!confirmedEntry.rows.length) {
        throw createError(409, 'El estudiante debe confirmar su entrada antes de registrar el kilometraje');
      }
      if (session.start_mileage !== null && Number(session.start_mileage) !== startMileage) {
        throw createError(409, 'El kilometraje inicial ya fue registrado y no puede modificarse');
      }
      if (session.start_mileage === null) {
        await client.query(`UPDATE practical_sessions SET start_mileage=$2,updated_at=NOW() WHERE id=$1`, [sessionId,startMileage]);
        await this.audit(client,user,'SESSION_START_MILEAGE','practical_sessions',sessionId,{
          enrollmentId:session.enrollment_id,startMileage,
        });
      }
      await client.query('COMMIT');
      return { data:{ sessionId,startMileage } };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async completeSession(user, sessionId, data) {
    const allowedPerformanceLevels = [
      'REQUIERE_ACOMPANAMIENTO', 'EN_DESARROLLO', 'CUMPLIO_OBJETIVO', 'DOMINO_PRACTICADO',
    ];
    const topicCodes = [...new Set(Array.isArray(data.topicCodes) ? data.topicCodes : [])];
    const rawEndMileage = String(data.endMileage ?? '').trim();

    if (topicCodes.length === 0) throw createError(400, 'Selecciona al menos un tema trabajado');
    if (!allowedPerformanceLevels.includes(data.performanceLevel)) {
      throw createError(400, 'Selecciona un nivel de desempeño válido');
    }
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      const sessionResult = await client.query(`
        SELECT ps.*, ${mileageRequiredSql} AS requires_mileage,
          ${mileageEnabledSql} AS mileage_enabled FROM practical_sessions ps
        WHERE ps.id = $1 AND ps.instructor_id = $2 AND ps.deleted_at IS NULL
        FOR UPDATE OF ps
      `, [sessionId, instructor.id]);

      if (sessionResult.rows.length === 0) throw createError(404, 'Clase no encontrada');
      const session = sessionResult.rows[0];
      if (COMPLETED_STATUSES.includes(session.status)) throw createError(409, 'La clase ya fue finalizada');
      if (session.status !== ACTIVE_SESSION_STATUS) throw createError(409, 'La clase debe estar en curso para finalizarse');
      if ((session.requires_mileage || (session.mileage_enabled && rawEndMileage !== '')) && !/^\d{3,7}$/.test(rawEndMileage)) {
        throw createError(422, 'Ingresa el kilometraje final con 3 a 7 digitos, usando solo numeros');
      }
      const endMileage = session.mileage_enabled && rawEndMileage !== '' ? Number(rawEndMileage) : null;
      if (session.requires_mileage && session.start_mileage === null) {
        throw createError(409, 'Registra el kilometraje inicial antes de finalizar la clase');
      }
      if (endMileage !== null && session.start_mileage !== null && endMileage < Number(session.start_mileage)) {
        throw createError(422, 'El kilometraje final no puede ser menor que el kilometraje inicial');
      }
      if (!String(session.observations || '').includes(UNLIMITED_ATTENDANCE_MARKER)
        && new Date(session.scheduled_end).getTime() + ATTENDANCE_CLOSE_GRACE_MINUTES * 60 * 1000 < Date.now()) {
        throw createError(409, 'El plazo de 30 minutos para registrar la salida ya terminó');
      }

      const entryAttendance = await client.query(`
        SELECT id FROM attendance_qr_challenges
        WHERE practical_session_id=$1 AND attendance_phase='ENTRY' AND used_at IS NOT NULL
        ORDER BY used_at DESC LIMIT 1
      `, [sessionId]);
      const hasValidEntry = Boolean(session.actual_start || session.attendance_status === 'Asistio' || entryAttendance.rows.length > 0);
      if (!hasValidEntry) {
        throw createError(409, 'La clase debe registrar su entrada antes de finalizarse');
      }

      const attendance = 'Asistio';
      const finalStatus = 'COMPLETADA';

      const topics = await client.query(`
        SELECT id, code FROM session_topics
        WHERE code = ANY($1::varchar[]) AND active = TRUE
      `, [topicCodes]);
      if (topics.rows.length !== topicCodes.length) throw createError(400, 'Uno o más temas seleccionados no son válidos');

      const updated = await client.query(`
        UPDATE practical_sessions
        SET status = $1, actual_end = COALESCE(actual_end,NOW()), attendance_status = $2, performance_level = $3,
            observations = $4, end_mileage = $5, updated_at = NOW()
        WHERE id = $6
        RETURNING *
      `, [finalStatus, attendance || null, data.performanceLevel || null, data.observations || null, endMileage, sessionId]);

      for (const topic of topics.rows) {
        await client.query(`
          INSERT INTO practical_session_topic_records (practical_session_id, topic_id, observations, completed)
          VALUES ($1, $2, $3, true)
          ON CONFLICT (practical_session_id, topic_id)
          DO UPDATE SET observations = EXCLUDED.observations, completed = true
        `, [sessionId, topic.id, null]);
      }

      await client.query(
        'INSERT INTO history (student_id, action) SELECT student_id, $1 FROM enrollments WHERE id = $2',
        [`Clase practica ${finalStatus.toLowerCase()}`, session.enrollment_id]
      );
      await this.audit(client, user, 'SESSION_COMPLETE', 'practical_sessions', sessionId, {
        status: finalStatus, attendance, performanceLevel: data.performanceLevel, topicCodes,
        startMileage: session.start_mileage === null ? null : Number(session.start_mileage), endMileage,
        distanceKilometers: endMileage !== null && session.start_mileage !== null ? endMileage - Number(session.start_mileage) : null,
      });
      await client.query('COMMIT');
      return { data: updated.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getEvaluations(user) {
    const instructor = await this.getInstructorContext(user);
    const result = await db.query(`
      SELECT pe.*, s.first_name, s.last_name, c.name AS course_name,
             COALESCE((
               SELECT JSON_AGG(JSON_BUILD_OBJECT(
                 'criterionId', ec.id,
                 'code', ec.code,
                 'name', ec.name,
                 'score', pes.score,
                 'maximumScore', ec.maximum_score,
                 'percentage', CASE WHEN ec.maximum_score > 0
                   THEN ROUND((pes.score / ec.maximum_score) * 100, 2)
                   ELSE 0 END
               ) ORDER BY ec.display_order, ec.name)
               FROM practical_evaluation_scores pes
               JOIN evaluation_criteria ec ON ec.id = pes.criterion_id
               WHERE pes.evaluation_id = pe.id
             ), '[]'::json) AS scores
      FROM practical_evaluations pe
      JOIN enrollments e ON e.id = pe.enrollment_id
      JOIN students s ON s.status <> 'inhabilitado' AND s.id = e.student_id
      JOIN courses c ON c.id = e.course_id
      WHERE pe.instructor_id = $1
      ORDER BY pe.evaluated_at DESC
    `, [instructor.id]);

    const criteria = await db.query(`
      SELECT * FROM evaluation_criteria WHERE active = true ORDER BY display_order, name
    `);

    return { data: result.rows, criteria: criteria.rows };
  }

  static async createEvaluation(user, data) {
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();
    const requestedEvaluationType = String(data.evaluationType || 'PRACTICA').toUpperCase();
    const requestedExoneration = requestedEvaluationType === 'EXONERACION';

    try {
      await client.query('BEGIN');
      const examSession = data.practicalSessionId ? await client.query(`
        SELECT id, appointment_type, scheduled_start, actual_start, actual_end, start_mileage,
          scheduled_start::date = CURRENT_DATE AS is_today,
          scheduled_start::date > CURRENT_DATE AS is_future
        FROM practical_sessions
        WHERE id=$1 AND enrollment_id=$2 AND instructor_id=$3 AND deleted_at IS NULL
      `, [data.practicalSessionId, data.enrollmentId, instructor.id]) : { rows: [] };
      if (data.practicalSessionId && examSession.rows.length === 0) {
        throw createError(404, 'El examen no está asignado a este instructor');
      }
      if (examSession.rows[0]?.appointment_type === 'EXAM_ONLY' && !examSession.rows[0].is_today) {
        throw createError(409, 'El examen solo puede evaluarse el día programado');
      }
      if (examSession.rows[0]?.appointment_type === 'EXAM_ONLY') {
        const exam = examSession.rows[0];
        if (!exam.actual_start || !exam.actual_end) throw createError(409, 'Registra la entrada y salida antes de evaluar el examen');
        if (!/^\d{3,7}$/.test(String(data.endMileage || '')) || Number(data.endMileage) < Number(exam.start_mileage)) throw createError(422, 'Registra un kilometraje final de 3 a 7 digitos, igual o mayor al inicial');
        await client.query("UPDATE practical_sessions SET status='COMPLETADA',end_mileage=$2,updated_at=NOW() WHERE id=$1", [exam.id, Number(data.endMileage)]);
      }
      if (requestedExoneration && (!data.practicalSessionId || examSession.rows[0]?.is_future)) {
        throw createError(409, 'La exoneración debe registrarse desde una clase de hoy o anterior');
      }
      if (!data.practicalSessionId) {
        const scheduledExam = await client.query(`
          SELECT scheduled_start::date = CURRENT_DATE AS is_today
          FROM practical_sessions
          WHERE enrollment_id=$1 AND instructor_id=$2 AND appointment_type='EXAM_ONLY'
            AND deleted_at IS NULL AND status NOT IN ('CANCELADA','REPROGRAMADA')
          ORDER BY scheduled_start DESC LIMIT 1
        `, [data.enrollmentId, instructor.id]);
        if (scheduledExam.rows.length && !scheduledExam.rows[0].is_today) {
          throw createError(409, 'El examen solo puede evaluarse el día programado');
        }
        if (scheduledExam.rows.length) throw createError(409, 'Abre la evaluacion desde el examen despues de registrar la salida');
      }
      const assignment = await client.query(`
        SELECT e.id, e.branch_id
        FROM enrollment_instructor_assignments eia
        JOIN enrollments e ON e.id = eia.enrollment_id
        WHERE e.id = $1 AND e.status = 'activo'
          AND eia.instructor_id = $2 AND eia.active = true
      `, [data.enrollmentId, instructor.id]);
      if (assignment.rows.length === 0 && (requestedExoneration || examSession.rows.length === 0)) {
        throw createError(404, 'Matricula activa no asignada al instructor');
      }

      const criteriaIds = (data.scores || []).map(item => item.criterionId);
      const criteria = await client.query(
        'SELECT id, maximum_score FROM evaluation_criteria WHERE active = true ORDER BY display_order, name'
      );
      const uniqueCriteriaIds = new Set(criteriaIds);
      if (
        criteriaIds.length !== uniqueCriteriaIds.size
        || criteriaIds.length !== criteria.rows.length
        || criteria.rows.some(item => !uniqueCriteriaIds.has(item.id))
      ) {
        throw createError(422, 'Debes calificar todas las categorías activas una sola vez');
      }
      const maxById = new Map(criteria.rows.map(item => [item.id, Number(item.maximum_score)]));

      let total = 0;
      let maximum = 0;
      for (const score of data.scores || []) {
        const max = maxById.get(score.criterionId);
        if (max === undefined) throw createError(422, 'Criterio de evaluacion invalido');
        const value = Number(score.score);
        if (Number.isNaN(value) || value < 0 || value > max) throw createError(422, 'El puntaje no puede superar el maximo del criterio');
        const percentage = max > 0 ? (value / max) * 100 : -1;
        if (![0, 25, 50, 75, 100].some(option => Math.abs(option - percentage) < 0.001)) {
          throw createError(422, 'La calificación debe ser 0%, 25%, 50%, 75% o 100%');
        }
        total += value;
        maximum += max;
      }

      const attemptResult = await client.query(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next_attempt
        FROM practical_evaluations
        WHERE enrollment_id = $1 AND evaluation_type = $2
      `, [data.enrollmentId, data.evaluationType || 'PRACTICA']);
      const attempt = attemptResult.rows[0].next_attempt;
      const percentage = maximum > 0 ? Number(((total / maximum) * 100).toFixed(2)) : 0;
      const result = data.result || (percentage >= 70 ? 'APROBADO' : 'RECUPERACION');
      const isExoneration = requestedExoneration;
      if (isExoneration && result !== 'APROBADO') {
        throw createError(422, 'La exoneración requiere una evaluación aprobada con al menos 70%');
      }

      const evaluation = await client.query(`
        INSERT INTO practical_evaluations (
          enrollment_id, instructor_id, practical_session_id, evaluation_type, attempt_number,
          total_score, maximum_score, percentage, result, status, general_observations, evaluated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'REGISTRADA', $10, NOW())
        RETURNING *
      `, [
        data.enrollmentId,
        instructor.id,
        data.practicalSessionId || null,
        data.evaluationType || 'PRACTICA',
        attempt,
        total,
        maximum,
        percentage,
        result,
        data.generalObservations || null,
      ]);

      for (const score of data.scores || []) {
        await client.query(`
          INSERT INTO practical_evaluation_scores (evaluation_id, criterion_id, score, observations)
          VALUES ($1, $2, $3, $4)
        `, [evaluation.rows[0].id, score.criterionId, score.score, score.observations || null]);
      }

      if (isExoneration) {
        await client.query(`
          UPDATE practical_sessions
          SET status='CANCELADA', deleted_at=NOW(), updated_at=NOW(),
            observations=CONCAT_WS(' | ', NULLIF(observations,''), 'Cancelada por exoneración')
          WHERE enrollment_id=$1 AND deleted_at IS NULL
            AND scheduled_start::date > CURRENT_DATE
        `, [data.enrollmentId]);
        await client.query(`
          UPDATE course_cycle_schedule_assignments
          SET status='cancelado', updated_at=NOW()
          WHERE enrollment_id=$1 AND status='activo' AND schedule_date > CURRENT_DATE
        `, [data.enrollmentId]);
        await client.query(`
          UPDATE enrollments SET status='completado', updated_at=NOW() WHERE id=$1
        `, [data.enrollmentId]);
        await client.query(`
          UPDATE enrollment_instructor_assignments
          SET active=FALSE, end_date=CURRENT_DATE,
            observations=CONCAT_WS(' | ', NULLIF(observations,''), 'Estudiante exonerado')
          WHERE enrollment_id=$1 AND instructor_id=$2 AND active=TRUE
        `, [data.enrollmentId, instructor.id]);
        await client.query(`
          INSERT INTO history(student_id,action)
          SELECT student_id,$2 FROM enrollments WHERE id=$1
        `, [data.enrollmentId, `Exoneración registrada por el instructor con resultado ${result} (${percentage}%)`]);
      }

      await this.audit(client, user, isExoneration ? 'STUDENT_EXEMPTED' : 'EVALUATION_CREATE', 'practical_evaluations', evaluation.rows[0].id, { result, percentage, enrollmentId: data.enrollmentId });
      await client.query('COMMIT');
      return { data: evaluation.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getIncidents(user) {
    const instructor = await this.getInstructorContext(user);
    const result = await db.query(`
      SELECT i.*, s.first_name, s.last_name, ps.session_number
      FROM incidents i
      LEFT JOIN enrollments e ON e.id = i.enrollment_id
      LEFT JOIN students s ON s.id = e.student_id
      LEFT JOIN practical_sessions ps ON ps.id = i.practical_session_id
      WHERE i.instructor_id = $1
      ORDER BY i.reported_at DESC
    `, [instructor.id]);
    return { data: result.rows };
  }

  static async createIncident(user, data) {
    const instructor = await this.getInstructorContext(user);
    const client = await db.getClient();

    try {
      await client.query('BEGIN');
      let incidentBranchId = instructor.branch_id;
      if (data.enrollmentId) {
        const assignment = await client.query(`
          SELECT e.branch_id FROM enrollment_instructor_assignments eia
          JOIN enrollments e ON e.id = eia.enrollment_id
          WHERE eia.enrollment_id = $1 AND eia.instructor_id = $2 AND eia.active = true
        `, [data.enrollmentId, instructor.id]);
        if (assignment.rows.length === 0) throw createError(404, 'Matricula no asignada al instructor');
        incidentBranchId = assignment.rows[0].branch_id;
      } else if (data.practicalSessionId) {
        const assignedSession = await client.query(`SELECT branch_id FROM practical_sessions
          WHERE id=$1 AND instructor_id=$2 AND deleted_at IS NULL`, [data.practicalSessionId,instructor.id]);
        if (!assignedSession.rows.length) throw createError(404, 'Clase no asignada al instructor');
        incidentBranchId = assignedSession.rows[0].branch_id;
      }

      const result = await client.query(`
        INSERT INTO incidents (
          branch_id, reported_by, instructor_id, enrollment_id, practical_session_id, vehicle_id,
          incident_type, priority, status, description, evidence_path, reported_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ABIERTA', $9, $10, NOW())
        RETURNING *
      `, [
        incidentBranchId,
        user.id,
        instructor.id,
        data.enrollmentId || null,
        data.practicalSessionId || null,
        data.vehicleId || null,
        data.incidentType,
        data.priority || 'MEDIA',
        data.description,
        data.evidencePath || null,
      ]);

      await this.audit(client, user, 'INCIDENT_CREATE', 'incidents', result.rows[0].id, { priority: data.priority });
      await client.query('COMMIT');
      return { data: result.rows[0] };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getProfile(user) {
    const instructor = await this.getInstructorContext(user);
    const courses = await db.query(`
      SELECT c.id, c.name
      FROM instructor_course_capabilities icc
      JOIN courses c ON c.id = icc.course_id
      WHERE icc.instructor_id = $1 AND icc.active = true
      ORDER BY c.name
    `, [instructor.id]);

    return {
      data: {
        name: `${instructor.first_name} ${instructor.last_name}`,
        email: instructor.email,
        branch: instructor.branch_name,
        instructorType: instructor.instructor_type,
        status: instructor.status,
        specialty: instructor.specialty,
        licenseNumber: instructor.license_number,
        courses: courses.rows,
      },
    };
  }
}

module.exports = InstructorService;
