const db = require("../config/database");
const ExcelJS = require("exceljs");
const instructorActivityCtes = require('./InstructorReportActivities');
const { resolvePeriod } = require("./AdminDashboardService");

const scope = (alias) =>
  `($1::uuid IS NULL OR ${alias}.id=$1) AND ($4::text IS NULL OR ${alias}.province=$4) AND ($5::text IS NULL OR ${alias}.city=$5)`;
const enrollmentScope = `EXISTS(SELECT 1 FROM branches bx WHERE bx.id=e.branch_id AND ${scope("bx")})`;

const occupationReportCtes = `occupation_days AS (
  SELECT o.instructor_id,o.schedule_date,o.start_time,o.end_time,o.reason_type,o.reason
  FROM instructor_availability_overrides o
  WHERE o.active=TRUE AND o.status='blocked' AND o.reason_type IS NOT NULL AND o.reason_type<>'occupied'
    AND o.schedule_date BETWEEN $2::timestamp::date AND $3::timestamp::date
  UNION ALL
  SELECT a.instructor_id,d.day::date,a.start_time,a.end_time,a.reason_type,a.unavailable_reason
  FROM instructor_availability a
  CROSS JOIN generate_series($2::date,$3::date,INTERVAL '1 day') d(day)
  WHERE a.active=FALSE AND a.reason_type IS NOT NULL AND a.reason_type<>'occupied'
    AND a.weekday=EXTRACT(ISODOW FROM d.day)::int
    AND NOT EXISTS(SELECT 1 FROM instructor_availability_overrides o
      WHERE o.instructor_id=a.instructor_id AND o.active=TRUE AND o.schedule_date=d.day::date
        AND o.start_time<a.end_time AND o.end_time>a.start_time)
), occupation_rows AS (
  SELECT od.instructor_id,cc.id cycle_id,cc.code cycle_code,cc.start_date,cc.end_date,
    c.name course_name,od.reason_type,COALESCE(NULLIF(od.reason,''),
      CASE WHEN od.reason_type='transport' THEN 'Transporte' ELSE 'Otros' END) name,
    od.start_time,od.end_time,COUNT(DISTINCT od.schedule_date)::int classes,
    STRING_AGG(DISTINCT TO_CHAR(od.schedule_date,'DD/MM/YYYY'),', ') class_dates
  FROM occupation_days od
  JOIN course_cycles cc ON od.schedule_date BETWEEN cc.start_date AND cc.end_date
    AND cc.deleted_at IS NULL AND cc.status<>'cancelado'
  JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id
  WHERE ${scope("b")} AND (
    EXISTS(SELECT 1 FROM course_cycle_schedule_assignments a WHERE a.cycle_id=cc.id AND a.instructor_id=od.instructor_id AND a.status='activo')
    OR EXISTS(SELECT 1 FROM course_cycle_instructors ci WHERE ci.cycle_id=cc.id AND ci.instructor_id=od.instructor_id AND ci.active=TRUE)
    OR EXISTS(SELECT 1 FROM instructor_group_members gm WHERE gm.group_id=cc.group_id AND gm.instructor_id=od.instructor_id AND gm.active=TRUE AND gm.ended_at IS NULL)
  )
  GROUP BY od.instructor_id,cc.id,c.name,od.reason_type,od.reason,od.start_time,od.end_time
)`;

async function resolveManagerReportScope(auth, filters = {}) {
  if (auth.global) return { branchId: filters.branchId || null, province: filters.province || null, city: filters.city || null };
  if (!(auth.roles || []).includes("BRANCH_ADMIN")) return { branchId: auth.branchId, province: filters.province || null, city: filters.city || null };
  const home = (await db.query("SELECT province,city FROM branches WHERE id=$1 AND active=TRUE", [auth.branchId])).rows[0];
  if (!home) throw Object.assign(new Error("La sucursal asignada no está disponible."), { status: 403 });
  const branchId = filters.branchId || null;
  if (branchId) {
    const allowed = await db.query("SELECT 1 FROM branches WHERE id=$1 AND active=TRUE AND LOWER(city)=LOWER($2)", [branchId, home.city]);
    if (!allowed.rows.length) throw Object.assign(new Error("No tienes acceso a sucursales de otro cantón."), { status: 403 });
  }
  return { branchId, province: home.province || null, city: home.city || null };
}

function previousRange(from, to) {
  const duration = to.getTime() - from.getTime() + 1;
  return {
    from: new Date(from.getTime() - duration),
    to: new Date(from.getTime() - 1),
  };
}

