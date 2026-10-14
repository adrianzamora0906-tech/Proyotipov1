const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const AuditService = require('./AuditService');
const AutomaticCycleService = require('./AutomaticCycleService');
const WeekendDistributionCleanup = require('./WeekendDistributionCleanupService');
const AUDIT = require('../constants/auditActions');

const ACTIVE_STUDENT_STATUSES = ['matriculado', 'en_curso', 'pendiente_documentacion', 'pendiente_pago', 'pago_parcial', 'pago_confirmado', 'horario_seleccionado'];
const ACTIVE_ENROLLMENT_STATUSES = ['activo', 'activa', 'en_curso'];

async function resolveWeekendProgram(queryable, branchId, courseId, fallbackProgramId = null) {
  const result=await queryable.query(`SELECT source.id branch_id,source.name branch_name,source_program.id program_id,
      source_program.intensive_rotation_anchor_date anchor_date
    FROM branches current
    JOIN branches source ON source.id=CASE WHEN current.code='SP_IC' THEN
      (SELECT shared.id FROM branches shared WHERE shared.code='SP_IC1' AND shared.city_id=current.city_id AND shared.active=TRUE LIMIT 1)
      ELSE current.id END
    JOIN branch_course_programs source_program ON source_program.branch_id=source.id AND source_program.course_id=$2
    WHERE current.id=$1 LIMIT 1`,[branchId,courseId]);
  return result.rows[0]||{branch_id:branchId,program_id:fallbackProgramId,branch_name:null};
}

function weekendConfirmationError(message, details) {
  const error=createError(409,message);
  error.code='WEEKEND_REASSIGNMENT_CONFIRMATION_REQUIRED';
  error.details=details;
  return error;
}

function shiftedDate(value, days) {
  const date=new Date(`${String(value).slice(0,10)}T12:00:00`);
  date.setDate(date.getDate()+days);
  return date.toISOString().slice(0,10);
}

async function moveIntensiveCycle(client,{cycleId,branchId,vehicleType,startDate,positionOrder,actorId}) {
  const cycle=(await client.query(`SELECT id,code,start_date,end_date FROM course_cycles WHERE id=$1 FOR UPDATE`,[cycleId])).rows[0];
  if(!cycle) throw createError(409,'El curso que se iba a reagendar ya no existe');
  const oldStart=String(cycle.start_date).slice(0,10);
  if(oldStart===startDate) return;
  const delta=Math.round((new Date(`${startDate}T12:00:00`)-new Date(`${oldStart}T12:00:00`))/86400000);
  const enrollmentIds=(await client.query(`SELECT DISTINCT enrollment_id FROM course_cycle_schedule_assignments WHERE cycle_id=$1`,[cycleId])).rows.map(row=>row.enrollment_id);
  const targetRotation=await client.query(`SELECT id,cycle_id FROM intensive_instructor_rotation_assignments
    WHERE branch_id=$1 AND vehicle_type=$2 AND start_date=$3::date AND position_order=$4 FOR UPDATE`,[branchId,vehicleType,startDate,positionOrder]);
  if(targetRotation.rowCount&&String(targetRotation.rows[0].cycle_id)!==String(cycleId)) throw createError(409,`La posición ${positionOrder} del ${startDate} ya pertenece a otro curso`);
  await client.query(`UPDATE course_cycle_schedule_assignments SET schedule_date=schedule_date+$2::int,updated_at=NOW() WHERE cycle_id=$1`,[cycleId,delta]);
  if(enrollmentIds.length){
    await client.query(`UPDATE enrollments SET practical_start_date=practical_start_date+$2::int,practical_end_date=practical_end_date+$2::int,updated_at=NOW()
      WHERE id=ANY($1::uuid[])`,[enrollmentIds,delta]);
    await client.query(`UPDATE enrollment_instructor_assignments SET start_date=start_date+$2::int,end_date=end_date+$2::int,updated_at=NOW()
      WHERE enrollment_id=ANY($1::uuid[]) AND active=TRUE`,[enrollmentIds,delta]);
    await client.query(`UPDATE practical_sessions SET scheduled_start=scheduled_start+($2::text||' days')::interval,
      scheduled_end=scheduled_end+($2::text||' days')::interval,updated_at=NOW()
      WHERE enrollment_id=ANY($1::uuid[]) AND deleted_at IS NULL`,[enrollmentIds,delta]);
  }
  const code=`ROT-INT-${vehicleType.toUpperCase()}-${startDate}-${positionOrder}`;
  await client.query(`UPDATE course_cycles SET code=$2,start_date=$3::date,end_date=$4::date,updated_at=NOW() WHERE id=$1`,
    [cycleId,code,startDate,shiftedDate(cycle.end_date,delta)]);
  await client.query(`UPDATE intensive_instructor_rotation_assignments SET start_date=$2::date,position_order=$3,updated_at=NOW()
    WHERE cycle_id=$1`,[cycleId,startDate,positionOrder]);
}

async function replacePublishedCycleInstructor(client,{cycleId,oldInstructorId,newInstructorId,actorId,startDate}) {
  if(String(oldInstructorId)===String(newInstructorId)) return;
  await client.query(`UPDATE course_cycle_instructors SET active=FALSE,updated_at=NOW() WHERE cycle_id=$1 AND instructor_id=$2 AND active=TRUE`,[cycleId,oldInstructorId]);
  await client.query(`INSERT INTO course_cycle_instructors(cycle_id,instructor_id,role,active) VALUES($1,$2,'practico',TRUE)
    ON CONFLICT(cycle_id,instructor_id) DO UPDATE SET active=TRUE,updated_at=NOW()`,[cycleId,newInstructorId]);
  await client.query(`UPDATE course_cycle_schedule_assignments SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1 AND status='activo'`,[cycleId,newInstructorId]);
  await client.query(`UPDATE enrollment_instructor_assignments assignment SET instructor_id=$2,updated_at=NOW()
    WHERE assignment.active=TRUE AND EXISTS(SELECT 1 FROM course_cycle_schedule_assignments schedule WHERE schedule.cycle_id=$1 AND schedule.enrollment_id=assignment.enrollment_id)`,[cycleId,newInstructorId]);
  await client.query(`UPDATE practical_sessions session SET instructor_id=$2,updated_at=NOW()
    WHERE session.deleted_at IS NULL AND EXISTS(SELECT 1 FROM course_cycle_schedule_assignments schedule WHERE schedule.cycle_id=$1 AND schedule.enrollment_id=session.enrollment_id)`,[cycleId,newInstructorId]);
  await client.query(`UPDATE course_cycle_seat_reservations SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1 AND status='activo'`,[cycleId,newInstructorId]);
  await client.query(`UPDATE intensive_instructor_rotation_assignments SET instructor_id=$2,updated_at=NOW() WHERE cycle_id=$1`,[cycleId,newInstructorId]);
}

