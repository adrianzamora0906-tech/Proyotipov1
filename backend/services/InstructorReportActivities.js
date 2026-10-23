// One activity per assigned class or exam; exams without classes resolve to
// the instructor's matching cycle for presentation only, never as enrollment.
module.exports = `activity_events AS (
  SELECT a.student_id,a.enrollment_id,a.cycle_id,a.schedule_date activity_date,
    a.start_time,a.end_time,'CLASS'::text activity_type,
    ps.status,ps.actual_start,ps.actual_end
  FROM course_cycle_schedule_assignments a
  LEFT JOIN LATERAL (
    SELECT p.status,p.actual_start,p.actual_end FROM practical_sessions p
    WHERE p.enrollment_id=a.enrollment_id AND p.instructor_id=a.instructor_id
      AND p.scheduled_start=a.schedule_date+a.start_time
      AND p.appointment_type<>'EXAM_ONLY' AND p.deleted_at IS NULL
      AND p.status NOT IN ('CANCELADA','REPROGRAMADA')
    ORDER BY p.created_at DESC,p.id LIMIT 1
  ) ps ON TRUE
  WHERE a.instructor_id=$6 AND a.status='activo'
    AND a.schedule_date BETWEEN $2::date AND $3::date
  UNION ALL
  SELECT e.student_id,e.id,cycle.id,p.scheduled_start::date,
    p.scheduled_start::time,p.scheduled_end::time,'EXAM_ONLY',
    p.status,p.actual_start,p.actual_end
  FROM practical_sessions p JOIN enrollments e ON e.id=p.enrollment_id
  LEFT JOIN LATERAL (
    SELECT cc.id FROM course_cycles cc
    WHERE cc.course_id=e.course_id AND cc.branch_id=p.branch_id
      AND p.scheduled_start::date BETWEEN cc.start_date AND cc.end_date
      AND cc.deleted_at IS NULL AND cc.status<>'cancelado'
      AND (EXISTS(SELECT 1 FROM course_cycle_instructors ci WHERE ci.cycle_id=cc.id AND ci.instructor_id=p.instructor_id AND ci.active=TRUE)
        OR EXISTS(SELECT 1 FROM course_cycle_schedule_assignments a WHERE a.cycle_id=cc.id AND a.instructor_id=p.instructor_id AND a.status='activo')
        OR EXISTS(SELECT 1 FROM instructor_group_members gm WHERE gm.group_id=cc.group_id AND gm.instructor_id=p.instructor_id AND gm.active=TRUE AND gm.ended_at IS NULL))
    ORDER BY EXISTS(SELECT 1 FROM course_cycle_schedule_assignments a WHERE a.cycle_id=cc.id AND a.enrollment_id=e.id AND a.instructor_id=p.instructor_id AND a.status='activo') DESC,
      (cc.start_date=e.practical_start_date) DESC NULLS LAST,
      (cc.modality='normal') DESC,cc.start_date DESC,cc.id LIMIT 1
  ) cycle ON TRUE
  WHERE p.instructor_id=$6 AND p.appointment_type='EXAM_ONLY'
    AND p.deleted_at IS NULL AND p.status NOT IN ('CANCELADA','REPROGRAMADA')
    AND p.scheduled_start::date BETWEEN $2::date AND $3::date
), activities AS (
  SELECT s.id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,
    c.id course_id,c.name course_name,cc.id cycle_id,cc.code cycle_code,
    COALESCE(cc.start_date,MIN(a.activity_date)) start_date,
    COALESCE(cc.end_date,MAX(a.activity_date)) end_date,a.activity_type,
    MIN(a.start_time) start_time,MAX(a.end_time) end_time,
    TO_CHAR(MIN(a.start_time),'HH24:MI') || ' - ' || TO_CHAR(MAX(a.end_time),'HH24:MI') schedule_time,
    COUNT(*) FILTER(WHERE a.activity_type='CLASS')::int classes,
    COUNT(*) FILTER(WHERE a.activity_type='EXAM_ONLY')::int exams,
    COUNT(*) FILTER(WHERE a.status='COMPLETADA')::int attended,
    STRING_AGG(DISTINCT TO_CHAR(a.activity_date,'DD/MM/YYYY'),', ') class_dates,
    COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(a.actual_end,a.activity_date+a.end_time)-COALESCE(a.actual_start,a.activity_date+a.start_time)))/3600)
      FILTER(WHERE a.status='COMPLETADA')::numeric,2),0)::numeric hours,
    ROUND(SUM(EXTRACT(EPOCH FROM (a.end_time-a.start_time))/3600)::numeric,2) scheduled_hours
  FROM activity_events a JOIN enrollments e ON e.id=a.enrollment_id
  JOIN students s ON s.id=a.student_id AND s.status<>'inhabilitado'
  JOIN courses c ON c.id=e.course_id LEFT JOIN course_cycles cc ON cc.id=a.cycle_id
  JOIN branches b ON b.id=COALESCE(cc.branch_id,e.branch_id)
  WHERE ($1::uuid IS NULL OR b.id=$1) AND ($4::text IS NULL OR b.province=$4) AND ($5::text IS NULL OR b.city=$5)
  GROUP BY s.id,c.id,cc.id,a.activity_type
  UNION ALL
  SELECT s.id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)),s.email,s.phone,
    NULL::uuid,'Horas practicas'::text,ap.id,NULL::text,
    ap.start_date,ap.start_date+ap.number_of_days-1,'ADDITIONAL_PRACTICE'::text,
    ap.daily_start_time,(ap.daily_start_time+INTERVAL '100 minutes')::time,
    TO_CHAR(ap.daily_start_time,'HH24:MI') || ' - ' || TO_CHAR(ap.daily_start_time+INTERVAL '100 minutes','HH24:MI'),
    COUNT(*)::int,0::int,
    COUNT(*) FILTER(WHERE day_offset<ap.completed_days)::int,
    STRING_AGG(TO_CHAR(ap.start_date+day_offset,'DD/MM/YYYY'),', ' ORDER BY day_offset),
    ROUND((COUNT(*) FILTER(WHERE day_offset<ap.completed_days)*100.0/60)::numeric,2),
    ROUND((COUNT(*)*100.0/60)::numeric,2)
  FROM additional_driving_practices ap
  JOIN students s ON s.id=ap.student_id AND s.status<>'inhabilitado'
  JOIN branches b ON b.id=ap.branch_id
  CROSS JOIN LATERAL generate_series(0,ap.number_of_days-1) day_offset
  WHERE ap.instructor_id=$6 AND ap.status IN ('SCHEDULED','IN_PROGRESS','COMPLETED')
    AND ap.start_date+day_offset BETWEEN $2::date AND $3::date
    AND ($1::uuid IS NULL OR b.id=$1) AND ($4::text IS NULL OR b.province=$4) AND ($5::text IS NULL OR b.city=$5)
  GROUP BY ap.id,s.id
)`;