class ManagerDashboardService {
  static async summary(auth, filters = {}) {
    const branchId = auth.global ? filters.branchId || null : auth.branchId;
    const range = resolvePeriod(filters);
    const previous = previousRange(range.from, range.to);
    const province = filters.province || null;
    const city = filters.city || null;
    const courseType = ["moto", "carro"].includes(filters.courseType) ? filters.courseType : null;
    const params = [
      branchId,
      range.from,
      range.to,
      province,
      city,
      previous.from,
      previous.to,
      courseType,
    ];
    const courseScope = `($8::text IS NULL OR EXISTS(SELECT 1 FROM courses cf WHERE cf.id=e.course_id AND ($8='moto' AND LOWER(cf.name) LIKE '%moto%' OR $8='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))))`;
    const scopedEnrollment = `${enrollmentScope} AND ${courseScope} AND EXISTS(SELECT 1 FROM students visible WHERE visible.id=e.student_id AND visible.status <> 'inhabilitado')`;

    const [kpis, branches, courses, options, paymentMethods] =
      await Promise.all([
        db.query(
          `SELECT
        ((SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scopedEnrollment})+(SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")}))::numeric collected,
        (SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scopedEnrollment})::numeric course_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='INDEPENDENT_EVALUATION' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::numeric evaluation_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::numeric recovery_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='DRIVING_PRACTICE' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::numeric driving_practice_collected,
        (SELECT COUNT(*) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='INDEPENDENT_EVALUATION' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::int evaluations,
        (SELECT COUNT(*) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::int recoveries,
        (SELECT COUNT(*) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND sc.category='DRIVING_PRACTICE' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bs")})::int driving_practices,
        (SELECT COALESCE(SUM(p.balance),0) FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE p.status<>'anulado' AND e.created_at BETWEEN $2 AND $3 AND ${scopedEnrollment})::numeric pending,
        (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e WHERE e.created_at BETWEEN $2 AND $3 AND ${scopedEnrollment} AND EXISTS(SELECT 1 FROM payments pp JOIN payment_details pdp ON pdp.payment_id=pp.id WHERE pp.enrollment_id=e.id AND UPPER(pdp.status) IN ('ACTIVO','ACTIVE','CONFIRMADO')))::int people,
        (SELECT COUNT(*) FROM enrollments e WHERE e.created_at BETWEEN $2 AND $3 AND ${scopedEnrollment})::int enrollments,
        ((SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $6 AND $7 AND ${scopedEnrollment})+(SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN branches bs ON bs.id=st.branch_id WHERE $8::text IS NULL AND st.status='PAID' AND st.performed_at BETWEEN $6 AND $7 AND ${scope("bs")}))::numeric previous_collected,
        (SELECT COUNT(*) FROM enrollments e WHERE e.created_at BETWEEN $6 AND $7 AND ${scopedEnrollment})::int previous_enrollments`,
          params,
        ),
        db.query(
          `SELECT b.id,b.name,b.province,b.city,
        (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses cf ON cf.id=e.course_id WHERE e.branch_id=b.id AND e.created_at BETWEEN $2 AND $3 AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))) AND EXISTS(SELECT 1 FROM payments pp JOIN payment_details pdp ON pdp.payment_id=pp.id WHERE pp.enrollment_id=e.id AND UPPER(pdp.status) IN ('ACTIVO','ACTIVE','CONFIRMADO')))::int people,
        (SELECT COUNT(*) FROM enrollments e JOIN courses cf ON cf.id=e.course_id WHERE e.branch_id=b.id AND e.created_at BETWEEN $2 AND $3 AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))))::int enrollments,
        ((SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id WHERE e.branch_id=b.id AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))))+(SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st WHERE $6::text IS NULL AND st.branch_id=b.id AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3))::numeric collected,
        (SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id WHERE e.branch_id=b.id AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))))::numeric course_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id WHERE st.branch_id=b.id AND st.status='PAID' AND sc.category='INDEPENDENT_EVALUATION' AND st.performed_at BETWEEN $2 AND $3)::numeric evaluation_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id WHERE st.branch_id=b.id AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3)::numeric recovery_collected,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id WHERE st.branch_id=b.id AND st.status='PAID' AND sc.category='DRIVING_PRACTICE' AND st.performed_at BETWEEN $2 AND $3)::numeric driving_practice_collected,
        (SELECT COALESCE(SUM(x.amount),0) FROM (SELECT pd.amount FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=b.id AND LOWER(pd.payment_method)='efectivo' AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 UNION ALL SELECT st.amount FROM service_transactions st WHERE st.branch_id=b.id AND LOWER(st.payment_method)='efectivo' AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3) x)::numeric efectivo_collected,
        (SELECT COALESCE(SUM(x.amount),0) FROM (SELECT pd.amount FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=b.id AND LOWER(pd.payment_method)='tarjeta' AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 UNION ALL SELECT st.amount FROM service_transactions st WHERE st.branch_id=b.id AND LOWER(st.payment_method)='tarjeta' AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3) x)::numeric tarjeta_collected,
        (SELECT COALESCE(SUM(x.amount),0) FROM (SELECT pd.amount FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id WHERE e.branch_id=b.id AND LOWER(pd.payment_method)='transferencia' AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 UNION ALL SELECT st.amount FROM service_transactions st WHERE st.branch_id=b.id AND LOWER(st.payment_method)='transferencia' AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3) x)::numeric transferencia_collected,
        (SELECT COALESCE(SUM(p.balance),0) FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id WHERE e.branch_id=b.id AND p.status<>'anulado' AND e.created_at BETWEEN $2 AND $3 AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%'))))::numeric pending
        FROM branches b WHERE b.active AND ${scope("b")} ORDER BY collected DESC,b.name`,
          [...params.slice(0, 5), courseType],
        ),
        db.query(
          `SELECT c.id,c.name,c.price,
        COUNT(e.id)::int enrollments,COUNT(DISTINCT e.student_id) FILTER(WHERE EXISTS(SELECT 1 FROM payments pp JOIN payment_details pdp ON pdp.payment_id=pp.id WHERE pp.enrollment_id=e.id AND UPPER(pdp.status) IN ('ACTIVO','ACTIVE','CONFIRMADO')))::int people,
        COALESCE((SELECT SUM(pd.amount) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments ep ON ep.id=p.enrollment_id JOIN branches bp ON bp.id=ep.branch_id WHERE ep.course_id=c.id AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("bp")}),0)::numeric collected,
        COALESCE((SELECT SUM(p.balance) FROM payments p JOIN enrollments ep ON ep.id=p.enrollment_id JOIN branches bp ON bp.id=ep.branch_id WHERE ep.course_id=c.id AND p.status<>'anulado' AND ep.created_at BETWEEN $2 AND $3 AND ${scope("bp")}),0)::numeric pending
        FROM courses c LEFT JOIN enrollments e ON e.course_id=c.id AND e.created_at BETWEEN $2 AND $3 AND ${enrollmentScope}
        WHERE c.active AND ($6::text IS NULL OR ($6='moto' AND LOWER(c.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(c.name) LIKE '%automóvil%' OR LOWER(c.name) LIKE '%automovil%'))) GROUP BY c.id,c.name,c.price ORDER BY collected DESC,c.name`,
          [...params.slice(0, 5), courseType],
        ),
        db.query(
          `SELECT id,name,province,city FROM branches WHERE active ORDER BY province,city,name`,
        ),
        db.query(
          `SELECT pm.code,pm.name,COUNT(DISTINCT b.id)::int enabled_branches,
        STRING_AGG(DISTINCT b.name, ', ' ORDER BY b.name) enabled_branch_names,
        COALESCE((SELECT SUM(pd.amount) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id JOIN branches bx ON bx.id=e.branch_id WHERE LOWER(pd.payment_method)=LOWER(pm.code) AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("bx")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%')))),0)::numeric course_amount,
        COALESCE((SELECT SUM(st.amount) FROM service_transactions st JOIN branches bx ON bx.id=st.branch_id WHERE $6::text IS NULL AND LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0)::numeric service_amount,
        COALESCE((SELECT SUM(st.amount) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bx ON bx.id=st.branch_id WHERE LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND sc.category='INDEPENDENT_EVALUATION' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0)::numeric evaluation_amount,
        COALESCE((SELECT SUM(st.amount) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bx ON bx.id=st.branch_id WHERE LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0)::numeric recovery_amount,
        COALESCE((SELECT SUM(st.amount) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches bx ON bx.id=st.branch_id WHERE LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND sc.category='DRIVING_PRACTICE' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0)::numeric driving_practice_amount,
        (COALESCE((SELECT SUM(pd.amount) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id JOIN branches bx ON bx.id=e.branch_id WHERE LOWER(pd.payment_method)=LOWER(pm.code) AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("bx")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%')))),0)+COALESCE((SELECT SUM(st.amount) FROM service_transactions st JOIN branches bx ON bx.id=st.branch_id WHERE $6::text IS NULL AND LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0))::numeric amount,
        (COALESCE((SELECT COUNT(*) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses cf ON cf.id=e.course_id JOIN branches bx ON bx.id=e.branch_id WHERE LOWER(pd.payment_method)=LOWER(pm.code) AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("bx")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(cf.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(cf.name) LIKE '%automóvil%' OR LOWER(cf.name) LIKE '%automovil%')))),0)+COALESCE((SELECT COUNT(*) FROM service_transactions st JOIN branches bx ON bx.id=st.branch_id WHERE $6::text IS NULL AND LOWER(st.payment_method)=LOWER(pm.code) AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("bx")}),0))::int transactions
        FROM payment_methods pm JOIN branch_payment_methods bpm ON bpm.payment_method_id=pm.id AND bpm.active=TRUE JOIN branches b ON b.id=bpm.branch_id AND b.active=TRUE
        WHERE pm.active=TRUE AND ${scope("b")} GROUP BY pm.id,pm.code,pm.name ORDER BY pm.name`,
          [...params.slice(0, 5), courseType],
        ),
      ]);
    return {
      filters: {
        period: range.period,
        dateFrom: range.from,
        dateTo: range.to,
        branchId,
        province,
        city,
        courseType,
      },
      kpis: {
        ...kpis.rows[0],
        evaluationsAvailable: true,
        recoveriesAvailable: true,
      },
      incomeDistribution: [
        {
          code: "courses",
          name: "Cursos y matrículas",
          amount: kpis.rows[0].course_collected,
        },
        {
          code: "evaluations",
          name: "Evaluaciones independientes",
          amount: kpis.rows[0].evaluation_collected,
          available: true,
        },
        {
          code: "recoveries",
          name: "Recuperaciones",
          amount: kpis.rows[0].recovery_collected,
          available: true,
        },
        {
          code: "driving_practice",
          name: "Prácticas para personas con licencia",
          amount: kpis.rows[0].driving_practice_collected,
          available: true,
        },
      ],
      branches: branches.rows,
      courses: courses.rows,
      paymentMethods: paymentMethods.rows,
      branchOptions: options.rows,
    };
  }