function periodRange(period = 'month', dateFrom = null, dateTo = null) {
  const now = new Date();
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  let from;
  let to = new Date(now);

  if (period === 'today') from = startOfDay(now);
  else if (period === 'week') {
    from = startOfDay(now);
    from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  } else if (period === 'previous_month') {
    from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    to = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (period === 'year') from = new Date(now.getFullYear(), 0, 1);
  else if (period === 'custom') {
    if (!dateFrom || !dateTo) throw createError(422, 'Rango personalizado incompleto');
    from = new Date(`${dateFrom}T00:00:00`);
    to = new Date(`${dateTo}T23:59:59`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw createError(422, 'Rango personalizado inválido');
  } else from = new Date(now.getFullYear(), now.getMonth(), 1);

  return { period, from, to };
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function nextAllowedCourseDate(anchorValue, allowedDays, steps = 1) {
  const rawAnchor = anchorValue instanceof Date
    ? anchorValue.toISOString().slice(0, 10)
    : (anchorValue ? String(anchorValue).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const anchor = new Date(`${rawAnchor}T00:00:00`);
  let remaining = Math.max(1, Number(steps) || 1);
  while (remaining > 0) {
    anchor.setDate(anchor.getDate() + 1);
    if (allowedDays.has(anchor.getDay())) remaining -= 1;
  }
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}-${String(anchor.getDate()).padStart(2, '0')}`;
}

class BranchAdminService {
  static buildScope(auth, filters = {}) {
    const params = [];
    const where = ['1=1'];
    if (!auth.global) {
      params.push(auth.branchId);
      where.push(`b.id = $${params.length}`);
    } else if (filters.branchId) {
      params.push(filters.branchId);
      where.push(`b.id = $${params.length}`);
    }
    return { params, where };
  }

  static async locationCatalog() {
    const [provinces, cities] = await Promise.all([
      db.query('SELECT code, name FROM provinces WHERE active = TRUE ORDER BY name'),
      db.query('SELECT id, name, province FROM cities WHERE active = TRUE ORDER BY province, name'),
    ]);
    return { provinces: provinces.rows, cities: cities.rows };
  }

  static mapConfig() {
    const apiKey = process.env.MAPTILER_API_KEY || process.env.MAPTILER_KEY || null;
    return {
      provider: apiKey ? 'maptiler' : null,
      apiKey,
      defaultCenter: [-80.7089, -0.9677],
      defaultZoom: 14,
    };
  }

  static async resolveCityId(client, data) {
    if (data.cityId) return data.cityId;
    if (!data.city || !data.province) return null;
    const city = await client.query(
      'SELECT id FROM cities WHERE LOWER(name) = LOWER($1) AND LOWER(province) = LOWER($2) AND active = TRUE LIMIT 1',
      [data.city, data.province],
    );
    return city.rows[0]?.id || null;
  }

  static async list(auth, filters = {}) {
    const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
    const page = Math.max(Number(filters.page) || 1, 1);
    const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
    const today = new Date();
    const defaultTo = today.toISOString().slice(0, 10);
    const defaultFromDate = new Date(today);
    defaultFromDate.setDate(defaultFromDate.getDate() - 9);
    const dateFrom = validDate(filters.dateFrom) ? filters.dateFrom : defaultFromDate.toISOString().slice(0, 10);
    const dateTo = validDate(filters.dateTo) ? filters.dateTo : defaultTo;
    const rangeStart = new Date(`${dateFrom}T00:00:00Z`);
    const rangeEnd = new Date(`${dateTo}T00:00:00Z`);
    const rangeDays = Math.floor((rangeEnd - rangeStart) / 86400000) + 1;
    if (rangeDays < 1) throw createError(422, 'La fecha Desde no puede ser posterior a Hasta');
    if (rangeDays > 31) throw createError(422, 'El rango máximo permitido es de 31 días');
    const { params, where } = this.buildScope(auth, filters);

    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(b.name ILIKE $${params.length} OR b.code ILIKE $${params.length} OR b.city ILIKE $${params.length})`);
    }
    if (filters.status === 'active') where.push('b.active = TRUE');
    if (filters.status === 'inactive') where.push('b.active = FALSE');
    if (filters.city) {
      params.push(filters.city);
      where.push(`b.city = $${params.length}`);
    }
    if (filters.province) {
      params.push(filters.province);
      where.push(`b.province = $${params.length}`);
    }
    if (filters.workflowId) {
      params.push(filters.workflowId);
      where.push(`EXISTS (SELECT 1 FROM branch_workflows bw WHERE bw.branch_id = b.id AND bw.workflow_id = $${params.length} AND bw.active = TRUE)`);
    }

    const countParams = [...params];
    const count = await db.query(`SELECT COUNT(*)::int total FROM branches b WHERE ${where.join(' AND ')}`, countParams);

    const courseType = ['moto', 'carro'].includes(filters.courseType) ? filters.courseType : null;
    params.push(courseType, dateFrom, dateTo);
    const courseTypeParam = params.length - 2;
    const dateFromParam = params.length - 1;
    const dateToParam = params.length;
    params.push(limit, (page - 1) * limit);
    const data = await db.query(`
      SELECT b.id, b.code, b.name, b.province, b.city, b.address, b.phone, b.email, b.active, b.opening_date,
        b.latitude, b.longitude, b.location_source,
        admin_user.full_name administrator_name,
        admin_user.id administrator_id,
        workflow.workflow_id,
        workflow.workflow_code,
        workflow.workflow_name,
        COALESCE(staff.count, 0)::int staff_count,
        COALESCE(students.count, 0)::int active_students,
        COALESCE(enrollments.count, 0)::int active_enrollments,
        COALESCE(daily_enrollments.points, '[]'::json) daily_enrollments,
        COALESCE(staff_performance.people, '[]'::json) staff_performance,
        COALESCE(payment_activity.students_with_payment, 0)::int students_with_payment,
        COALESCE(courses.count, 0)::int enabled_courses,
        COALESCE(users_without_roles.count, 0)::int users_without_roles,
        CASE
          WHEN b.active = FALSE THEN 'inactive'
          WHEN admin_user.id IS NULL OR workflow.workflow_id IS NULL OR COALESCE(courses.count, 0) = 0 OR COALESCE(users_without_roles.count, 0) > 0 THEN 'requires_configuration'
          ELSE 'active'
        END configuration_status
      FROM branches b
      LEFT JOIN LATERAL (
        SELECT u.id, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') full_name
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id AND r.code = 'BRANCH_ADMIN'
        JOIN users u ON u.id = ur.user_id AND u.active = TRUE
        WHERE ur.branch_id = b.id AND ur.active = TRUE AND (ur.valid_from IS NULL OR ur.valid_from <= NOW()) AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
        ORDER BY ur.created_at DESC
        LIMIT 1
      ) admin_user ON TRUE
      LEFT JOIN LATERAL (
        SELECT w.id workflow_id, w.code workflow_code, w.name workflow_name
        FROM branch_workflows bw
        JOIN workflows w ON w.id = bw.workflow_id
        WHERE bw.branch_id = b.id AND bw.active = TRUE AND w.active = TRUE
        ORDER BY bw.updated_at DESC, bw.created_at DESC
        LIMIT 1
      ) workflow ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT person.user_id) count
        FROM (
          SELECT u.id user_id
          FROM users u
          WHERE u.branch_id=b.id AND u.active=TRUE AND u.student_id IS NULL
            AND EXISTS (
              SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
              WHERE ur.user_id=u.id AND ur.active=TRUE
                AND (ur.valid_from IS NULL OR ur.valid_from<=NOW())
                AND (ur.valid_until IS NULL OR ur.valid_until>NOW())
                AND r.code IN ('BRANCH_ADMIN','SECRETARY','CASHIER')
            )
          UNION
          SELECT u.id user_id
          FROM users u
          JOIN instructor_profiles ip ON ip.user_id=u.id AND ip.status='activo' AND ip.deleted_at IS NULL
          WHERE u.branch_id=b.id AND u.active=TRUE
            AND NOT EXISTS (
              SELECT 1 FROM instructor_branch_priorities other_priority
              WHERE other_priority.instructor_id=ip.id AND other_priority.assignment_type='priority'
                AND other_priority.active=TRUE AND other_priority.branch_id<>b.id
                AND other_priority.effective_from<=CURRENT_DATE
                AND (other_priority.effective_until IS NULL OR other_priority.effective_until>=CURRENT_DATE)
            )
          UNION
          SELECT u.id user_id
          FROM instructor_branch_priorities priority
          JOIN instructor_profiles ip ON ip.id=priority.instructor_id AND ip.status='activo' AND ip.deleted_at IS NULL
          JOIN users u ON u.id=ip.user_id AND u.active=TRUE
          WHERE priority.branch_id=b.id AND priority.assignment_type='priority' AND priority.active=TRUE
            AND priority.effective_from<=CURRENT_DATE
            AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
        ) person
      ) staff ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(DISTINCT s.id) count FROM students s JOIN enrollments e ON e.student_id=s.id JOIN courses c ON c.id=e.course_id WHERE s.branch_id = b.id AND LOWER(s.status) = ANY($${params.length + 1}::text[]) AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) students ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) count FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.branch_id = b.id AND LOWER(e.status) = ANY($${params.length + 2}::text[]) AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) enrollments ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(
          json_build_object(
            'date', calendar.metric_day::date,
            'enrollments', (SELECT COUNT(*)::int FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND e.created_at::date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)),
            'income', (SELECT COALESCE(SUM(pd.amount),0)::numeric FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND pd.status='ACTIVE' AND pd.created_at::date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)),
            'students_with_payment', (SELECT COUNT(DISTINCT e.student_id)::int FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND pd.status='ACTIVE' AND pd.created_at::date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)),
            'fully_paid_enrollments', (SELECT COUNT(DISTINCT e.id)::int FROM enrollments e JOIN payments p ON p.enrollment_id=e.id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND p.status<>'anulado' AND p.balance=0 AND e.created_at::date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)),
            'active_students', (SELECT COUNT(DISTINCT ccsa.student_id)::int FROM course_cycle_schedule_assignments ccsa JOIN course_cycles cc ON cc.id=ccsa.cycle_id WHERE cc.branch_id=b.id AND cc.active=TRUE AND cc.deleted_at IS NULL AND ccsa.status='activo' AND ccsa.schedule_date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR cc.vehicle_type=$${courseTypeParam})),
            'courses_started', (SELECT COUNT(*)::int FROM course_cycles cc WHERE cc.branch_id=b.id AND cc.active=TRUE AND cc.deleted_at IS NULL AND cc.start_date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR cc.vehicle_type=$${courseTypeParam})),
            'pending_balance', (SELECT COALESCE(SUM(p.balance),0)::numeric FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND p.status<>'anulado' AND e.created_at::date=calendar.metric_day::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END))
          )
          ORDER BY calendar.metric_day
        ) points
        FROM generate_series($${dateFromParam}::date, $${dateToParam}::date, INTERVAL '1 day') AS calendar(metric_day)
      ) daily_enrollments ON TRUE
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
          'id', person.id,
          'name', person.full_name,
          'role', person.role_code,
          'registered_students', person.registered_students,
          'confirmed_enrollments', person.confirmed_enrollments,
          'payments_count', person.payments_count,
          'collected_amount', person.collected_amount,
          'last_activity', person.last_activity
        ) ORDER BY person.registered_students DESC, person.collected_amount DESC, person.full_name) people
        FROM (
          SELECT u.id, NULLIF(TRIM(CONCAT(u.first_name,' ',u.last_name)),'') full_name, r.code role_code,
            (SELECT COUNT(DISTINCT e.student_id)::int FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND e.created_by=u.id AND e.created_at::date BETWEEN $${dateFromParam}::date AND $${dateToParam}::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) registered_students,
            (SELECT COUNT(DISTINCT e.id)::int FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN payments p ON p.enrollment_id=e.id WHERE e.branch_id=b.id AND e.created_by=u.id AND p.status<>'anulado' AND p.balance=0 AND e.created_at::date BETWEEN $${dateFromParam}::date AND $${dateToParam}::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) confirmed_enrollments,
            (SELECT COUNT(*)::int FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND pd.received_by=u.id AND pd.status='ACTIVE' AND pd.created_at::date BETWEEN $${dateFromParam}::date AND $${dateToParam}::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) payments_count,
            (SELECT COALESCE(SUM(pd.amount),0)::numeric FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id WHERE e.branch_id=b.id AND pd.received_by=u.id AND pd.status='ACTIVE' AND pd.created_at::date BETWEEN $${dateFromParam}::date AND $${dateToParam}::date AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)) collected_amount,
            (SELECT MAX(activity_at) FROM (SELECT MAX(e.created_at) activity_at FROM enrollments e WHERE e.branch_id=b.id AND e.created_by=u.id UNION ALL SELECT MAX(pd.created_at) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=b.id AND pd.received_by=u.id AND pd.status='ACTIVE') activity) last_activity
          FROM users u
          JOIN user_roles ur ON ur.user_id=u.id AND ur.branch_id=b.id AND ur.active=TRUE AND (ur.valid_until IS NULL OR ur.valid_until>NOW())
          JOIN roles r ON r.id=ur.role_id AND r.code IN ('BRANCH_ADMIN','SECRETARY','CASHIER')
          WHERE u.branch_id=b.id AND u.active=TRUE
        ) person
      ) staff_performance ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT e.student_id)::int students_with_payment
        FROM payment_details pd
        JOIN payments p ON p.id=pd.payment_id
        JOIN enrollments e ON e.id=p.enrollment_id
        JOIN courses c ON c.id=e.course_id
        WHERE e.branch_id=b.id AND pd.status='ACTIVE'
          AND pd.created_at::date BETWEEN $${dateFromParam}::date AND $${dateToParam}::date
          AND ($${courseTypeParam}::text IS NULL OR LOWER(c.name) LIKE CASE WHEN $${courseTypeParam}='moto' THEN '%moto%' ELSE '%automóvil%' END)
      ) payment_activity ON TRUE
      LEFT JOIN LATERAL (SELECT COUNT(*) count FROM branch_courses bc WHERE bc.branch_id = b.id AND bc.active = TRUE) courses ON TRUE
      LEFT JOIN LATERAL (
        SELECT COUNT(*) count
        FROM users u
        WHERE u.branch_id = b.id AND u.active = TRUE AND u.student_id IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id AND ur.active = TRUE AND (ur.valid_until IS NULL OR ur.valid_until > NOW()))
      ) users_without_roles ON TRUE
      WHERE ${where.join(' AND ')}
      ORDER BY b.active DESC, b.name
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `, [...params, ACTIVE_STUDENT_STATUSES, ACTIVE_ENROLLMENT_STATUSES]);

    const stats = await db.query(`
      SELECT COUNT(*)::int total,
        COUNT(*) FILTER (WHERE x.active)::int active,
        COUNT(*) FILTER (WHERE NOT x.active)::int inactive,
        COALESCE(SUM(x.staff_count), 0)::int active_staff
      FROM (
        SELECT b.id, b.active, COALESCE(staff.count, 0) staff_count
        FROM branches b
        LEFT JOIN LATERAL (
          SELECT COUNT(DISTINCT person.user_id) count
          FROM (
            SELECT u.id user_id
            FROM users u
            WHERE u.branch_id=b.id AND u.active=TRUE AND u.student_id IS NULL
              AND EXISTS (
                SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
                WHERE ur.user_id=u.id AND ur.active=TRUE
                  AND (ur.valid_from IS NULL OR ur.valid_from<=NOW())
                  AND (ur.valid_until IS NULL OR ur.valid_until>NOW())
                  AND r.code IN ('BRANCH_ADMIN','SECRETARY','CASHIER')
              )
            UNION
            SELECT u.id user_id
            FROM users u
            JOIN instructor_profiles ip ON ip.user_id=u.id AND ip.status='activo' AND ip.deleted_at IS NULL
            WHERE u.branch_id=b.id AND u.active=TRUE
              AND NOT EXISTS (
                SELECT 1 FROM instructor_branch_priorities other_priority
                WHERE other_priority.instructor_id=ip.id AND other_priority.assignment_type='priority'
                  AND other_priority.active=TRUE AND other_priority.branch_id<>b.id
                  AND other_priority.effective_from<=CURRENT_DATE
                  AND (other_priority.effective_until IS NULL OR other_priority.effective_until>=CURRENT_DATE)
              )
            UNION
            SELECT u.id user_id
            FROM instructor_branch_priorities priority
            JOIN instructor_profiles ip ON ip.id=priority.instructor_id AND ip.status='activo' AND ip.deleted_at IS NULL
            JOIN users u ON u.id=ip.user_id AND u.active=TRUE
            WHERE priority.branch_id=b.id AND priority.assignment_type='priority' AND priority.active=TRUE
              AND priority.effective_from<=CURRENT_DATE
              AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
          ) person
        ) staff ON TRUE
        WHERE ${where.join(' AND ')}
      ) x
    `, countParams);

    const optionScope = [auth.global, auth.branchId];
    const [branchOptions, catalog] = await Promise.all([
      db.query('SELECT id, name, province, city FROM branches WHERE active = TRUE AND ($1::boolean = TRUE OR id = $2::uuid) ORDER BY province, city, name', optionScope),
      this.locationCatalog(),
    ]);

    return {
      data: data.rows,
      stats: stats.rows[0],
      filters: {
        branches: branchOptions.rows,
        cities: catalog.cities.map(row => row.name),
        provinces: catalog.provinces.map(row => row.name),
        cityCatalog: catalog.cities,
      },
      pagination: { page, limit, total: count.rows[0].total },
      period: { dateFrom, dateTo },
    };
  }

  static async getById(auth, id) {
    if (!auth.global && String(auth.branchId) !== String(id)) throw createError(403, 'No tienes acceso a esta sucursal');
    const r = await db.query(`
      SELECT b.*, workflow.workflow_code, workflow.workflow_name, admin_user.id administrator_id, admin_user.full_name administrator_name
      FROM branches b
      LEFT JOIN LATERAL (
        SELECT w.code workflow_code, w.name workflow_name
        FROM branch_workflows bw JOIN workflows w ON w.id = bw.workflow_id
        WHERE bw.branch_id = b.id AND bw.active = TRUE AND w.active = TRUE
        ORDER BY bw.updated_at DESC, bw.created_at DESC LIMIT 1
      ) workflow ON TRUE
      LEFT JOIN LATERAL (
        SELECT u.id, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') full_name
        FROM user_roles ur JOIN roles r ON r.id = ur.role_id AND r.code = 'BRANCH_ADMIN'
        JOIN users u ON u.id = ur.user_id AND u.active = TRUE
        WHERE ur.branch_id = b.id AND ur.active = TRUE
        ORDER BY ur.created_at DESC LIMIT 1
      ) admin_user ON TRUE
      WHERE b.id = $1
    `, [id]);
    if (!r.rows.length) throw createError(404, 'Sucursal no encontrada');
    return r.rows[0];
  }

  static async summary(auth, id, filters = {}) {
    await this.getById(auth, id);
    const range = periodRange(filters.period, filters.dateFrom, filters.dateTo);
    const [metrics, health] = await Promise.all([
      db.query(`
        SELECT
          (SELECT COUNT(DISTINCT person.user_id)::int FROM (
            SELECT u.id user_id FROM users u
            WHERE u.branch_id=$1 AND u.active AND u.student_id IS NULL
              AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
                WHERE ur.user_id=u.id AND ur.active
                  AND (ur.valid_from IS NULL OR ur.valid_from<=NOW())
                  AND (ur.valid_until IS NULL OR ur.valid_until>NOW())
                  AND r.code IN ('BRANCH_ADMIN','SECRETARY','CASHIER'))
            UNION
            SELECT u.id user_id FROM users u
            JOIN instructor_profiles ip ON ip.user_id=u.id AND ip.status='activo' AND ip.deleted_at IS NULL
            WHERE u.branch_id=$1 AND u.active
              AND NOT EXISTS (
                SELECT 1 FROM instructor_branch_priorities other_priority
                WHERE other_priority.instructor_id=ip.id AND other_priority.assignment_type='priority'
                  AND other_priority.active AND other_priority.branch_id<>$1
                  AND other_priority.effective_from<=CURRENT_DATE
                  AND (other_priority.effective_until IS NULL OR other_priority.effective_until>=CURRENT_DATE)
              )
            UNION
            SELECT u.id user_id FROM instructor_branch_priorities priority
            JOIN instructor_profiles ip ON ip.id=priority.instructor_id AND ip.status='activo' AND ip.deleted_at IS NULL
            JOIN users u ON u.id=ip.user_id AND u.active
            WHERE priority.branch_id=$1 AND priority.assignment_type='priority' AND priority.active
              AND priority.effective_from<=CURRENT_DATE
              AND (priority.effective_until IS NULL OR priority.effective_until>=CURRENT_DATE)
          ) person)::int active_staff,
          (SELECT COUNT(*) FROM students s WHERE s.branch_id=$1 AND LOWER(s.status)=ANY($4::text[]))::int active_students,
          (SELECT COUNT(*) FROM enrollments e WHERE e.branch_id=$1 AND LOWER(e.status)=ANY($5::text[]))::int active_enrollments,
          (SELECT COUNT(*) FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id WHERE u.branch_id=$1 AND u.active AND ip.status='activo')::int active_instructors,
          (SELECT COUNT(*) FROM practical_sessions ps WHERE ps.branch_id=$1 AND ps.deleted_at IS NULL AND ps.scheduled_start::date=CURRENT_DATE)::int classes_today,
          (SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=$1 AND pd.status='activo' AND pd.created_at BETWEEN $2 AND $3)::numeric collected,
          (SELECT COALESCE(SUM(p.balance),0) FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=$1 AND p.status<>'anulado' AND p.balance>0)::numeric pending_payments,
          (SELECT COUNT(*) FROM incidents i WHERE i.branch_id=$1 AND UPPER(i.status) NOT IN ('RESUELTA','RESUELTO','CERRADA','CERRADO'))::int open_incidents
      `, [id, range.from, range.to, ACTIVE_STUDENT_STATUSES, ACTIVE_ENROLLMENT_STATUSES]),
      this.getConfigurationHealth(auth, id),
    ]);
    return { period: { period: range.period, dateFrom: range.from, dateTo: range.to }, metrics: metrics.rows[0], health };
  }

  static async getConfigurationHealth(auth, id) {
    await this.getById(auth, id);
    const r = await db.query(`
      SELECT
        EXISTS(
          SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id AND r.code='BRANCH_ADMIN'
          JOIN users u ON u.id=ur.user_id AND u.active
          WHERE ur.branch_id=$1 AND ur.active
        ) administrator_assigned,
        EXISTS(
          SELECT 1 FROM branch_workflows bw JOIN workflows w ON w.id=bw.workflow_id AND w.active
          WHERE bw.branch_id=$1 AND bw.active
        ) workflow_configured,
        EXISTS(SELECT 1 FROM branch_courses bc WHERE bc.branch_id=$1 AND bc.active) courses_enabled,
        EXISTS(SELECT 1 FROM users u WHERE u.branch_id=$1 AND u.active AND u.student_id IS NULL) active_staff,
        (SELECT COUNT(*) FROM users u WHERE u.branch_id=$1 AND u.active AND u.student_id IS NULL AND NOT EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=u.id AND ur.active))::int users_without_roles,
        EXISTS(SELECT 1 FROM branch_payment_methods bpm WHERE bpm.branch_id=$1 AND bpm.active) finance_configured
    `, [id]);
    return r.rows[0];
  }

  static async staff(auth, id, filters = {}) {
    await this.getById(auth, id);
    const params = [id];
    const where = [`u.student_id IS NULL AND EXISTS (
      SELECT 1
      FROM branches selected_branch
      JOIN branches user_branch ON user_branch.id=u.branch_id
      WHERE selected_branch.id=$1
        AND selected_branch.city_id IS NOT DISTINCT FROM user_branch.city_id
    ) AND EXISTS (
      SELECT 1 FROM user_roles scope_ur JOIN roles scope_role ON scope_role.id=scope_ur.role_id
      WHERE scope_ur.user_id=u.id AND scope_ur.active=TRUE
        AND (scope_ur.valid_from IS NULL OR scope_ur.valid_from<=NOW())
        AND (scope_ur.valid_until IS NULL OR scope_ur.valid_until>NOW())
        AND scope_role.code IN ('BRANCH_ADMIN','SECRETARY','CASHIER','INSTRUCTOR')
    )`];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(u.username ILIKE $${params.length} OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $${params.length})`);
    }
    if (filters.status === 'active') where.push('u.active = TRUE');
    if (filters.status === 'inactive') where.push('u.active = FALSE');
    if (filters.role) {
      params.push(filters.role);
      where.push(`EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND ur.active AND r.code=$${params.length})`);
    }
    const r = await db.query(`
      SELECT u.id, u.branch_id, user_branch.name branch_name, u.username, u.first_name, u.last_name, u.email, u.phone, u.active, u.last_login_at,
        MAX(ip.practice_area) practice_area,
        COALESCE(MAX(student_stats.student_count),0)::int assigned_student_count,
        COALESCE(MAX(student_stats.active_student_count),0)::int active_assigned_student_count,
        COALESCE(MAX(student_stats.future_schedule_student_count),0)::int future_schedule_student_count,
        COALESCE(MAX(student_stats.active_session_count),0)::int active_session_count,
        COALESCE(MAX(student_stats.student_search),'') assigned_student_search,
        MAX(current_vacation.id::text)::uuid current_vacation_id,
        MAX(current_vacation.start_date) current_vacation_start,
        MAX(current_vacation.end_date) current_vacation_end,
        COALESCE(json_agg(DISTINCT jsonb_build_object('assignmentId', ur.id, 'code', r.code, 'name', r.name, 'scope', r.scope_type)) FILTER (WHERE ur.id IS NOT NULL), '[]') roles
      FROM users u
      LEFT JOIN branches user_branch ON user_branch.id=u.branch_id
      LEFT JOIN instructor_profiles ip ON ip.user_id=u.id AND ip.deleted_at IS NULL
      LEFT JOIN user_roles ur ON ur.user_id=u.id AND ur.active=TRUE
      LEFT JOIN roles r ON r.id=ur.role_id
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT linked.student_id)::int student_count,
          COUNT(DISTINCT linked.student_id) FILTER(WHERE linked.is_active_assignment)::int active_student_count,
          COUNT(DISTINCT linked.student_id) FILTER(WHERE linked.has_future_schedule)::int future_schedule_student_count,
          COUNT(DISTINCT linked.enrollment_id) FILTER(WHERE linked.has_active_session)::int active_session_count,
          STRING_AGG(DISTINCT LOWER(linked.search_text),' ') student_search
        FROM (
          SELECT s.id student_id,assignment.enrollment_id,CONCAT(s.first_name,' ',s.last_name,' ',s.identification) search_text,
            (assignment.schedule_date>=CURRENT_DATE) is_active_assignment,
            (assignment.schedule_date>=CURRENT_DATE) has_future_schedule,
            false has_active_session
          FROM course_cycle_schedule_assignments assignment
          JOIN students s ON s.status <> 'inhabilitado' AND s.id=assignment.student_id
          JOIN instructor_profiles linked_ip ON linked_ip.id=assignment.instructor_id
          WHERE linked_ip.user_id=u.id AND assignment.status='activo'
          UNION
          SELECT s.id,session.enrollment_id,CONCAT(s.first_name,' ',s.last_name,' ',s.identification),
            (session.status IN ('PROGRAMADA','PROXIMA','EN_CURSO')) is_active_assignment,
            (session.scheduled_start::date>=CURRENT_DATE AND session.status IN ('PROGRAMADA','PROXIMA','EN_CURSO')) has_future_schedule,
            (session.status IN ('PROGRAMADA','PROXIMA','EN_CURSO')) has_active_session
          FROM practical_sessions session
          JOIN enrollments enrollment ON enrollment.id=session.enrollment_id
          JOIN students s ON s.status <> 'inhabilitado' AND s.id=enrollment.student_id
          JOIN instructor_profiles linked_ip ON linked_ip.id=session.instructor_id
          WHERE linked_ip.user_id=u.id AND session.deleted_at IS NULL
        ) linked
      ) student_stats ON TRUE
      LEFT JOIN LATERAL (
        SELECT vacation.id,vacation.start_date,vacation.end_date
        FROM staff_vacations vacation
        WHERE vacation.user_id=u.id AND vacation.status='approved'
          AND CURRENT_DATE BETWEEN vacation.start_date AND vacation.end_date
        ORDER BY vacation.start_date LIMIT 1
      ) current_vacation ON TRUE
      WHERE ${where.join(' AND ')}
      GROUP BY u.id,user_branch.name
      ORDER BY user_branch.name, u.active ASC, u.first_name, u.last_name
    `, params);
    return r.rows;
  }

  static async workflow(auth, id) {
    await this.getById(auth, id);
    const r = await db.query(`
      SELECT w.id, w.code, w.name, w.description, bw.id assignment_id, bw.active, bw.effective_from
      FROM workflows w
      LEFT JOIN branch_workflows bw ON bw.workflow_id=w.id AND bw.branch_id=$1
      WHERE w.active=TRUE
      ORDER BY bw.active DESC NULLS LAST, w.name
    `, [id]);
    return r.rows;
  }

  static async paymentMethods(auth, id) {
    await this.getById(auth, id);
    const result = await db.query(`
      SELECT pm.id, pm.code, pm.name, pm.active global_active,
        COALESCE(bpm.active, FALSE) active,
        COALESCE(bpm.requires_reference, FALSE) requires_reference,
        bpm.provider
      FROM payment_methods pm
      LEFT JOIN branch_payment_methods bpm ON bpm.payment_method_id=pm.id AND bpm.branch_id=$1
      WHERE pm.active=TRUE
      ORDER BY CASE pm.code WHEN 'efectivo' THEN 1 WHEN 'transferencia' THEN 2 WHEN 'tarjeta' THEN 3 ELSE 4 END, pm.name
    `, [id]);
    return result.rows;
  }

  static async updatePaymentMethods(actor, id, data, ctx) {
    const methods = Array.isArray(data.methods) ? data.methods : [];
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const branch = await client.query('SELECT id FROM branches WHERE id=$1 FOR SHARE', [id]);
      if (!branch.rows.length) throw createError(404, 'Sucursal no encontrada');
      const catalog = await client.query('SELECT id, code FROM payment_methods WHERE active=TRUE');
      const byCode = new Map(catalog.rows.map(method => [method.code, method]));
      const received = new Map(methods.map(method => [String(method.code || '').trim().toLowerCase(), method]));
      if (![...received.keys()].every(code => byCode.has(code))) throw createError(422, 'Uno o más métodos de pago no son válidos');
      if (![...received.values()].some(method => method.active !== false)) throw createError(422, 'La sucursal debe conservar al menos un método de pago activo');
      const old = await client.query('SELECT * FROM branch_payment_methods WHERE branch_id=$1 ORDER BY payment_method_id FOR UPDATE', [id]);
      for (const [code, catalogMethod] of byCode) {
        const method = received.get(code) || { active: false, requiresReference: false, provider: null };
        await client.query(`
          INSERT INTO branch_payment_methods(branch_id,payment_method_id,active,requires_reference,provider,updated_by)
          VALUES($1,$2,$3,$4,$5,$6)
          ON CONFLICT(branch_id,payment_method_id) DO UPDATE SET
            active=EXCLUDED.active, requires_reference=EXCLUDED.requires_reference,
            provider=EXCLUDED.provider, updated_by=EXCLUDED.updated_by, updated_at=NOW()
        `, [id, catalogMethod.id, method.active !== false, Boolean(method.requiresReference), String(method.provider || '').trim() || null, actor.id]);
      }
      const updated = await client.query(`SELECT bpm.*,pm.code,pm.name FROM branch_payment_methods bpm JOIN payment_methods pm ON pm.id=bpm.payment_method_id WHERE bpm.branch_id=$1 ORDER BY pm.name`, [id]);
      await AuditService.log({ userId:actor.id,branchId:id,role:actor.role,action:AUDIT.BRANCH_PAYMENT_METHODS_UPDATED,
        module:'SUCURSALES',entityType:'BRANCH_PAYMENT_METHODS',entityId:id,description:'Métodos de pago de la sucursal actualizados',
        oldValues:old.rows,newValues:updated.rows,requestContext:ctx }, client);
       await client.query('COMMIT');
      return updated.rows;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  static async updateWorkflow(actor, id, data, ctx) {
    if (!data.workflowCode) throw createError(422, 'Workflow requerido');
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const workflow = await client.query('SELECT id, code FROM workflows WHERE code=$1 AND active=TRUE', [data.workflowCode]);
      if (!workflow.rows.length) throw createError(404, 'Workflow no encontrado');
      const oldActive = await client.query('SELECT * FROM branch_workflows WHERE branch_id=$1 AND active=TRUE FOR UPDATE', [id]);
      await client.query('UPDATE branch_workflows SET active=FALSE, updated_at=NOW() WHERE branch_id=$1 AND active=TRUE', [id]);
      const updated = await client.query(`
        INSERT INTO branch_workflows(branch_id, workflow_id, active, effective_from, created_by)
        VALUES($1, $2, TRUE, $3, $4)
        ON CONFLICT(branch_id, workflow_id) DO UPDATE SET active=TRUE, effective_from=EXCLUDED.effective_from, updated_at=NOW()
        RETURNING *
      `, [id, workflow.rows[0].id, data.effectiveFrom || null, actor.id]);
      await AuditService.log({
        userId: actor.id, branchId: id, role: actor.role, action: AUDIT.WORKFLOW_CHANGED,
        module: 'WORKFLOWS', entityType: 'BRANCH_WORKFLOW', entityId: updated.rows[0].id,
        description: `Workflow ${data.workflowCode} actualizado para sucursal`,
        oldValues: oldActive.rows, newValues: updated.rows[0], requestContext: ctx,
      }, client);
      await client.query('COMMIT');
      return { workflow: updated.rows[0], reviewRequired: true };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async courses(auth, id) {
    await this.getById(auth, id);
    const r = await db.query(`
      SELECT c.id, c.name, c.description, c.price, c.active global_active,
        COALESCE(bc.active, FALSE) branch_active,
        (SELECT COUNT(*) FROM students s JOIN enrollments e ON e.student_id=s.id WHERE e.branch_id=$1 AND e.course_id=c.id AND LOWER(s.status)=ANY($2::text[]))::int active_students,
        (SELECT COUNT(*) FROM enrollments e WHERE e.branch_id=$1 AND e.course_id=c.id AND LOWER(e.status)=ANY($3::text[]))::int active_enrollments,
        (SELECT COUNT(DISTINCT ip.id) FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1 WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.deleted_at IS NULL AND LOWER(ip.status)='activo' AND (ip.practice_area='mixto' OR ip.practice_area=CASE WHEN LOWER(c.name) LIKE '%moto%' THEN 'moto' ELSE 'carro' END))::int enabled_instructors,
        (SELECT COUNT(*) FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id WHERE ps.branch_id=$1 AND e.course_id=c.id AND ps.scheduled_start >= date_trunc('month', NOW()))::int classes_period
      FROM courses c
      LEFT JOIN branch_courses bc ON bc.course_id=c.id AND bc.branch_id=$1
      WHERE c.active=TRUE
      ORDER BY c.name
    `, [id, ACTIVE_STUDENT_STATUSES, ACTIVE_ENROLLMENT_STATUSES]);
    return r.rows;
  }

  static async complementaryServices(auth, id) {
    await this.getById(auth, id);
    const result = await db.query(`
      SELECT sc.id, sc.code, sc.name, sc.base_price, sc.active AS catalog_active,
        COALESCE(bs.enabled, FALSE) AS enabled,
        bs.price_override,
        COALESCE(bs.price_override, sc.base_price) AS effective_price
      FROM service_catalog sc
      LEFT JOIN branch_services bs ON bs.service_id=sc.id AND bs.branch_id=$1
      WHERE sc.code='PSICOSENSOMETRICO' AND sc.active=TRUE
      ORDER BY sc.name
    `, [id]);
    return result.rows;
  }

  static async setComplementaryService(actor, branchId, serviceId, data, ctx) {
    const enabled = data.enabled === true;
    const rawPrice = data.priceOverride;
    const priceOverride = rawPrice === '' || rawPrice === null || rawPrice === undefined
      ? null
      : Number(rawPrice);
    if (priceOverride !== null && (!Number.isFinite(priceOverride) || priceOverride < 0)) {
      throw createError(422, 'El precio del servicio no es vÃ¡lido');
    }
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const service = await client.query(
        "SELECT id,code,name,base_price FROM service_catalog WHERE id=$1 AND code='PSICOSENSOMETRICO' AND active=TRUE",
        [serviceId],
      );
      if (!service.rows.length) throw createError(404, 'Servicio complementario no encontrado');
      const branch = await client.query('SELECT id FROM branches WHERE id=$1 AND active=TRUE', [branchId]);
      if (!branch.rows.length) throw createError(404, 'Sucursal no encontrada');
      const old = await client.query(
        'SELECT * FROM branch_services WHERE branch_id=$1 AND service_id=$2 FOR UPDATE',
        [branchId, serviceId],
      );
      const saved = await client.query(`
        INSERT INTO branch_services(branch_id,service_id,enabled,price_override)
        VALUES($1,$2,$3,$4)
        ON CONFLICT(branch_id,service_id) DO UPDATE
        SET enabled=EXCLUDED.enabled,price_override=EXCLUDED.price_override,updated_at=NOW()
        RETURNING *
      `, [branchId, serviceId, enabled, priceOverride]);
      await AuditService.log({
        userId: actor.id, branchId, role: actor.role,
        action: AUDIT.SYSTEM_SETTING_CHANGED, module: 'SUCURSALES',
        entityType: 'BRANCH_SERVICE', entityId: saved.rows[0].id,
        description: `${service.rows[0].name} ${enabled ? 'habilitado' : 'deshabilitado'} en la sucursal`,
        oldValues: old.rows[0] || null, newValues: saved.rows[0], requestContext: ctx,
      }, client);
      await client.query('COMMIT');
      return saved.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async setCourse(actor, id, courseId, active, ctx) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const old = await client.query('SELECT * FROM branch_courses WHERE branch_id=$1 AND course_id=$2 FOR UPDATE', [id, courseId]);
      const r = await client.query(`
        INSERT INTO branch_courses(branch_id, course_id, active, created_by)
        VALUES($1, $2, $3, $4)
        ON CONFLICT(branch_id, course_id) DO UPDATE SET active=EXCLUDED.active, updated_at=NOW()
        RETURNING *
      `, [id, courseId, active !== false, actor.id]);
      await AuditService.log({
        userId: actor.id, branchId: id, role: actor.role,
        action: active === false ? AUDIT.BRANCH_COURSE_DISABLED : AUDIT.BRANCH_COURSE_ENABLED,
        module: 'SUCURSALES', entityType: 'BRANCH_COURSE', entityId: r.rows[0].id,
        description: active === false ? 'Curso deshabilitado en sucursal' : 'Curso habilitado en sucursal',
        oldValues: old.rows[0] || null, newValues: r.rows[0], requestContext: ctx,
      }, client);
      await client.query('COMMIT');
      return r.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async createCourse(actor, branchId, data, ctx) {
    const name = String(data.name || '').trim();
    const description = String(data.description || '').trim();
    const price = Number(data.price);
    if (!name) throw createError(422, 'El nombre del curso es obligatorio');
    if (!Number.isFinite(price) || price < 0) throw createError(422, 'El precio del curso no es válido');
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const branch = await client.query('SELECT id FROM branches WHERE id=$1 AND active=TRUE', [branchId]);
      if (!branch.rows.length) throw createError(404, 'Sucursal no encontrada');
      const duplicate = await client.query('SELECT id FROM courses WHERE LOWER(name)=LOWER($1) AND active=TRUE', [name]);
      if (duplicate.rows.length) throw createError(409, 'Ya existe un curso activo con ese nombre');
      const course = await client.query(`INSERT INTO courses(name,description,price,active)
        VALUES($1,$2,$3,TRUE) RETURNING *`, [name, description || null, price]);
      await client.query(`INSERT INTO branch_courses(branch_id,course_id,active,created_by)
        VALUES($1,$2,TRUE,$3)`, [branchId, course.rows[0].id, actor.id]);
      await AuditService.log({ userId:actor.id,branchId,role:actor.role,
        action:AUDIT.BRANCH_COURSE_ENABLED,module:'SUCURSALES',entityType:'COURSE',entityId:course.rows[0].id,
        description:`Curso ${name} creado y habilitado`,newValues:course.rows[0],requestContext:ctx }, client);
      await client.query('COMMIT');
      return course.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  static async updateCourse(actor, branchId, courseId, data, ctx) {
    const name = String(data.name || '').trim();
    const description = String(data.description || '').trim();
    const price = Number(data.price);
    if (!name) throw createError(422, 'El nombre del curso es obligatorio');
    if (!Number.isFinite(price) || price < 0) throw createError(422, 'El precio del curso no es válido');
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const current = await client.query(`SELECT c.* FROM courses c JOIN branch_courses bc ON bc.course_id=c.id
        WHERE c.id=$1 AND bc.branch_id=$2 FOR UPDATE`, [courseId, branchId]);
      if (!current.rows.length) throw createError(404, 'Curso no encontrado en esta sucursal');
      const duplicate = await client.query('SELECT id FROM courses WHERE LOWER(name)=LOWER($1) AND id<>$2 AND active=TRUE', [name, courseId]);
      if (duplicate.rows.length) throw createError(409, 'Ya existe otro curso activo con ese nombre');
      const result = await client.query(`UPDATE courses SET name=$1,description=$2,price=$3,updated_at=NOW()
        WHERE id=$4 RETURNING *`, [name, description || null, price, courseId]);
      await AuditService.log({ userId:actor.id,branchId,role:actor.role,action:AUDIT.BRANCH_UPDATED,
        module:'SUCURSALES',entityType:'COURSE',entityId:courseId,description:`Curso ${name} actualizado`,
        oldValues:current.rows[0],newValues:result.rows[0],requestContext:ctx }, client);
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }

  static async theorySchedules(auth, branchId) {
    await this.getById(auth, branchId);
    const [schedules,turns,instructors,courses,settings] = await Promise.all([
      db.query(`SELECT ts.id,ts.class_date,to_char(ts.start_time,'HH24:MI') start_time,
        to_char(ts.end_time,'HH24:MI') end_time,ts.modality,ts.notes,
        TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name,c.name course_name
        FROM theory_class_schedules ts JOIN instructor_profiles ip ON ip.id=ts.instructor_id
        JOIN users u ON u.id=ip.user_id LEFT JOIN courses c ON c.id=ts.course_id
        WHERE ts.branch_id=$1 AND ts.active=TRUE AND ts.class_date>=CURRENT_DATE
        ORDER BY ts.class_date,ts.start_time`,[branchId]),
      db.query(`SELECT ts.id,ts.instructor_id,ts.course_id,to_char(ts.start_time,'HH24:MI') start_time,
        to_char(ts.end_time,'HH24:MI') end_time,ts.modality,ts.capacity,ts.notes,
        TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name
        FROM theory_class_schedules ts JOIN instructor_profiles ip ON ip.id=ts.instructor_id
        JOIN users u ON u.id=ip.user_id
        WHERE ts.branch_id=$1 AND ts.active=TRUE
          AND (ts.recurring=TRUE OR ts.class_date>=CURRENT_DATE)
        ORDER BY ts.modality,ts.start_time`,[branchId]),
      db.query(`SELECT ip.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id JOIN branches home ON home.id=u.branch_id
        JOIN branches target ON target.id=$1 WHERE u.active=TRUE AND ip.status='activo' AND ip.deleted_at IS NULL
        AND home.city_id=target.city_id ORDER BY u.first_name,u.last_name`,[branchId]),
      db.query(`SELECT c.id,c.name FROM branch_courses bc JOIN courses c ON c.id=bc.course_id
        WHERE bc.branch_id=$1 AND bc.active=TRUE AND c.active=TRUE ORDER BY c.name`,[branchId]),
      db.query(`SELECT regular_enabled,saturday_enabled,virtual_enabled FROM branch_theory_settings WHERE branch_id=$1`,[branchId]),
    ]);
    return {schedules:schedules.rows,turns:turns.rows,instructors:instructors.rows,courses:courses.rows,
      settings:settings.rows[0]||{regular_enabled:true,saturday_enabled:true,virtual_enabled:true}};
  }

  static async saveTheorySettings(actor,branchId,data,requestContext){
    const values={regularEnabled:data.regularEnabled===true,saturdayEnabled:data.saturdayEnabled===true,virtualEnabled:data.virtualEnabled===true};
    if(!values.regularEnabled&&!values.saturdayEnabled&&!values.virtualEnabled)throw createError(422,'Habilita al menos una modalidad teórica');
    const result=await db.query(`INSERT INTO branch_theory_settings(branch_id,regular_enabled,saturday_enabled,virtual_enabled,updated_by)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(branch_id) DO UPDATE SET regular_enabled=EXCLUDED.regular_enabled,
      saturday_enabled=EXCLUDED.saturday_enabled,virtual_enabled=EXCLUDED.virtual_enabled,updated_by=EXCLUDED.updated_by,updated_at=NOW()
      RETURNING *`,[branchId,values.regularEnabled,values.saturdayEnabled,values.virtualEnabled,actor.id]);
    await AuditService.log({userId:actor.id,branchId,role:actor.role,action:AUDIT.USER_UPDATED,module:'CURSOS',entityType:'THEORY_SETTINGS',entityId:branchId,
      description:'Modalidades teóricas de la sucursal actualizadas',newValues:values,requestContext});
    return result.rows[0];
  }

  static async saveTheorySchedule(actor, branchId, data, requestContext) {
    const instructorId=String(data.instructorId||''),courseId=data.courseId?String(data.courseId):null;
    const startTime=String(data.startTime||'').slice(0,5),endTime=String(data.endTime||'').slice(0,5),capacity=Math.max(Number(data.capacity)||30,1);
    if(!instructorId||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
      ||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime) throw createError(422,'Completa el instructor y un horario válido');
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      const modality=data.modality==='presencial_sabado'?'presencial_sabado':'presencial_regular';
      const settings=await client.query('SELECT regular_enabled,saturday_enabled FROM branch_theory_settings WHERE branch_id=$1',[branchId]);
      const branchSettings=settings.rows[0]||{regular_enabled:true,saturday_enabled:true};
      if((modality==='presencial_regular'&&!branchSettings.regular_enabled)||(modality==='presencial_sabado'&&!branchSettings.saturday_enabled))throw createError(422,'Esta modalidad teórica está deshabilitada en la sucursal');
      if(modality==='presencial_regular'&&(startTime!=='18:00'||endTime!=='20:00'))throw createError(422,'La teoría regular se configura de lunes a viernes, de 18:00 a 20:00');
      const valid=await client.query(`SELECT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
        JOIN branches home ON home.id=u.branch_id JOIN branches target ON target.id=$2
        WHERE ip.id=$1 AND u.active=TRUE AND ip.status='activo' AND ip.deleted_at IS NULL AND home.city_id=target.city_id`,[instructorId,branchId]);
      if(!valid.rows.length) throw createError(422,'El instructor no pertenece al cantón de esta sucursal');
      if(courseId){const course=await client.query('SELECT 1 FROM branch_courses WHERE branch_id=$1 AND course_id=$2 AND active=TRUE',[branchId,courseId]);if(!course.rows.length)throw createError(422,'El curso no está habilitado en esta sucursal');}
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`theory-recurring:${branchId}:${modality}:${startTime}:${endTime}`]);
      const result=await client.query(`INSERT INTO theory_class_schedules(branch_id,course_id,instructor_id,class_date,start_time,end_time,modality,notes,created_by,updated_by,recurring,day_of_week,capacity)
        VALUES($1,$2,$3,NULL,$4::time,$5::time,$6,$7,$8,$8,TRUE,$9,$10) RETURNING *`,[branchId,courseId,instructorId,startTime,endTime,modality,String(data.notes||'').trim()||null,actor.id,modality==='presencial_sabado'?6:null,capacity]);
      await AuditService.log({userId:actor.id,branchId,role:actor.role,action:AUDIT.USER_UPDATED,module:'CURSOS',entityType:'THEORY_CLASS',entityId:result.rows[0].id,
        description:`Turno teórico recurrente configurado de ${startTime} a ${endTime}`,newValues:result.rows[0],requestContext},client);
      await client.query('COMMIT');return result.rows[0];
    }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw createError(409,'Ya existe un turno teórico con ese horario');throw error;}finally{client.release();}
  }

  static async updateTheorySchedule(actor, branchId, scheduleId, data, requestContext) {
    const instructorId=String(data.instructorId||''),courseId=data.courseId?String(data.courseId):null;
    const startTime=String(data.startTime||'').slice(0,5),endTime=String(data.endTime||'').slice(0,5),capacity=Math.max(Number(data.capacity)||30,1);
    const modality=data.modality==='presencial_sabado'?'presencial_sabado':'presencial_regular';
    if(!instructorId||!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime)throw createError(422,'Completa el instructor y un horario válido');
    if(modality==='presencial_regular'&&(startTime!=='18:00'||endTime!=='20:00'))throw createError(422,'La teoría regular se configura de lunes a viernes, de 18:00 a 20:00');
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      const current=await client.query('SELECT * FROM theory_class_schedules WHERE id=$1 AND branch_id=$2 AND active=TRUE FOR UPDATE',[scheduleId,branchId]);
      if(!current.rows.length)throw createError(404,'El turno teórico no existe');
      const valid=await client.query(`SELECT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches home ON home.id=u.branch_id JOIN branches target ON target.id=$2 WHERE ip.id=$1 AND u.active=TRUE AND ip.status='activo' AND ip.deleted_at IS NULL AND home.city_id=target.city_id`,[instructorId,branchId]);
      if(!valid.rows.length)throw createError(422,'El instructor no pertenece al cantón de esta sucursal');
      if(courseId){const course=await client.query('SELECT 1 FROM branch_courses WHERE branch_id=$1 AND course_id=$2 AND active=TRUE',[branchId,courseId]);if(!course.rows.length)throw createError(422,'El curso no está habilitado en esta sucursal');}
      const result=await client.query(`UPDATE theory_class_schedules SET instructor_id=$3,course_id=$4,class_date=NULL,start_time=$5::time,end_time=$6::time,modality=$7,notes=$8,capacity=$9,day_of_week=$10,recurring=TRUE,updated_by=$11,updated_at=NOW() WHERE id=$1 AND branch_id=$2 RETURNING *`,[scheduleId,branchId,instructorId,courseId,startTime,endTime,modality,String(data.notes||'').trim()||null,capacity,modality==='presencial_sabado'?6:null,actor.id]);
      await AuditService.log({userId:actor.id,branchId,role:actor.role,action:AUDIT.USER_UPDATED,module:'CURSOS',entityType:'THEORY_CLASS',entityId:scheduleId,description:'Turno teórico actualizado',oldValues:current.rows[0],newValues:result.rows[0],requestContext},client);
      await client.query('COMMIT');return result.rows[0];
    }catch(error){await client.query('ROLLBACK');if(error.code==='23505')throw createError(409,'Ya existe otro turno teórico con ese horario');throw error;}finally{client.release();}
  }

  static async deleteTheorySchedule(actor, branchId, scheduleId, requestContext) {
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      const current=await client.query('SELECT * FROM theory_class_schedules WHERE id=$1 AND branch_id=$2 AND active=TRUE FOR UPDATE',[scheduleId,branchId]);
      if(!current.rows.length)throw createError(404,'El turno teórico no existe o ya fue eliminado');
      const result=await client.query(`UPDATE theory_class_schedules SET active=FALSE,updated_by=$3,updated_at=NOW() WHERE id=$1 AND branch_id=$2 RETURNING *`,[scheduleId,branchId,actor.id]);
      await AuditService.log({userId:actor.id,branchId,role:actor.role,action:AUDIT.USER_UPDATED,module:'CURSOS',entityType:'THEORY_CLASS',entityId:scheduleId,description:'Turno teórico eliminado',oldValues:current.rows[0],newValues:result.rows[0],requestContext},client);
      await client.query('COMMIT');return result.rows[0];
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }

  static async courseProgram(auth, branchId, courseId) {
    await this.getById(auth, branchId);
    const program = await db.query(`SELECT bcp.*,c.name course_name FROM branch_course_programs bcp
      JOIN courses c ON c.id=bcp.course_id WHERE bcp.branch_id=$1 AND bcp.course_id=$2`, [branchId, courseId]);
    const weekendProgram=program.rows.length
      ? await resolveWeekendProgram(db,branchId,courseId,program.rows[0].id)
      : {branch_id:branchId,program_id:null,branch_name:null};
    const templates = program.rows.length ? await db.query(`SELECT * FROM branch_course_schedule_templates
      WHERE program_id=$1 AND active=TRUE ORDER BY modality,day_of_week,start_time`, [program.rows[0].id]) : { rows:[] };
    const resources = await db.query(`SELECT
      (SELECT COUNT(DISTINCT ip.id) FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
       JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1
       WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.status='activo' AND (ip.practice_area='mixto' OR ip.practice_area=$2))::int instructors,
      (SELECT COUNT(*) FROM vehicles v WHERE v.branch_id=$1 AND v.active=TRUE AND UPPER(v.status)='DISPONIBLE'
       AND ($2::text IS NULL OR ($2='carro' AND LOWER(v.vehicle_type) SIMILAR TO '%(auto|carro)%') OR ($2='moto' AND LOWER(v.vehicle_type) LIKE '%moto%') OR LOWER(v.vehicle_type)=LOWER($2)))::int vehicles`, [branchId, program.rows[0]?.vehicle_type || null]);
    const instructors = await db.query(`SELECT ip.id,u.first_name || ' ' || u.last_name name,ip.practice_area,
      COALESCE(ip.weekend_practice_area,ip.practice_area) weekend_practice_area,
      COALESCE(icc.active,FALSE) course_enabled,
      CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$1 ELSE u.branch_id=$1 END priority_branch,
      CASE WHEN priority_rule.branch_id=$1 THEN 'priority' WHEN priority_rule.branch_id IS NOT NULL THEN 'reserved_elsewhere' ELSE 'standard' END branch_assignment,
      ib.name home_branch FROM instructor_profiles ip
      JOIN users u ON u.id=ip.user_id
      JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1
      LEFT JOIN LATERAL (SELECT rule.branch_id FROM instructor_branch_priorities rule
        WHERE rule.instructor_id=ip.id AND rule.assignment_type='priority' AND rule.active=TRUE
          AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
        ORDER BY (rule.branch_id=$1) DESC,rule.updated_at DESC LIMIT 1) priority_rule ON TRUE
      LEFT JOIN instructor_course_capabilities icc ON icc.instructor_id=ip.id AND icc.course_id=$2
      WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.status='activo'
      ORDER BY (CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$1 ELSE u.branch_id=$1 END) DESC,name`, [branchId,courseId]);
    const groups = program.rows.length ? await db.query(`SELECT ig.id,ig.code,ig.name,ig.course_vehicle_type,ig.next_start_date,
      COALESCE(json_agg(json_build_object('id',ip.id,'name',u.first_name || ' ' || u.last_name)
        ORDER BY igm.position_order,u.first_name,u.last_name) FILTER (WHERE ip.id IS NOT NULL),'[]') members,
      MAX(cc.end_date) FILTER (WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.end_date>=CURRENT_DATE AND cc.status IN ('proximo','activo','por_terminar')) busy_until
      FROM instructor_groups ig
      LEFT JOIN instructor_group_members igm ON igm.group_id=ig.id AND igm.active=TRUE AND igm.ended_at IS NULL
      LEFT JOIN instructor_profiles ip ON ip.id=igm.instructor_id
      LEFT JOIN users u ON u.id=ip.user_id
      LEFT JOIN course_cycles cc ON cc.group_id=ig.id AND EXISTS (
        SELECT 1 FROM course_cycle_schedule_assignments ccsa
        JOIN enrollments e ON e.id=ccsa.enrollment_id
        WHERE ccsa.cycle_id=cc.id AND LOWER(ccsa.status)='activo'
          AND LOWER(e.status) NOT IN ('cancelado','completado'))
      WHERE ig.program_id=$1 AND ig.active=TRUE AND ig.deleted_at IS NULL
      GROUP BY ig.id ORDER BY ig.code`,[program.rows[0].id]) : { rows:[] };
    const rotation = weekendProgram.program_id ? await db.query(`SELECT rotation.instructor_id,rotation.position_order,rotation.observation,
      TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name
      FROM branch_course_intensive_rotation rotation JOIN instructor_profiles ip ON ip.id=rotation.instructor_id
      JOIN users u ON u.id=ip.user_id WHERE rotation.program_id=$1 AND rotation.active=TRUE
      ORDER BY rotation.position_order`, [weekendProgram.program_id]) : { rows:[] };
    const weekendOverrides = weekendProgram.program_id ? await db.query(`SELECT override.id,override.start_date,
      override.instructor_count,override.reason,
      COALESCE(json_agg(json_build_object('id',ip.id,'name',TRIM(CONCAT(u.first_name,' ',u.last_name)),
        'positionOrder',selected.position_order) ORDER BY selected.position_order)
        FILTER (WHERE ip.id IS NOT NULL),'[]') instructors
      FROM branch_course_weekend_overrides override
      LEFT JOIN branch_course_weekend_override_instructors selected ON selected.override_id=override.id
      LEFT JOIN instructor_profiles ip ON ip.id=selected.instructor_id
      LEFT JOIN users u ON u.id=ip.user_id
      WHERE override.program_id=$1 AND override.active=TRUE AND override.start_date>=CURRENT_DATE
      GROUP BY override.id ORDER BY override.start_date`, [weekendProgram.program_id]) : { rows:[] };
    return { program:program.rows[0]||null,templates:templates.rows,resources:resources.rows[0],instructors:instructors.rows,groups:groups.rows,rotation:rotation.rows,weekendOverrides:weekendOverrides.rows,
      intensiveSource:{branchId:weekendProgram.branch_id,branchName:weekendProgram.branch_name,anchorDate:weekendProgram.anchor_date,
        shared:String(weekendProgram.branch_id)!==String(branchId)} };
  }

  static async saveCourseProgram(actor, branchId, courseId, data, requestContext = null) {
    const normalDuration=Number(data.normalDurationDays),intensiveDuration=Number(data.intensiveDurationDays),minutes=Number(data.sessionMinutes),capacity=Number(data.capacityPerInstructor||1);
    if(!normalDuration||!intensiveDuration||!minutes||!capacity) throw createError(422,'Duraciones, minutos y capacidad son obligatorios');
    const slots=Array.isArray(data.slots)?data.slots:[];
    const assignmentMode=data.assignmentMode==='groups'?'groups':'individual';
    // La generación automática también es válida cuando los instructores se
    // asignan individualmente. Antes se ignoraba silenciosamente el checkbox
    // y siempre se guardaba en FALSE para esta modalidad.
    const automaticCycles=data.automaticCycles===true;
    const normalizeDays=(values,fallback)=>{const days=[...new Set((Array.isArray(values)?values:fallback).map(Number))].filter(day=>day>=0&&day<=6);return days.length?days:fallback;};
    const normalStartDays=normalizeDays(data.normalStartDays,[1,2,3,4,5]);
    const intensiveStartDays=normalizeDays(data.intensiveStartDays,[6]);
    const groups=assignmentMode==='groups'&&Array.isArray(data.groups)?data.groups:[];
    const rotation=Array.isArray(data.intensiveRotation)?data.intensiveRotation:[];
    const weekendOverrides=Array.isArray(data.weekendOverrides)?data.weekendOverrides:[];
    if(assignmentMode==='groups'&&!groups.length) throw createError(422,'Configura al menos un grupo de instructores');
    if(!slots.length) throw createError(422,'Agrega al menos un bloque horario');
    const client=await db.getClient();try{await client.query('BEGIN');
      if(data.weekendOverrides!==undefined){
        const systemActor=await client.query(`SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id
          WHERE ur.user_id=$1 AND ur.active=TRUE AND r.code='ADMIN_SYSTEM'
            AND (ur.valid_from IS NULL OR ur.valid_from<=NOW())
            AND (ur.valid_until IS NULL OR ur.valid_until>NOW()) LIMIT 1`,[actor.id]);
        if(!systemActor.rows.length) throw createError(403,'Solo el Administrador del Sistema puede configurar la capacidad especial de fin de semana');
      }
       const p=await client.query(`INSERT INTO branch_course_programs(branch_id,course_id,vehicle_type,duration_days,normal_duration_days,intensive_duration_days,session_minutes,capacity_per_instructor,normal_enabled,intensive_enabled,assignment_mode,automatic_cycles,normal_start_days,intensive_start_days,updated_by)
        VALUES($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12::int[],$13::int[],$14) ON CONFLICT(branch_id,course_id) DO UPDATE SET vehicle_type=EXCLUDED.vehicle_type,duration_days=EXCLUDED.duration_days,normal_duration_days=EXCLUDED.normal_duration_days,intensive_duration_days=EXCLUDED.intensive_duration_days,session_minutes=EXCLUDED.session_minutes,capacity_per_instructor=EXCLUDED.capacity_per_instructor,normal_enabled=EXCLUDED.normal_enabled,intensive_enabled=EXCLUDED.intensive_enabled,assignment_mode=EXCLUDED.assignment_mode,automatic_cycles=EXCLUDED.automatic_cycles,normal_start_days=EXCLUDED.normal_start_days,intensive_start_days=EXCLUDED.intensive_start_days,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,[branchId,courseId,data.vehicleType||'carro',normalDuration,intensiveDuration,minutes,capacity,data.normalEnabled!==false,data.intensiveEnabled===true,assignmentMode,automaticCycles,normalStartDays,intensiveStartDays,actor.id]);
       const weekendProgram=await resolveWeekendProgram(client,branchId,courseId,p.rows[0].id);
       const weekendProgramId=weekendProgram.program_id,weekendBranchId=weekendProgram.branch_id;
       await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`intensive-rotation:${weekendBranchId}:${data.vehicleType||'carro'}`]);
      await client.query('DELETE FROM branch_course_schedule_templates WHERE program_id=$1',[p.rows[0].id]);
      const anchorDate=/^\d{4}-\d{2}-\d{2}$/.test(String(data.intensiveRotationAnchorDate||''))?data.intensiveRotationAnchorDate:null;
       await client.query('UPDATE branch_course_programs SET intensive_rotation_anchor_date=$2 WHERE id=$1',[weekendProgramId,anchorDate]);
      for(const slot of slots) await client.query(`INSERT INTO branch_course_schedule_templates(program_id,modality,day_of_week,start_time,end_time) VALUES($1,$2,$3,$4,$5)`,[p.rows[0].id,slot.modality,Number(slot.dayOfWeek),slot.startTime,slot.endTime]);
       await client.query('DELETE FROM branch_course_intensive_rotation WHERE program_id=$1',[weekendProgramId]);
       if(data.intensiveEnabled===true&&rotation.length){
        const instructorIds=rotation.map(item=>item.instructorId);
        if(new Set(instructorIds).size!==instructorIds.length) throw createError(422,'La rotación de fin de semana contiene instructores repetidos');
        const validRotation=await client.query(`SELECT DISTINCT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
          JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1
          WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.status='activo' AND ip.id=ANY($2::uuid[])
            AND (COALESCE(ip.weekend_practice_area,ip.practice_area)='mixto' OR COALESCE(ip.weekend_practice_area,ip.practice_area)=$3)`,
         [weekendBranchId,instructorIds,data.vehicleType||'carro']);
        if(validRotation.rows.length!==instructorIds.length) throw createError(422,'La rotación contiene instructores que no están habilitados para este curso');
        for(let index=0;index<rotation.length;index++) await client.query(`INSERT INTO branch_course_intensive_rotation
          (program_id,instructor_id,position_order,observation,updated_by) VALUES($1,$2,$3,$4,$5)`,
         [weekendProgramId,rotation[index].instructorId,index+1,String(rotation[index].observation||'').trim().slice(0,300)||null,actor.id]);
       }
       if(weekendOverrides.length){
         const seenDates=new Set();
         for(const item of weekendOverrides){
           const startDate=String(item.startDate||'');
           const instructorIds=Array.isArray(item.instructorIds)?item.instructorIds.filter(Boolean):[];
           const count=Number(item.instructorCount);
           const reason=String(item.reason||'').trim().slice(0,300);
           if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||new Date(`${startDate}T12:00:00`).getDay()!==6) throw createError(422,'Cada excepción debe iniciar un sábado válido');
           if(seenDates.has(startDate)) throw createError(422,`La fecha ${startDate} está repetida`);
           seenDates.add(startDate);
           if(![1,2,3].includes(count)||instructorIds.length!==count||new Set(instructorIds).size!==count) throw createError(422,`Selecciona ${count} instructor(es) diferente(s) para ${startDate}`);
           if(!reason) throw createError(422,`Registra el motivo de la capacidad especial del ${startDate}`);
           const valid=await client.query(`SELECT DISTINCT ip.id FROM instructor_profiles ip
             JOIN users u ON u.id=ip.user_id AND u.active=TRUE
             JOIN branches home ON home.id=u.branch_id JOIN branches target ON target.id=$1 AND target.city_id=home.city_id
             LEFT JOIN instructor_course_capabilities capability ON capability.instructor_id=ip.id AND capability.course_id=$2 AND capability.active=TRUE
             LEFT JOIN LATERAL (SELECT priority.practice_area FROM instructor_branch_priorities priority
               WHERE priority.instructor_id=ip.id AND priority.branch_id=$1 AND priority.active=TRUE
                 AND priority.effective_from<=$3::date AND (priority.effective_until IS NULL OR priority.effective_until>=$3::date) LIMIT 1) scoped ON TRUE
             WHERE ip.id=ANY($4::uuid[]) AND ip.status='activo' AND ip.deleted_at IS NULL
                AND (
                  (COALESCE(ip.weekend_practice_area,scoped.practice_area,ip.practice_area)=$5 AND capability.instructor_id IS NOT NULL)
                  OR ($5='moto' AND COALESCE(ip.weekend_practice_area,scoped.practice_area,ip.practice_area)='carro')
                )`,[weekendBranchId,courseId,startDate,instructorIds,data.vehicleType||'carro']);
           if(valid.rows.length!==count) throw createError(422,`Uno de los instructores no está habilitado para el curso del ${startDate}`);
           const offsets=(data.vehicleType||'carro')==='moto'?[0,1,7]:[0,1,7,8];
           const courseDates=offsets.map(offset=>{const date=new Date(`${startDate}T12:00:00`);date.setDate(date.getDate()+offset);return date.toISOString().slice(0,10);});
           const availabilityConflicts=await client.query(`SELECT DISTINCT availability.instructor_id,availability.schedule_date
             FROM instructor_availability_overrides availability WHERE availability.instructor_id=ANY($1::uuid[])
               AND availability.schedule_date=ANY($2::date[]) AND availability.active=TRUE
               AND EXISTS (SELECT 1 FROM branch_course_schedule_templates template
                 WHERE template.program_id=$3 AND template.modality='intensivo' AND template.active=TRUE
                   AND template.day_of_week=EXTRACT(DOW FROM availability.schedule_date)::int
                   AND availability.start_time<template.end_time AND availability.end_time>template.start_time)`,[instructorIds,courseDates,weekendProgramId]);
           if(availabilityConflicts.rowCount) throw createError(409,`Un instructor tiene un bloqueo de disponibilidad en el curso que inicia el ${startDate}`);
           const assignmentConflicts=await client.query(`SELECT DISTINCT assignment.instructor_id,assignment.cycle_id,
               cycle.code,cycle.modality,cycle.vehicle_type,cycle.start_date::text,cycle.end_date::text,
               concat_ws(' ',user_data.first_name,user_data.last_name) instructor_name
             FROM course_cycle_schedule_assignments assignment JOIN course_cycles cycle ON cycle.id=assignment.cycle_id
             JOIN instructor_profiles profile ON profile.id=assignment.instructor_id JOIN users user_data ON user_data.id=profile.user_id
             WHERE assignment.instructor_id=ANY($1::uuid[]) AND assignment.schedule_date=ANY($2::date[]) AND assignment.status='activo'
               AND EXISTS (SELECT 1 FROM branch_course_schedule_templates template
                 WHERE template.program_id=$3 AND template.modality='intensivo' AND template.active=TRUE
                   AND template.day_of_week=EXTRACT(DOW FROM assignment.schedule_date)::int
                   AND assignment.start_time<template.end_time AND assignment.end_time>template.start_time)
               AND NOT EXISTS (SELECT 1 FROM intensive_instructor_rotation_assignments own_rotation
                 WHERE own_rotation.cycle_id=assignment.cycle_id AND own_rotation.branch_id=$4
                   AND own_rotation.vehicle_type=$5 AND own_rotation.start_date=$6::date AND own_rotation.active=TRUE)`,
             [instructorIds,courseDates,weekendProgramId,weekendBranchId,data.vehicleType||'carro',startDate]);
           const movable=assignmentConflicts.rows.filter(row=>row.modality==='intensivo'&&row.vehicle_type===(data.vehicleType||'carro'));
           if(movable.length!==assignmentConflicts.rows.length) throw createError(409,`Hay instructores ocupados por otro tipo de curso en los horarios del ${startDate}`);
           if(movable.length&&!data.confirmWeekendReassignment){
             const descriptions=movable.map(row=>`${row.instructor_name} está programado para iniciar el ${String(row.start_date).slice(0,10)}`);
             throw weekendConfirmationError(`${descriptions.join('. ')}. ¿Seguro que deseas reagendarlo para el ${startDate}?`,{type:'move_cycles',startDate,conflicts:movable});
           }
           for(const row of movable){
             const positionOrder=instructorIds.findIndex(id=>String(id)===String(row.instructor_id))+1;
             await moveIntensiveCycle(client,{cycleId:row.cycle_id,branchId:weekendBranchId,vehicleType:data.vehicleType||'carro',startDate,positionOrder,actorId:actor.id});
           }
           const published=await client.query(`SELECT rotation.id,rotation.position_order,rotation.instructor_id,rotation.cycle_id,
             (SELECT COUNT(DISTINCT assignment.enrollment_id)::int FROM course_cycle_schedule_assignments assignment
               WHERE assignment.cycle_id=rotation.cycle_id AND assignment.status='activo') students,
             (SELECT COUNT(*)::int FROM course_cycle_seat_reservations reservation
               WHERE reservation.cycle_id=rotation.cycle_id AND reservation.status='activo') reservations
             FROM intensive_instructor_rotation_assignments rotation
             WHERE rotation.branch_id=$1 AND rotation.vehicle_type=$2 AND rotation.start_date=$3::date
                AND rotation.active=TRUE AND rotation.cycle_id IS NOT NULL`,[weekendBranchId,data.vehicleType||'carro',startDate]);
           const protectedReplacements=published.rows.filter(row=>{
             const replacementId=instructorIds[Number(row.position_order)-1];
             return String(replacementId)!==String(row.instructor_id)&&(Number(row.students)>0||Number(row.reservations)>0);
           });
           if(protectedReplacements.length&&!data.confirmWeekendReassignment){
             throw weekendConfirmationError(`El curso del ${startDate} ya tiene estudiantes. ¿Seguro que deseas cambiar sus instructores y trasladar también sus asignaciones?`,{type:'replace_instructors',startDate,replacements:protectedReplacements});
           }
           for(const row of published.rows){
             const position=Number(row.position_order),replacementId=instructorIds[position-1];
             if(position>count){
               if(Number(row.students)>0||Number(row.reservations)>0) throw createError(409,`El curso del ${startDate} tiene estudiantes o reservas; no se puede retirar su instructor desde esta configuración`);
               continue;
             }
             if(String(replacementId)===String(row.instructor_id)) continue;
             await replacePublishedCycleInstructor(client,{cycleId:row.cycle_id,oldInstructorId:row.instructor_id,newInstructorId:replacementId,actorId:actor.id,startDate});
           }
           const saved=await client.query(`INSERT INTO branch_course_weekend_overrides(program_id,start_date,instructor_count,reason,created_by,updated_by)
             VALUES($1,$2,$3,$4,$5,$5) ON CONFLICT(program_id,start_date) DO UPDATE SET instructor_count=EXCLUDED.instructor_count,
              reason=EXCLUDED.reason,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING id`,[weekendProgramId,startDate,count,reason,actor.id]);
           await client.query('DELETE FROM branch_course_weekend_override_instructors WHERE override_id=$1',[saved.rows[0].id]);
           for(let index=0;index<instructorIds.length;index++) await client.query(`INSERT INTO branch_course_weekend_override_instructors(override_id,instructor_id,position_order) VALUES($1,$2,$3)`,[saved.rows[0].id,instructorIds[index],index+1]);
         }
         await client.query(`UPDATE branch_course_weekend_overrides SET active=FALSE,updated_by=$2,updated_at=NOW()
            WHERE program_id=$1 AND start_date>=CURRENT_DATE AND NOT(start_date=ANY($3::date[]))`,[weekendProgramId,actor.id,[...seenDates]]);
       } else if(data.weekendOverrides!==undefined) {
         await client.query(`UPDATE branch_course_weekend_overrides SET active=FALSE,updated_by=$2,updated_at=NOW()
            WHERE program_id=$1 AND start_date>=CURRENT_DATE`,[weekendProgramId,actor.id]);
       }
       if(data.weekendOverrides!==undefined) await WeekendDistributionCleanup.reconcile(client,{
         programId:weekendProgramId,branchId:weekendBranchId,courseId,vehicleType:data.vehicleType||'carro',actor,requestContext});
      const previousGroups=assignmentMode==='groups'?await client.query(`SELECT code,next_start_date FROM instructor_groups WHERE program_id=$1 FOR UPDATE`,[p.rows[0].id]):{rows:[]};
      const previousStarts=new Map(previousGroups.rows.map(group=>[group.code,group.next_start_date]));
      const sequenceAnchor=assignmentMode==='groups'?await client.query(`SELECT COALESCE(MAX(cc.end_date),CURRENT_DATE) anchor_date
        FROM course_cycles cc WHERE cc.branch_id=$1 AND cc.course_id=$2 AND cc.modality='normal'
          AND cc.active=TRUE AND cc.deleted_at IS NULL`,[branchId,courseId]):{rows:[{anchor_date:null}]};
      if(assignmentMode==='groups') await client.query(`UPDATE instructor_groups SET active=FALSE,deleted_at=NOW(),updated_at=NOW() WHERE program_id=$1`,[p.rows[0].id]);
      const usedMembers=new Set();
      for(let index=0;index<groups.length;index++){
        const group=groups[index],memberIds=[...new Set(Array.isArray(group.memberIds)?group.memberIds:[])];
        if(!memberIds.length) throw createError(422,`El grupo ${index+1} no tiene instructores`);
        if(memberIds.some(id=>usedMembers.has(id))) throw createError(422,'Un instructor no puede pertenecer a dos grupos del mismo programa');
        const valid=await client.query(`SELECT DISTINCT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
          JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1
          WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.status='activo' AND ip.id=ANY($2::uuid[])
          AND (ip.practice_area='mixto' OR ip.practice_area=$3)`,[branchId,memberIds,data.vehicleType||'carro']);
        if(valid.rows.length!==memberIds.length) throw createError(422,`El grupo ${index+1} contiene instructores no compatibles`);
        for(const id of memberIds) await client.query(`INSERT INTO instructor_course_capabilities(instructor_id,course_id,active)
          VALUES($1,$2,TRUE) ON CONFLICT(instructor_id,course_id) DO UPDATE SET active=TRUE`,[id,courseId]);
        memberIds.forEach(id=>usedMembers.add(id));
        const code=`${String(data.vehicleType||'carro').toUpperCase()}-G${index+1}`;
        const nextStartDate=previousStarts.get(code)||nextAllowedCourseDate(sequenceAnchor.rows[0]?.anchor_date,new Set(normalStartDays),index+1);
        const saved=await client.query(`INSERT INTO instructor_groups(branch_id,program_id,code,name,course_vehicle_type,max_instructors,next_start_date,active,deleted_at) VALUES($1,$2,$3,$4,$5,$6,$7,TRUE,NULL) ON CONFLICT(branch_id,code) DO UPDATE SET program_id=EXCLUDED.program_id,name=EXCLUDED.name,course_vehicle_type=EXCLUDED.course_vehicle_type,max_instructors=EXCLUDED.max_instructors,next_start_date=COALESCE(instructor_groups.next_start_date,EXCLUDED.next_start_date),active=TRUE,deleted_at=NULL,updated_at=NOW() RETURNING id`,[branchId,p.rows[0].id,code,String(group.name||`Grupo ${index+1}`).trim(),data.vehicleType||'carro',memberIds.length,nextStartDate]);
        await client.query(`UPDATE instructor_group_members SET active=FALSE,ended_at=CURRENT_DATE,updated_at=NOW() WHERE group_id=$1`,[saved.rows[0].id]);
         for(let position=0;position<memberIds.length;position++) await client.query(`INSERT INTO instructor_group_members(group_id,instructor_id,position_order,active,joined_at,ended_at) VALUES($1,$2,$3,TRUE,CURRENT_DATE,NULL) ON CONFLICT(group_id,instructor_id) DO UPDATE SET position_order=EXCLUDED.position_order,active=TRUE,ended_at=NULL,updated_at=NOW()`,[saved.rows[0].id,memberIds[position],position]);
       }
       await AuditService.log({userId:actor.id,branchId,role:actor.role,action:AUDIT.USER_UPDATED,module:'CURSOS',
         entityType:'COURSE_PROGRAM',entityId:p.rows[0].id,description:'Configuracion academica y capacidad de fin de semana actualizadas',
         newValues:{courseId,vehicleType:data.vehicleType||'carro',weekendOverrides},requestContext},client);
       await client.query('COMMIT');
      if(automaticCycles) {
        try { await AutomaticCycleService.ensureForProgram(p.rows[0].id,actor.id); }
        catch(error) { console.warn('No se pudo generar el ciclo automático:',error.message); }
      }
      return p.rows[0];
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  static async programCourseCycle(actor, branchId, courseId, data) {
    const config=await db.query('SELECT * FROM branch_course_programs WHERE branch_id=$1 AND course_id=$2',[branchId,courseId]);
    if(!config.rows.length) throw createError(422,'Configura primero el programa del curso');
    const p=config.rows[0],modality=data.modality||'normal',start=new Date(`${data.startDate}T00:00:00`),duration=Number(modality==='intensivo'?p.intensive_duration_days:p.normal_duration_days);
    if(Number.isNaN(start.getTime())) throw createError(422,'Fecha de inicio inválida');
    if ((modality==='normal' && !p.normal_enabled) || (modality==='intensivo' && !p.intensive_enabled)) throw createError(422,'La modalidad seleccionada no está habilitada');
    const templateDays=await db.query(`SELECT DISTINCT t.day_of_week FROM branch_course_schedule_templates t
      WHERE t.program_id=$1 AND t.modality=$2 AND t.active=TRUE ORDER BY t.day_of_week`,[p.id,modality]);
    if(!templateDays.rows.length) throw createError(422,'La modalidad no tiene horarios configurados');
    const allowedDays=new Set(templateDays.rows.map(row=>Number(row.day_of_week)));
    const configuredStartDays=new Set((modality==='intensivo'?p.intensive_start_days:p.normal_start_days).map(Number));
    if(!configuredStartDays.has(start.getDay())) throw createError(422,'La fecha de inicio no coincide con los días permitidos para iniciar');
    const end=new Date(start);let remaining=duration-1;
    while(remaining>0){end.setDate(end.getDate()+1);if(allowedDays.has(end.getDay()))remaining--;}
    let groupId=null;
    let instructorIds=Array.isArray(data.instructorIds)?data.instructorIds:[];
    if(p.assignment_mode==='groups'){
      groupId=data.groupId||null;
      const selectedGroup=await db.query(`SELECT ig.id,array_agg(igm.instructor_id) instructor_ids FROM instructor_groups ig JOIN instructor_group_members igm ON igm.group_id=ig.id AND igm.active=TRUE AND igm.ended_at IS NULL WHERE ig.id=$1 AND ig.program_id=$2 AND ig.active=TRUE AND ig.deleted_at IS NULL GROUP BY ig.id`,[groupId,p.id]);
      if(!selectedGroup.rows.length) throw createError(422,'Selecciona un grupo de instructores válido');
      instructorIds=selectedGroup.rows[0].instructor_ids;
    }
    if(!instructorIds.length) throw createError(422,'Selecciona al menos un instructor');
    const validInstructors=await db.query(`SELECT DISTINCT ip.id FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
      JOIN branches ib ON ib.id=u.branch_id JOIN branches target ON target.id=$1
      JOIN instructor_course_capabilities icc ON icc.instructor_id=ip.id AND icc.course_id=$2 AND icc.active=TRUE
      WHERE ib.city_id=target.city_id AND u.active=TRUE AND ip.status='activo' AND ip.id=ANY($3::uuid[])`,[branchId,courseId,instructorIds]);
    if(validInstructors.rows.length!==new Set(instructorIds).size) throw createError(422,'Uno o más instructores no están habilitados para este curso');
    const conflicts=await db.query(`SELECT DISTINCT u.first_name || ' ' || u.last_name name FROM course_cycle_instructors cci
      JOIN course_cycles cc ON cc.id=cci.cycle_id JOIN instructor_profiles ip ON ip.id=cci.instructor_id JOIN users u ON u.id=ip.user_id
      WHERE cci.active=TRUE AND cc.active=TRUE AND cc.deleted_at IS NULL AND cc.status IN ('proximo','activo','por_terminar')
        AND cci.instructor_id=ANY($1::uuid[]) AND daterange(cc.start_date,cc.end_date,'[]') && daterange($2::date,$3::date,'[]')`,[instructorIds,data.startDate,end.toISOString().slice(0,10)]);
    if(conflicts.rows.length) throw createError(409,`Instructor(es) ocupados en esas fechas: ${conflicts.rows.map(row=>row.name).join(', ')}`);
    const vehicleCount=await db.query(`SELECT COUNT(*)::int count FROM vehicles WHERE branch_id=$1 AND active=TRUE AND UPPER(status)='DISPONIBLE' AND (($2='carro' AND LOWER(vehicle_type) SIMILAR TO '%(auto|carro)%') OR ($2='moto' AND LOWER(vehicle_type) LIKE '%moto%') OR LOWER(vehicle_type)=LOWER($2))`,[branchId,p.vehicle_type]);
    const committed=await db.query(`SELECT COALESCE(SUM(published_capacity),0)::int count FROM course_cycles
      WHERE branch_id=$1 AND vehicle_type=$2 AND active=TRUE AND deleted_at IS NULL AND status IN ('proximo','activo','por_terminar')
      AND daterange(start_date,end_date,'[]') && daterange($3::date,$4::date,'[]')`,[branchId,p.vehicle_type,data.startDate,end.toISOString().slice(0,10)]);
    const availableVehicles=Math.max(Number(vehicleCount.rows[0].count)-Number(committed.rows[0].count),0);
    const capacity=Math.min(instructorIds.length*Number(p.capacity_per_instructor),availableVehicles);
    if(capacity<1) throw createError(422,'No existen vehículos disponibles compatibles');
    const client=await db.getClient();try{await client.query('BEGIN');const code=`${String(p.vehicle_type).toUpperCase()}-${modality==='intensivo'?'INT-':''}${data.startDate}`;
      const cycle=await client.query(`INSERT INTO course_cycles(branch_id,course_id,group_id,code,modality,vehicle_type,start_date,end_date,duration_business_days,capacity_per_instructor,published_capacity,status,notes,active,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'proximo',$12,TRUE,$13) RETURNING *`,[branchId,courseId,groupId,code,modality,p.vehicle_type,data.startDate,end.toISOString().slice(0,10),duration,p.capacity_per_instructor,capacity,`Capacidad publicada: ${capacity} cupos`,actor.id]);
      for(const id of instructorIds) await client.query(`INSERT INTO course_cycle_instructors(cycle_id,instructor_id,active) VALUES($1,$2,TRUE) ON CONFLICT(cycle_id,instructor_id) DO UPDATE SET active=TRUE`,[cycle.rows[0].id,id]);
      await client.query('COMMIT');return {...cycle.rows[0],calculated_capacity:capacity,vehicle_count:Number(vehicleCount.rows[0].count),available_vehicle_count:availableVehicles,instructor_count:instructorIds.length};
    }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
  }

  static async settings(auth, id) {
    await this.getById(auth, id);
    const r = await db.query(`SELECT * FROM settings WHERE scope_type='BRANCH' AND branch_id=$1 ORDER BY key`, [id]);
    return r.rows;
  }

  static async activity(auth, id, filters = {}) {
    await this.getById(auth, id);
    const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
    const r = await db.query(`
      SELECT al.created_at, al.action, al.module, al.description, al.entity_type,
        u.username, NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), '') user_name, al.role
      FROM audit_logs al
      LEFT JOIN users u ON u.id=al.user_id
      WHERE al.branch_id=$1
      ORDER BY al.created_at DESC
      LIMIT $2
    `, [id, limit]);
    return r.rows;
  }

  static async incidents(auth, id) {
    await this.getById(auth, id);
    const result = await db.query(`
      SELECT i.*, CONCAT_WS(' ',u.first_name,u.last_name) AS reporter_name,
        CONCAT_WS(' ',s.first_name,s.last_name) AS student_name, c.name AS course_name,
        v.code AS vehicle_code, v.plate, CONCAT_WS(' ',reviewer.first_name,reviewer.last_name) AS reviewer_name
      FROM incidents i
      LEFT JOIN users u ON u.id=i.reported_by
      LEFT JOIN users reviewer ON reviewer.id=i.reviewed_by
      LEFT JOIN enrollments e ON e.id=i.enrollment_id
      LEFT JOIN students s ON s.id=e.student_id
      LEFT JOIN courses c ON c.id=e.course_id
      LEFT JOIN vehicles v ON v.id=i.vehicle_id
      WHERE i.branch_id=$1
      ORDER BY i.reported_at DESC, i.id
    `, [id]);
    return result.rows;
  }

  static async reviewIncident(auth, branchId, incidentId, actor, requestContext) {
    await this.getById(auth, branchId);
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query('SELECT * FROM incidents WHERE id=$1 AND branch_id=$2 FOR UPDATE', [incidentId, branchId]);
      if (!result.rows.length) throw createError(404, 'Incidencia no encontrada en esta sucursal');
      const incident = result.rows[0];
      if (incident.status !== 'REVISADA') {
        await client.query("UPDATE incidents SET status='REVISADA',reviewed_by=$3,reviewed_at=NOW(),updated_at=NOW() WHERE id=$1 AND branch_id=$2", [incidentId, branchId, actor.id]);
        await AuditService.log({
          userId: actor.id, branchId, action: 'INCIDENT_REVIEW', module: 'ACADEMICO',
          entityType: 'incidents', entityId: incidentId,
          description: 'Incidencia marcada como revisada',
          oldValues: { status: incident.status }, newValues: { status: 'REVISADA' }, requestContext,
        }, client);
      }
      const reviewed = await client.query('SELECT id,status,reviewed_at,reviewed_by FROM incidents WHERE id=$1 AND branch_id=$2', [incidentId, branchId]);
      await client.query('COMMIT');
      return reviewed.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async create(actor, data, ctx) {
    if (!data.code || !data.name || !data.province || !data.city) throw createError(422, 'Código, nombre, provincia y ciudad son requeridos');
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const duplicate = await client.query('SELECT id FROM branches WHERE LOWER(code)=LOWER($1)', [data.code]);
      if (duplicate.rows.length) throw createError(409, 'Ya existe una sucursal con ese código');
      const cityId = await this.resolveCityId(client, data);
      const r = await client.query(`
        INSERT INTO branches(code, name, province, city, address, phone, email, active, city_id, opening_date, latitude, longitude, location_source)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        RETURNING *
      `, [
        data.code, data.name, data.province, data.city, data.address || null, data.phone || null, data.email || null,
        data.active !== false, cityId, data.openingDate || null,
        nullableNumber(data.latitude), nullableNumber(data.longitude), data.locationSource || null,
      ]);
      await client.query(`
        INSERT INTO branch_payment_methods(branch_id,payment_method_id,active,requires_reference,updated_by)
        SELECT $1,id,TRUE,FALSE,$2 FROM payment_methods WHERE active=TRUE
        ON CONFLICT(branch_id,payment_method_id) DO NOTHING
      `, [r.rows[0].id, actor.id]);
      await AuditService.log({
        userId: actor.id, branchId: r.rows[0].id, role: actor.role, action: AUDIT.BRANCH_CREATED,
        module: 'SUCURSALES', entityType: 'BRANCH', entityId: r.rows[0].id,
        description: `Sucursal ${data.name} creada`, newValues: r.rows[0], requestContext: ctx,
      }, client);
      await client.query('COMMIT');
      return r.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  static async update(actor, id, data, ctx) {
    const fields = [];
    const values = [];
    let n = 1;
    for (const [key, column] of Object.entries({ code: 'code', name: 'name', province: 'province', city: 'city', address: 'address', phone: 'phone', email: 'email', active: 'active', cityId: 'city_id', openingDate: 'opening_date', locationSource: 'location_source' })) {
      if (data[key] !== undefined) {
        fields.push(`${column}=$${n++}`);
        values.push(data[key] === '' ? null : data[key]);
      }
    }
    if (data.latitude !== undefined) {
      fields.push(`latitude=$${n++}`);
      values.push(nullableNumber(data.latitude));
    }
    if (data.longitude !== undefined) {
      fields.push(`longitude=$${n++}`);
      values.push(nullableNumber(data.longitude));
    }
    if (!fields.length) throw createError(422, 'Sin cambios');

    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const old = await client.query('SELECT * FROM branches WHERE id=$1 FOR UPDATE', [id]);
      if (!old.rows.length) throw createError(404, 'Sucursal no encontrada');
      if (data.code && String(data.code).toLowerCase() !== String(old.rows[0].code || '').toLowerCase()) {
        const duplicate = await client.query('SELECT id FROM branches WHERE LOWER(code)=LOWER($1) AND id<>$2', [data.code, id]);
        if (duplicate.rows.length) throw createError(409, 'Ya existe una sucursal con ese código');
      }
      if ((data.city !== undefined || data.province !== undefined) && data.cityId === undefined) {
        const cityId = await this.resolveCityId(client, {
          city: data.city !== undefined ? data.city : old.rows[0].city,
          province: data.province !== undefined ? data.province : old.rows[0].province,
        });
        fields.push(`city_id=$${n++}`);
        values.push(cityId);
      }
      values.push(id);
      const r = await client.query(`UPDATE branches SET ${fields.join(',')}, updated_at=NOW() WHERE id=$${n} RETURNING *`, values);
      const disabled = old.rows[0].active && r.rows[0].active === false;
      await AuditService.log({
        userId: actor.id, branchId: id, role: actor.role, action: disabled ? AUDIT.BRANCH_DISABLED : AUDIT.BRANCH_UPDATED,
        module: 'SUCURSALES', entityType: 'BRANCH', entityId: id,
        description: disabled ? `Sucursal ${r.rows[0].name} desactivada` : `Sucursal ${r.rows[0].name} actualizada`,
        oldValues: old.rows[0], newValues: r.rows[0], requestContext: ctx,
      }, client);
      await client.query('COMMIT');
      return r.rows[0];
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
}

module.exports = BranchAdminService;