  static async people(auth, filters = {}, exportAll = false) {
    const type = filters.type === "attended" ? "attended" : "enrollments";
    const branchId = auth.global ? filters.branchId || null : auth.branchId;
    const range = resolvePeriod({ ...filters, period: "custom" });
    const province = filters.province || null;
    const city = filters.city || null;
    const courseType = ["moto", "carro"].includes(filters.courseType) ? filters.courseType : null;
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const limit = exportAll ? 100000 : 5;
    const offset = (page - 1) * limit;
    const eligible =
      type === "attended"
        ? `SELECT DISTINCT ON (student_id) * FROM scoped WHERE paid ORDER BY student_id,created_at DESC`
        : `SELECT * FROM scoped`;
    const result = await db.query(
      `WITH scoped AS (
      SELECT e.id enrollment_id,s.id student_id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,s.blood_type,s.address,
        COALESCE(sc.name,b.city,'') canton,b.name branch_name,c.name course_name,e.created_at,
        EXISTS(SELECT 1 FROM payments p JOIN payment_details pd ON pd.payment_id=p.id WHERE p.enrollment_id=e.id AND UPPER(pd.status) IN ('ACTIVO','ACTIVE','CONFIRMADO')) paid
      FROM enrollments e JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id LEFT JOIN cities sc ON sc.id=s.city_id
      WHERE e.created_at BETWEEN $2 AND $3 AND ${scope("b")}
        AND ($8::text IS NULL OR ($8='moto' AND LOWER(c.name) LIKE '%moto%') OR ($8='carro' AND (LOWER(c.name) LIKE '%automóvil%' OR LOWER(c.name) LIKE '%automovil%')))
    ), eligible AS (${eligible})
    SELECT enrollment_id,student_id,identification,name,email,phone,blood_type,address,canton,branch_name,course_name,created_at,COUNT(*) OVER()::int total
    FROM eligible ORDER BY created_at DESC,enrollment_id LIMIT $6 OFFSET $7`,
      [branchId, range.from, range.to, province, city, limit, offset, courseType],
    );
    const total = result.rows[0]?.total || 0;
    return {
      type,
      data: result.rows.map(({ total: ignored, ...row }) => row),
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  static async servicePeople(auth, filters = {}) {
    const type = filters.type === "recoveries" ? "recoveries" : "evaluations";
    const category =
      type === "recoveries" ? "RECOVERY" : "INDEPENDENT_EVALUATION";
    const branchId = auth.global ? filters.branchId || null : auth.branchId;
    const range = resolvePeriod({ ...filters, period: "custom" });
    const province = filters.province || null;
    const city = filters.city || null;
    const page = Math.max(Number.parseInt(filters.page, 10) || 1, 1);
    const pageSize = 5;
    const offset = (page - 1) * pageSize;
    const result = await db.query(
      `SELECT st.id,st.customer_identification identification,st.customer_name name,st.customer_email email,
      st.performed_at,st.result,st.amount,st.payment_method,c.name course_name,b.name branch_name,COUNT(*) OVER()::int total
      FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
      LEFT JOIN enrollments e ON e.id=st.enrollment_id LEFT JOIN courses c ON c.id=e.course_id
      WHERE st.status='PAID' AND sc.category=$6 AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")}
      ORDER BY st.performed_at DESC,st.id LIMIT $7 OFFSET $8`,
      [
        branchId,
        range.from,
        range.to,
        province,
        city,
        category,
        pageSize,
        offset,
      ],
    );
    const total = result.rows[0]?.total || 0;
    return {
      type,
      data: result.rows.map(({ total: ignored, ...row }) => row),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  static async financial(auth, filters = {}) {
    const summary = await this.summary(auth, filters);
    const branchId = auth.global ? filters.branchId || null : auth.branchId;
    const range = resolvePeriod({ ...filters, period: "custom" });
    const province = filters.province || null;
    const city = filters.city || null;
    const courseType = ["moto", "carro"].includes(filters.courseType) ? filters.courseType : null;
    const params = [branchId, range.from, range.to, province, city, courseType];
    const [movements, daily, receivables] = await Promise.all([
      db.query(
        `SELECT
        (SELECT COUNT(*) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id WHERE UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("b")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(c.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(c.name) LIKE '%automóvil%' OR LOWER(c.name) LIKE '%automovil%'))))::int course_transactions,
        (SELECT COUNT(*) FROM service_transactions st JOIN branches b ON b.id=st.branch_id WHERE $6::text IS NULL AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")})::int service_transactions,
        ((SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN branches b ON b.id=e.branch_id WHERE UPPER(pd.status) IN ('VOIDED','ANULADO') AND COALESCE(pd.voided_at,pd.created_at) BETWEEN $2 AND $3 AND ${scope("b")})+
         (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN branches b ON b.id=st.branch_id WHERE $6::text IS NULL AND st.status='VOIDED' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")}))::numeric voided_amount`,
        params,
      ),
      db.query(
        `SELECT movement_date::date,COALESCE(SUM(amount),0)::numeric amount,
        COALESCE(SUM(amount) FILTER(WHERE category='courses'),0)::numeric course_amount,
        COALESCE(SUM(amount) FILTER(WHERE category='evaluations'),0)::numeric evaluation_amount,
        COALESCE(SUM(amount) FILTER(WHERE category='recoveries'),0)::numeric recovery_amount,
        COALESCE(SUM(amount) FILTER(WHERE category='driving_practice'),0)::numeric driving_practice_amount,
        COALESCE(SUM(amount) FILTER(WHERE payment_method='efectivo'),0)::numeric efectivo_amount,
        COALESCE(SUM(amount) FILTER(WHERE payment_method='tarjeta'),0)::numeric tarjeta_amount,
        COALESCE(SUM(amount) FILTER(WHERE payment_method='transferencia'),0)::numeric transferencia_amount
        ,COUNT(*)::int transactions
        FROM (
        SELECT pd.created_at::date movement_date,pd.amount,'courses' category,LOWER(pd.payment_method) payment_method FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id WHERE UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO') AND pd.created_at BETWEEN $2 AND $3 AND ${scope("b")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(c.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(c.name) LIKE '%automóvil%' OR LOWER(c.name) LIKE '%automovil%')))
        UNION ALL SELECT st.performed_at::date,st.amount,CASE sc.category WHEN 'RECOVERY' THEN 'recoveries' WHEN 'DRIVING_PRACTICE' THEN 'driving_practice' ELSE 'evaluations' END,LOWER(st.payment_method) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id WHERE $6::text IS NULL AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")}
      ) x GROUP BY movement_date ORDER BY movement_date`,
        params,
      ),
      db.query(
        `SELECT c.name course_name,COUNT(*) FILTER(WHERE p.balance>0)::int accounts,COALESCE(SUM(p.balance),0)::numeric pending
        FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id
         WHERE p.status<>'anulado' AND e.created_at BETWEEN $2 AND $3 AND ${scope("b")} AND ($6::text IS NULL OR ($6='moto' AND LOWER(c.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(c.name) LIKE '%automóvil%' OR LOWER(c.name) LIKE '%automovil%'))) GROUP BY c.id,c.name HAVING SUM(p.balance)>0 ORDER BY pending DESC`,
        params,
      ),
    ]);
    return {
      ...summary,
      movements: movements.rows[0],
      daily: daily.rows,
      receivables: receivables.rows,
      instructorPayroll: {
        available: false,
        total: 0,
        pending: 0,
        message: "Define la tarifa por hora o clase para calcular honorarios.",
      },
    };
  }

  static async academic(auth, filters = {}) {
    const summary = await this.summary(auth, filters);
    const reportScope = await resolveManagerReportScope(auth, filters);
    const branchId = reportScope.branchId;
    const range = resolvePeriod({ ...filters, period: "custom" });
    const province = reportScope.province;
    const city = reportScope.city;
    const [
      instructors,
      coursePerformance,
      cycles,
      courseCycles,
      activeStudents,
      psychometricDaily,
      psychometricBranches,
      psychometricMethods,
      psychometricRecent,
      independentServices,
    ] = await Promise.all([
      db.query(
        `WITH ${occupationReportCtes}, occupation_load AS (
          SELECT instructor_id,COUNT(*)::int students,
            COUNT(*) FILTER(WHERE LOWER(course_name) LIKE '%moto%')::int moto_students,
            COUNT(*) FILTER(WHERE LOWER(course_name) LIKE '%autom%' OR LOWER(course_name) LIKE '%carro%')::int car_students
          FROM occupation_rows GROUP BY instructor_id
        ), course_load AS (
          SELECT ccsa.instructor_id,COUNT(DISTINCT ccsa.enrollment_id)::int students,
            COUNT(DISTINCT ccsa.enrollment_id) FILTER(WHERE LOWER(c.name) LIKE '%moto%')::int moto_students,
            COUNT(DISTINCT ccsa.enrollment_id) FILTER(WHERE LOWER(c.name) LIKE '%autom%' OR LOWER(c.name) LIKE '%carro%')::int car_students,
            COUNT(DISTINCT ccsa.id)::int scheduled_classes,COUNT(DISTINCT ccsa.cycle_id)::int courses
          FROM course_cycle_schedule_assignments ccsa
          JOIN course_cycles cc ON cc.id=ccsa.cycle_id AND cc.deleted_at IS NULL AND cc.status<>'cancelado'
          JOIN courses c ON c.id=cc.course_id
          WHERE ccsa.status='activo' AND ccsa.schedule_date BETWEEN $2::date AND $3::date
          GROUP BY ccsa.instructor_id
        ), session_load AS (
          SELECT ps.instructor_id,
            COUNT(DISTINCT ps.id) FILTER(WHERE UPPER(ps.status)='COMPLETADA')::int completed_classes,
            COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(ps.actual_end,ps.scheduled_end)-COALESCE(ps.actual_start,ps.scheduled_start)))/3600)
              FILTER(WHERE UPPER(ps.status)='COMPLETADA')::numeric,2),0)::numeric taught_hours
          FROM practical_sessions ps
          WHERE ps.deleted_at IS NULL AND ps.scheduled_start BETWEEN $2::timestamp AND $3::timestamp
          GROUP BY ps.instructor_id
        ), additional_practice_days AS (
          SELECT ap.instructor_id,(ap.start_date + day_offset)::date practice_date
          FROM additional_driving_practices ap
          CROSS JOIN LATERAL generate_series(0,ap.number_of_days-1) day_offset
          WHERE ap.status<>'CANCELLED'
            AND (ap.start_date + day_offset)::date BETWEEN $2::date AND $3::date
        ), additional_practice_load AS (
          SELECT instructor_id,COUNT(*)::int practical_classes
          FROM additional_practice_days GROUP BY instructor_id
        ), exam_only_load AS (
          SELECT pe.instructor_id,COUNT(DISTINCT pe.id)::int exams_taken,
            STRING_AGG(DISTINCT TRIM(CONCAT(s.first_name,' ',s.last_name)),', '
              ORDER BY TRIM(CONCAT(s.first_name,' ',s.last_name))) AS exam_only_people
          FROM practical_evaluations pe
          JOIN practical_sessions ps ON ps.id=pe.practical_session_id
            AND ps.appointment_type='EXAM_ONLY' AND ps.deleted_at IS NULL
          JOIN enrollments e ON e.id=pe.enrollment_id
          JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
          WHERE pe.evaluated_at BETWEEN $2::timestamp AND $3::timestamp
          GROUP BY pe.instructor_id
        )
      SELECT ip.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name,u.email,b.name branch_name,ip.practice_area,
      (COALESCE(cl.students,0)+COALESCE(ol.students,0))::int students,COALESCE(cl.scheduled_classes,0)::int scheduled_classes,
      (COALESCE(cl.car_students,0)+COALESCE(ol.car_students,0))::int car_students,
      (COALESCE(cl.moto_students,0)+COALESCE(ol.moto_students,0))::int moto_students,
      COALESCE(sl.completed_classes,0)::int completed_classes,COALESCE(sl.taught_hours,0)::numeric taught_hours,
      COALESCE(cl.courses,0)::int courses,COALESCE(apl.practical_classes,0)::int practical_classes,
      COALESCE(eol.exams_taken,0)::int exams_taken,COALESCE(eol.exam_only_people,'') exam_only_people
      FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches b ON b.id=u.branch_id
      LEFT JOIN course_load cl ON cl.instructor_id=ip.id
      LEFT JOIN occupation_load ol ON ol.instructor_id=ip.id
      LEFT JOIN session_load sl ON sl.instructor_id=ip.id
      LEFT JOIN additional_practice_load apl ON apl.instructor_id=ip.id
      LEFT JOIN exam_only_load eol ON eol.instructor_id=ip.id
      WHERE ip.deleted_at IS NULL AND LOWER(ip.status)='activo' AND ${scope("b")}
      ORDER BY COALESCE(sl.taught_hours,0) DESC,name`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT c.id,c.name,
        COUNT(DISTINCT e.id)::int enrollments,
        COUNT(DISTINCT e.id) FILTER(WHERE EXISTS(SELECT 1 FROM payments p JOIN payment_details pd ON pd.payment_id=p.id WHERE p.enrollment_id=e.id AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO')))::int confirmed,
        COUNT(DISTINCT e.id) FILTER(WHERE LOWER(e.status)='completado')::int completed,
        COUNT(DISTINCT ps.id)::int scheduled_classes,
        COUNT(DISTINCT ps.id) FILTER(WHERE UPPER(ps.status)='COMPLETADA')::int completed_classes,
        COUNT(DISTINCT ps.id) FILTER(WHERE UPPER(ps.status)='AUSENTE' OR LOWER(COALESCE(ps.attendance_status,'')) LIKE 'no asist%')::int absences,
        COALESCE(ROUND(AVG(CASE WHEN UPPER(ps.status) IN ('COMPLETADA','AUSENTE') THEN CASE WHEN UPPER(ps.status)='COMPLETADA' THEN 100 ELSE 0 END END)::numeric,1),0)::numeric attendance_rate,
        COUNT(DISTINCT ps.instructor_id)::int instructors,
        (SELECT COUNT(*) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN enrollments er ON er.id=st.enrollment_id JOIN branches br ON br.id=er.branch_id WHERE er.course_id=c.id AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("br")})::int recoveries,
        (SELECT COALESCE(SUM(st.amount),0) FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN enrollments er ON er.id=st.enrollment_id JOIN branches br ON br.id=er.branch_id WHERE er.course_id=c.id AND st.status='PAID' AND sc.category='RECOVERY' AND st.performed_at BETWEEN $2 AND $3 AND ${scope("br")})::numeric recovery_income
        FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id
        LEFT JOIN practical_sessions ps ON ps.enrollment_id=e.id AND ps.deleted_at IS NULL AND ps.scheduled_start BETWEEN $2 AND $3
        WHERE e.created_at BETWEEN $2 AND $3 AND ${scope("b")} GROUP BY c.id,c.name ORDER BY enrollments DESC`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT CASE WHEN cc.start_date>CURRENT_DATE THEN 'proximo' WHEN cc.end_date<CURRENT_DATE THEN 'finalizado' ELSE 'activo' END status,COUNT(*)::int total,COALESCE(SUM(COALESCE(cc.published_capacity,cc.capacity_per_instructor)),0)::int capacity
        FROM course_cycles cc JOIN branches b ON b.id=cc.branch_id WHERE cc.active AND cc.deleted_at IS NULL AND cc.start_date<=$3::date AND cc.end_date>=$2::date AND ${scope("b")} GROUP BY CASE WHEN cc.start_date>CURRENT_DATE THEN 'proximo' WHEN cc.end_date<CURRENT_DATE THEN 'finalizado' ELSE 'activo' END ORDER BY status`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT cc.id,cc.course_id,cc.code,CASE WHEN cc.start_date>CURRENT_DATE THEN 'proximo' WHEN cc.end_date<CURRENT_DATE THEN 'finalizado' ELSE 'activo' END status,cc.modality,cc.start_date,cc.end_date,cc.duration_business_days,COALESCE(cc.published_capacity,cc.capacity_per_instructor)::int capacity,b.name branch_name,ig.name group_name,
        COUNT(DISTINCT ccsa.enrollment_id)::int enrolled,
        STRING_AGG(DISTINCT TRIM(CONCAT(u.first_name,' ',u.last_name)),', ' ORDER BY TRIM(CONCAT(u.first_name,' ',u.last_name))) FILTER(WHERE u.id IS NOT NULL) instructors
        FROM course_cycles cc JOIN branches b ON b.id=cc.branch_id LEFT JOIN instructor_groups ig ON ig.id=cc.group_id
        LEFT JOIN course_cycle_schedule_assignments ccsa ON ccsa.cycle_id=cc.id AND ccsa.status='activo'
        LEFT JOIN course_cycle_instructors cci ON cci.cycle_id=cc.id AND cci.active
        LEFT JOIN instructor_profiles ip ON ip.id=cci.instructor_id LEFT JOIN users u ON u.id=ip.user_id
        WHERE cc.active AND cc.deleted_at IS NULL AND cc.end_date>=$2::date AND cc.start_date<=($3::date+INTERVAL '60 days') AND ${scope("b")}
        GROUP BY cc.id,b.name,ig.name ORDER BY b.name,ig.name NULLS LAST,cc.start_date,cc.code`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT DISTINCT s.id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,c.name course_name,b.name branch_name,cc.code cycle_code,cc.start_date,cc.end_date,
        TRIM(CONCAT(iu.first_name,' ',iu.last_name)) instructor_name
        FROM course_cycles cc JOIN branches b ON b.id=cc.branch_id JOIN courses c ON c.id=cc.course_id
        JOIN course_cycle_schedule_assignments ccsa ON ccsa.cycle_id=cc.id AND ccsa.status='activo'
        JOIN enrollments e ON e.id=ccsa.enrollment_id JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id
        LEFT JOIN enrollment_instructor_assignments eia ON eia.enrollment_id=e.id AND eia.start_date<=CURRENT_DATE AND eia.end_date>=CURRENT_DATE
        LEFT JOIN instructor_profiles ip ON ip.id=eia.instructor_id LEFT JOIN users iu ON iu.id=ip.user_id
        WHERE cc.active AND cc.deleted_at IS NULL AND cc.start_date<=CURRENT_DATE AND cc.end_date>=CURRENT_DATE
          AND $2::timestamp IS NOT NULL AND $3::timestamp IS NOT NULL
          AND LOWER(e.status) IN ('activo','en_curso')
          AND EXISTS(SELECT 1 FROM payments p JOIN payment_details pd ON pd.payment_id=p.id WHERE p.enrollment_id=e.id AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO'))
          AND ${scope("b")} ORDER BY b.name,c.name,name`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT sc.code,st.performed_at::date movement_date,COUNT(*)::int total,COALESCE(SUM(st.amount),0)::numeric income
        FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
        WHERE st.status='PAID' AND sc.category IN ('INDEPENDENT_EVALUATION','DRIVING_PRACTICE') AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")} GROUP BY sc.code,st.performed_at::date ORDER BY movement_date`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT sc.code,b.name branch_name,COUNT(*)::int total,COALESCE(SUM(st.amount),0)::numeric income
        FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
        WHERE st.status='PAID' AND sc.category IN ('INDEPENDENT_EVALUATION','DRIVING_PRACTICE') AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")} GROUP BY sc.code,b.id,b.name ORDER BY total DESC`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT sc.code,LOWER(st.payment_method) method,COUNT(*)::int total,COALESCE(SUM(st.amount),0)::numeric income
        FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
        WHERE st.status='PAID' AND sc.category IN ('INDEPENDENT_EVALUATION','DRIVING_PRACTICE') AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")} GROUP BY sc.code,LOWER(st.payment_method) ORDER BY income DESC`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT sc.code,st.customer_identification identification,st.customer_name name,st.customer_email email,st.performed_at,st.amount,b.name branch_name,CASE WHEN st.enrollment_id IS NULL THEN 'Externo' ELSE 'Estudiante' END customer_type
        FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id
        WHERE st.status='PAID' AND sc.category IN ('INDEPENDENT_EVALUATION','DRIVING_PRACTICE') AND st.performed_at BETWEEN $2 AND $3 AND ${scope("b")} ORDER BY st.performed_at DESC LIMIT 50`,
        [branchId, range.from, range.to, province, city],
      ),
      db.query(
        `SELECT sc.code,sc.name,sc.category,sc.base_price,sc.alumni_price,sc.afternoon_price,sc.duration_hours,sc.audience,COUNT(st.id)::int total,COALESCE(SUM(st.amount),0)::numeric income,COUNT(st.id) FILTER(WHERE st.enrollment_id IS NOT NULL AND st.amount=sc.alumni_price)::int alumni_total,COUNT(st.id) FILTER(WHERE st.enrollment_id IS NULL AND st.amount=sc.base_price)::int external_total,COUNT(st.id) FILTER(WHERE st.amount=sc.afternoon_price)::int afternoon_total,COUNT(DISTINCT bs.branch_id) FILTER(WHERE bs.enabled)::int enabled_branches
        FROM service_catalog sc LEFT JOIN branch_services bs ON bs.service_id=sc.id LEFT JOIN branches b ON b.id=bs.branch_id
        LEFT JOIN service_transactions st ON st.service_id=sc.id AND st.branch_id=b.id AND st.status='PAID' AND st.performed_at BETWEEN $2 AND $3
        WHERE sc.active AND sc.category IN ('INDEPENDENT_EVALUATION','DRIVING_PRACTICE') AND ${scope("b")}
        GROUP BY sc.id ORDER BY sc.category,sc.name`,
        [branchId, range.from, range.to, province, city],
      ),
    ]);
    return {
      ...summary,
      instructors: instructors.rows,
      coursePerformance: coursePerformance.rows,
      cycleSummary: cycles.rows,
      courseCycles: courseCycles.rows,
      activeStudents: activeStudents.rows,
      independentServices: independentServices.rows,
      psychometric: {
        daily: psychometricDaily.rows,
        branches: psychometricBranches.rows,
        methods: psychometricMethods.rows,
        recent: psychometricRecent.rows,
      },
    };
  }

  static async instructorStudents(auth, filters = {}, exportAll = false) {
    const reportScope = await resolveManagerReportScope(auth, filters),
      branchId = reportScope.branchId,
      range = resolvePeriod({ ...filters, period: "custom" }),
      province = reportScope.province,
      city = reportScope.city,
      instructorId = filters.instructorId,
      cycleId = filters.cycleId || null,
      page = Math.max(parseInt(filters.page, 10) || 1, 1),
      limit = exportAll ? 100000 : 5,
      offset = (page - 1) * limit;
    if (!instructorId) throw new Error("Selecciona un instructor.");
    const params = [
      branchId,
      range.from,
      range.to,
      province,
      city,
      instructorId,
      cycleId,
      limit,
      offset,
    ];
    const [rows, courses, instructor] = await Promise.all([
      db.query(
        `WITH ${instructorActivityCtes}
        SELECT *,COUNT(*) OVER()::int total FROM activities
        WHERE ($7::uuid IS NULL OR cycle_id=$7)
        ORDER BY start_time,start_date,course_name,name,id,activity_type LIMIT $8 OFFSET $9`,
        params,
      ),
      db.query(
        `WITH ${instructorActivityCtes}
         SELECT DISTINCT cycle_id id,CONCAT(course_name,' · ',TO_CHAR(start_date,'DD/MM/YYYY')) name,start_date
         FROM activities WHERE cycle_id IS NOT NULL ORDER BY start_date,name`,
        params.slice(0, 6),
      ),
      db.query(
        `SELECT TRIM(CONCAT(u.first_name,' ',u.last_name)) name FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id WHERE ip.id=$1`,
        [instructorId],
      ),
    ]);
    const occupations = exportAll ? (await db.query(
      `WITH ${occupationReportCtes}
       SELECT *,NULL::text identification,NULL::text email,0::int attended,0::numeric hours,
         TRUE is_occupation,TO_CHAR(start_time,'HH24:MI') || ' - ' || TO_CHAR(end_time,'HH24:MI') schedule_time
       FROM occupation_rows WHERE instructor_id=$6 AND ($7::uuid IS NULL OR cycle_id=$7)
       ORDER BY start_date,course_name,start_time,name`, params.slice(0,7),
    )).rows : [];
    const exams = exportAll ? (await db.query(
      `WITH ${instructorActivityCtes}
       SELECT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,c.name course_name,
         TO_CHAR(ps.scheduled_start,'DD/MM/YYYY HH24:MI') scheduled_at,
         ps.status,pe.result,pe.percentage
       FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id
       JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id JOIN courses c ON c.id=e.course_id
       JOIN branches b ON b.id=e.branch_id
       LEFT JOIN LATERAL(SELECT result,percentage FROM practical_evaluations
         WHERE practical_session_id=ps.id ORDER BY evaluated_at DESC LIMIT 1) pe ON TRUE
       WHERE ps.instructor_id=$6 AND ps.appointment_type='EXAM_ONLY' AND ps.deleted_at IS NULL
         AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
         AND EXISTS(SELECT 1 FROM activity_events a JOIN activities visible ON visible.id=a.student_id
           AND visible.activity_type='EXAM_ONLY' AND visible.cycle_id IS NOT DISTINCT FROM a.cycle_id
           WHERE a.enrollment_id=e.id AND a.activity_type='EXAM_ONLY'
             AND a.activity_date=ps.scheduled_start::date AND a.start_time=ps.scheduled_start::time
             AND ($7::uuid IS NULL OR a.cycle_id=$7))
       ORDER BY ps.scheduled_start,name`, params.slice(0,7),
    )).rows : [];
    const total = rows.rows[0]?.total || 0;
    return {
      instructor: instructor.rows[0],
      occupations,
      exams,
      courses: courses.rows,
      data: rows.rows.map(({ total: ignored, ...item }) => item),
      pagination: {
        page,
        pageSize: limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    };
  }

  static async exportInstructorStudents(auth, filters = {}) {
    const report = await this.instructorStudents(auth, filters, true),
      workbook = new ExcelJS.Workbook(),
      sheet = workbook.addWorksheet("ESTUDIANTES");
    sheet.mergeCells("A1:M1");
    sheet.getCell("A1").value = "REPORTE DE ESTUDIANTES POR INSTRUCTOR";
    sheet.getCell("A1").font = {
      bold: true,
      size: 15,
      color: { argb: "FFFFFFFF" },
    };
    sheet.getCell("A1").fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4F46E5" },
    };
    sheet.getCell("A1").alignment = { horizontal: "center" };
    sheet.mergeCells("A2:M2");
    sheet.getCell("A2").value =
      `Instructor: ${report.instructor?.name || ""} · ${filters.courseId ? "Curso seleccionado" : "Todos los cursos"}`;
    sheet.addRow([]);
    sheet.addRow([
      "Identificación",
      "Nombre",
      "Correo",
      "Teléfono",
      "Curso",
      "Fechas de clase",
      "Clases",
      "Asistencias",
      "Horas",
      "Estado",
      "Horario",
      "Atencion",
      "Horas programadas",
    ]);
    report.data.forEach((item) =>
      sheet.addRow([
        item.identification,
        item.name,
        item.email,
        item.phone,
        item.course_name,
        item.class_dates,
        item.classes,
        item.attended,
        Number(item.hours),
        Number(item.attended) === Number(item.classes) + Number(item.exams || 0)
          ? "Completo"
          : "En proceso",
        item.schedule_time,
        item.activity_type === 'EXAM_ONLY' ? 'Formación intensiva' : item.activity_type === 'ADDITIONAL_PRACTICE' ? 'Horas practicas' : 'Clases',
        Number(item.scheduled_hours || 0),
      ]),
    );
    sheet.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(4).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF6366F1" },
    };
    sheet.columns = [14, 28, 28, 15, 28, 28, 10, 12, 10, 14, 20, 20, 20].map((width) => ({
      width,
    }));
    sheet.views = [{ state: "frozen", ySplit: 4 }];
    return {
      buffer: await workbook.xlsx.writeBuffer(),
      filename: `estudiantes_instructor_${Date.now()}.xlsx`,
    };
  }

  static async exportPeople(auth, filters = {}) {
    const report = await this.people(auth, filters, true);
    const title =
      report.type === "attended"
        ? "PARTICIPANTES CONFIRMADOS"
        : "MATRÍCULAS REGISTRADAS";
    const settings = await db.query(
      `SELECT key,value FROM settings WHERE scope_type='GLOBAL' AND key IN ('institution.name','institution.legal_name','institution.tax_id')`,
    );
    const config = Object.fromEntries(
      settings.rows.map((item) => [item.key, item.value]),
    );
    const school =
      config["institution.legal_name"] ||
      config["institution.name"] ||
      "SPORTMANCAR CIA. LTDA.";
    const taxId = config["institution.tax_id"] || "1191721124001";
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SportmancarERP";
    const sheet = workbook.addWorksheet(title.slice(0, 31));
    sheet.mergeCells("A1:K1");
    sheet.getCell("A1").value = "UNIDAD DE ESCUELAS DE CAPACITACIÓN";
    sheet.mergeCells("A2:K2");
    sheet.getCell("A2").value =
      "ESCUELA DE CAPACITACIÓN DE CONDUCTORES NO PROFESIONALES";
    sheet.mergeCells("A3:K3");
    sheet.getCell("A3").value = title;
    sheet.mergeCells("A4:K4");
    sheet.getCell("A4").value =
      `Escuela: ${school}   |   Periodo: ${filters.dateFrom} al ${filters.dateTo}`;
    ["A1", "A2", "A3"].forEach((cell) => {
      sheet.getCell(cell).font = { bold: true, size: cell === "A1" ? 16 : 12 };
      sheet.getCell(cell).alignment = { horizontal: "center" };
    });
    sheet.getCell("A4").alignment = { horizontal: "center" };
    sheet.getCell("A4").font = { italic: true, color: { argb: "FF475467" } };
    const header = sheet.getRow(6);
    header.values = [
      "Nº",
      "RUC",
      "ESCUELA",
      "IDENTIFICACIÓN",
      "NOMBRES",
      "CIUDADANÍA",
      "TIPO DE SANGRE",
      "DOMICILIO",
      "TELÉFONO",
      "EMAIL",
      "CANTÓN",
    ];
    header.height = 28;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" },
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
    report.data.forEach((item, index) => {
      const row = sheet.addRow([
        index + 1,
        taxId,
        school,
        item.identification,
        item.name,
        "ECUATORIANA",
        item.blood_type || "",
        item.address || "",
        item.phone || "",
        item.email || "",
        item.canton || "",
      ]);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFD0D5DD" } },
          left: { style: "thin", color: { argb: "FFD0D5DD" } },
          bottom: { style: "thin", color: { argb: "FFD0D5DD" } },
          right: { style: "thin", color: { argb: "FFD0D5DD" } },
        };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (index % 2)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF8FAFC" },
          };
      });
    });
    sheet.columns = [
      { width: 7 },
      { width: 18 },
      { width: 24 },
      { width: 18 },
      { width: 38 },
      { width: 16 },
      { width: 16 },
      { width: 30 },
      { width: 18 },
      { width: 36 },
      { width: 20 },
    ];
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    sheet.autoFilter = "A6:K6";
    const buffer = await workbook.xlsx.writeBuffer();
    const suffix =
      report.type === "attended"
        ? "participantes_confirmados"
        : "matriculas_registradas";
    return {
      buffer: Buffer.from(buffer),
      filename: `${suffix}_${filters.dateFrom}_${filters.dateTo}.xlsx`,
    };
  }
}

module.exports = ManagerDashboardService;
