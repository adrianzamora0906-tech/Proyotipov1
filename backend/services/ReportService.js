const db = require("../config/database");
const path = require("path");
const ExcelJS = require("exceljs");
const ManagerDashboardService = require("./ManagerDashboardService");
const isGeneralManager = (auth) =>
  Array.isArray(auth?.roles) && auth.roles.includes("GENERAL_MANAGER");
const requireFinancialReportAccess = (auth) => {
  if (isGeneralManager(auth)) return;
  const error = new Error("Solo Gerencia General puede consultar valores financieros.");
  error.status = 403;
  throw error;
};
function resolveCourseDateRange(filters = {}) {
  const from = filters.dateFrom || null,
    to = filters.dateTo || null;
  if (
    (from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) ||
    (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) ||
    (from && to && from > to)
  ) {
    const error = new Error("Rango de fechas inválido");
    error.status = 422;
    throw error;
  }
  return { from, to };
}
async function resolveUniversalScope(auth, filters = {}) {
  if (auth.global) {
    return { branchId: filters.branchId || null, province: filters.province || null, city: filters.city || null };
  }
  if (!(auth.roles || []).includes("BRANCH_ADMIN")) {
    return { branchId: auth.branchId, province: filters.province || null, city: filters.city || null };
  }
  const home = (await db.query("SELECT province,city FROM branches WHERE id=$1 AND active=TRUE", [auth.branchId])).rows[0];
  if (!home) {
    const error = new Error("La sucursal asignada no está disponible.");
    error.status = 403;
    throw error;
  }
  const requestedBranchId = filters.branchId || null;
  if (requestedBranchId) {
    const allowed = await db.query(
      "SELECT 1 FROM branches WHERE id=$1 AND active=TRUE AND LOWER(city)=LOWER($2)",
      [requestedBranchId, home.city],
    );
    if (!allowed.rows.length) {
      const error = new Error("No tienes acceso a sucursales de otro cantón.");
      error.status = 403;
      throw error;
    }
  }
  return { branchId: requestedBranchId, province: home.province || null, city: home.city || null };
}
class ReportService {
  static scopeBranch(auth, requested) {
    return auth.global ? requested || null : auth.branchId;
  }
  static async assistant(auth, input = {}) {
    const question = String(input.question || '').trim();
    if (!question) {
      const error = new Error('Escribe una pregunta para consultar');
      error.status = 422;
      throw error;
    }
    const normalize = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const text = normalize(question);
    if (!isGeneralManager(auth) && /(pago|ingres|cobrad|recaud|venta|deuda|saldo|pendiente|valor|dinero|cartera|\$)/.test(text)) {
      requireFinancialReportAccess(auth);
    }
    const branches = (await db.query('SELECT id,name,province,city FROM branches WHERE active=TRUE ORDER BY LENGTH(name) DESC')).rows;
    let branch = branches.find(item => text.includes(normalize(item.name)));
    if (!branch) branch = branches.find(item => text.includes(normalize(item.city)) && branches.filter(other => normalize(other.city) === normalize(item.city)).length === 1);
    if (!auth.global) branch = branches.find(item => item.id === auth.branchId) || null;
    const detectedCity = !branch && auth.global ? [...new Set(branches.map(item => item.city).filter(Boolean))].find(city => text.includes(normalize(city))) : null;
    const branchId = branch?.id || null;
    const branchLabel = branch ? ` en ${branch.name.trim()}` : detectedCity ? ` en el cantón ${detectedCity}` : ' en todas las sucursales';
    const courseType = /moto|clase\s*a/.test(text) ? 'moto' : /carro|automovil|clase\s*b/.test(text) ? 'carro' : null;
    const courseSql = courseType === 'moto' ? "LOWER(c.name) LIKE '%moto%'" : courseType === 'carro' ? "(LOWER(c.name) LIKE '%autom%' OR LOWER(c.name) LIKE '%carro%')" : 'TRUE';
    const now = new Date();
    const localDate = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    let from = input.dateFrom || localDate(new Date(now.getFullYear(), now.getMonth(), 1));
    let to = input.dateTo || localDate(now);
    let periodLabel = `del ${from} al ${to}`;
    if (/mes (anterior|pasado)/.test(text)) {
      from = localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to = localDate(new Date(now.getFullYear(), now.getMonth(), 0));
      periodLabel = 'durante el mes anterior';
    } else if (/hoy|dia de hoy/.test(text)) {
      from = to = localDate(now);
      periodLabel = 'hoy';
    } else if (/esta semana|semana actual/.test(text)) {
      const start = new Date(now); start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      from = localDate(start); to = localDate(now); periodLabel = 'durante esta semana';
    } else if (/este mes|mes actual/.test(text)) {
      from = localDate(new Date(now.getFullYear(), now.getMonth(), 1)); to = localDate(now); periodLabel = 'durante este mes';
    }
    const scope = auth.global
      ? '($1::uuid IS NULL OR b.id=$1) AND ($4::text IS NULL OR LOWER(b.city)=LOWER($4))'
      : 'b.id=$1 AND $4::text IS NULL';
    const params = [branchId || auth.branchId, from, to, detectedCity];
    const scalar = async (sql, values = params) => (await db.query(sql, values)).rows[0];
    const formatNumber = value => new Intl.NumberFormat('es-EC').format(Number(value) || 0);
    const formatMoney = value => new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(Number(value) || 0);
    const result = {
      answer: '',
      intent: null,
      filters: {
        branchId,
        province: branch?.province || '',
        city: branch?.city || detectedCity || '',
        dateFrom: from,
        dateTo: to,
        courseType,
      },
      reportType: null,
    };

    if (/proxim|siguiente/.test(text) && /curso|ciclo/.test(text)) {
      const row = await scalar(`SELECT cc.id,c.name course,b.name branch,cc.start_date,cc.end_date,COALESCE(cc.published_capacity,cc.capacity_per_instructor)::int capacity,COUNT(DISTINCT ccsa.student_id)::int students
        FROM course_cycles cc JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id
        LEFT JOIN course_cycle_schedule_assignments ccsa ON ccsa.cycle_id=cc.id AND ccsa.status='activo'
        WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.start_date>=CURRENT_DATE AND $2::date IS NOT NULL AND $3::date IS NOT NULL AND ${scope} AND ${courseSql}
        GROUP BY cc.id,c.name,b.name ORDER BY cc.start_date LIMIT 1`);
      result.intent = 'next_course'; result.reportType = 'cycles';
      result.answer = row ? `El próximo curso${branchLabel} es ${row.course}, inicia el ${new Date(row.start_date).toLocaleDateString('es-EC')} y tiene ${row.students} estudiantes de ${row.capacity} cupos.` : `No hay un próximo curso programado${branchLabel} con esos criterios.`;
    } else if (/pendiente|deuda|saldo/.test(text) && /valor|cuanto|total|dinero|pago/.test(text)) {
      const row = await scalar(`SELECT COALESCE(SUM(p.balance),0)::numeric value FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id WHERE p.status<>'anulado' AND p.balance>0 AND e.created_at::date BETWEEN $2::date AND $3::date AND ${scope} AND ${courseSql}`);
      result.intent = 'pending_balance'; result.reportType = 'payments';
      result.answer = `El saldo pendiente${branchLabel} es ${formatMoney(row.value)} ${periodLabel}.`;
    } else if (/venta/.test(text) && !/ingres|cobr|recaud|dinero|valor|monto/.test(text)) {
      const report = await this.universal(auth, {type:'sales',branchId:branchId || undefined,city:detectedCity || undefined,dateFrom:from,dateTo:to,courseType});
      result.intent = 'sales'; result.reportType = 'sales';
      result.answer = `${formatNumber(report.summary.sales)} inscripciones por sucursal de venta${branchLabel} ${periodLabel}.`;
    } else if (/ingres|cobr|recaud|venta/.test(text)) {
      const row = await scalar(`SELECT COALESCE(SUM(pd.amount),0)::numeric value FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id WHERE pd.status='ACTIVE' AND pd.created_at::date BETWEEN $2::date AND $3::date AND ${scope} AND ${courseSql}`);
      result.intent = 'collected'; result.reportType = 'payments';
      result.answer = `Los ingresos cobrados${branchLabel} fueron ${formatMoney(row.value)} ${periodLabel}.`;
    } else if (/terminaron|finalizaron|completaron|realizaron/.test(text) && /curso|estudiante|persona/.test(text)) {
      const row = await scalar(`SELECT COUNT(DISTINCT ccsa.student_id)::int value FROM course_cycle_schedule_assignments ccsa JOIN course_cycles cc ON cc.id=ccsa.cycle_id JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.end_date BETWEEN $2::date AND $3::date AND ${scope} AND ${courseSql}`);
      result.intent = 'completed_students'; result.reportType = 'cycles';
      result.answer = `${formatNumber(row.value)} estudiantes finalizaron cursos${branchLabel} ${periodLabel}.`;
    } else if (/activo|cursando|recibiendo/.test(text) && /estudiante|persona/.test(text)) {
      const row = await scalar(`SELECT COUNT(DISTINCT ccsa.student_id)::int value FROM course_cycle_schedule_assignments ccsa JOIN course_cycles cc ON cc.id=ccsa.cycle_id JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.start_date<=CURRENT_DATE AND cc.end_date>=CURRENT_DATE AND ccsa.status='activo' AND $2::date IS NOT NULL AND $3::date IS NOT NULL AND ${scope} AND ${courseSql}`);
      result.intent = 'active_students'; result.reportType = 'active_students';
      result.answer = `Hay ${formatNumber(row.value)} estudiantes cursando actualmente${branchLabel}.`;
    } else if (/matricul|inscri|registr/.test(text) && /cuant|total|numero|persona|estudiante/.test(text)) {
      const row = await scalar(`SELECT COUNT(DISTINCT e.student_id)::int value FROM enrollments e JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id WHERE e.created_at::date BETWEEN $2::date AND $3::date AND ${scope} AND ${courseSql}`);
      result.intent = 'enrollments'; result.reportType = from === to ? 'today_enrollments' : 'enrollments';
      result.answer = `Se registraron ${formatNumber(row.value)} estudiantes${branchLabel} ${periodLabel}.`;
    } else if (/instructor|profesor/.test(text)) {
      const row = await scalar(`SELECT COUNT(DISTINCT ip.id)::int value FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches b ON b.id=u.branch_id WHERE ip.deleted_at IS NULL AND ip.status='activo' AND $2::date IS NOT NULL AND $3::date IS NOT NULL AND ${scope} AND ($5::text IS NULL OR ip.practice_area=$5)`, [...params, courseType]);
      result.intent = 'instructors'; result.reportType = 'instructors';
      result.answer = `Hay ${formatNumber(row.value)} instructores activos${branchLabel}${courseType ? ` para ${courseType}` : ''}.`;
    } else if (/servicio|psico|recuperaci/.test(text)) {
      const row = await scalar(`SELECT COUNT(*)::int value FROM service_transactions st JOIN branches b ON b.id=st.branch_id WHERE (st.student_id IS NULL OR EXISTS(SELECT 1 FROM students visible WHERE visible.id=st.student_id AND visible.status <> 'inhabilitado')) AND st.performed_at::date BETWEEN $2::date AND $3::date AND ${scope}`);
      result.intent = 'services'; result.reportType = 'services';
      result.answer = `Se realizaron ${formatNumber(row.value)} servicios independientes${branchLabel} ${periodLabel}.`;
    } else {
      result.intent = 'unsupported';
      result.answer = 'No pude identificar exactamente el dato solicitado. Puedes preguntar por matrículas, estudiantes activos o finalizados, próximo curso y cupos, ingresos, saldo pendiente, instructores o servicios; incluye una sucursal y un periodo si deseas una respuesta específica.';
    }
    return result;
  }
  static async dashboard(auth, filters = {}) {
    const branchId = this.scopeBranch(auth, filters.branchId);
    const r = await db.query(
      `SELECT (SELECT COUNT(*) FROM branches WHERE active=TRUE AND ($1::uuid IS NULL OR id=$1))::int active_branches,(SELECT COUNT(*) FROM users WHERE active=TRUE AND ($1::uuid IS NULL OR branch_id=$1))::int active_users,(SELECT COUNT(DISTINCT user_id) FROM user_sessions WHERE revoked_at IS NULL AND expires_at>NOW() AND last_activity_at>NOW()-INTERVAL '30 minutes')::int connected_users,(SELECT COUNT(*) FROM students WHERE status <> 'inhabilitado' AND ($1::uuid IS NULL OR branch_id=$1))::int students,(SELECT COUNT(*) FROM enrollments WHERE status='activo' AND ($1::uuid IS NULL OR branch_id=$1))::int active_enrollments`,
      [branchId],
    );
    return r.rows[0];
  }
  static async financial(auth, filters = {}) {
    requireFinancialReportAccess(auth);
    const branchId = this.scopeBranch(auth, filters.branchId),
      limit = Math.min(Number(filters.limit) || 50, 100),
      page = Math.max(Number(filters.page) || 1, 1);
    const r = await db.query(
      `SELECT p.id,p.status,p.total,p.final_amount,p.balance,e.branch_id,e.course_id,e.enrollment_date,s.id student_id,s.first_name,s.last_name FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id WHERE ($1::uuid IS NULL OR e.branch_id=$1) AND ($2::text IS NULL OR p.status=$2) ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
      [branchId, filters.status || null, limit, (page - 1) * limit],
    );
    return { data: r.rows, pagination: { page, limit } };
  }
  static async courseCycles(auth, filters = {}) {
    const branchId = this.scopeBranch(auth, filters.branchId);
    const range = resolveCourseDateRange(filters);
    const rows = (
      await db.query(
        `SELECT cc.id,cc.code,cc.modality,cc.vehicle_type,c.name course_name,cc.start_date,cc.end_date,b.name branch_name,b.province,b.city,CASE WHEN CURRENT_DATE BETWEEN cc.start_date AND cc.end_date THEN 'vigente' WHEN cc.end_date<CURRENT_DATE THEN 'finalizado' ELSE 'proximo' END report_status,COUNT(DISTINCT CASE WHEN a.status='activo' AND e.status NOT IN ('completado','cancelado') THEN a.student_id END)::int student_count FROM course_cycles cc JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id LEFT JOIN course_cycle_schedule_assignments a ON a.cycle_id=cc.id LEFT JOIN enrollments e ON e.id=a.enrollment_id WHERE cc.active=TRUE AND cc.deleted_at IS NULL AND cc.status<>'cancelado' AND ($1::uuid IS NULL OR cc.branch_id=$1) AND ($2::uuid IS NULL OR cc.course_id=$2) AND ($3::text IS NULL OR LOWER(b.province)=LOWER($3)) AND ($4::text IS NULL OR LOWER(b.city)=LOWER($4)) AND ($5::date IS NULL OR cc.end_date >= $5::date) AND ($6::date IS NULL OR cc.start_date <= $6::date) GROUP BY cc.id,c.id,b.id ORDER BY cc.start_date DESC`,
        [
          branchId,
          filters.courseId || null,
          filters.province || null,
          filters.city || null,
          range.from,
          range.to,
        ],
      )
    ).rows;
    const filtered = filters.status
      ? rows.filter((x) => x.report_status === filters.status)
      : rows;
    const data =
      filters.dateFrom || filters.dateTo
        ? filtered
        : filters.status
          ? filtered.slice(0, 6)
          : [
              ...filtered
                .filter((x) => x.report_status === "vigente")
                .slice(0, 3),
              ...filtered
                .filter((x) => x.report_status === "finalizado")
                .slice(0, 3),
            ];
    const branches = await db.query(
      `SELECT id,name,province,city FROM branches WHERE active=TRUE AND ($1::uuid IS NULL OR id=$1) ORDER BY province,city,name`,
      [branchId],
    );
    const courses = await db.query(
      `SELECT DISTINCT c.id,c.name FROM course_cycles cc JOIN courses c ON c.id=cc.course_id WHERE cc.active=TRUE AND ($1::uuid IS NULL OR cc.branch_id=$1) ORDER BY c.name`,
      [branchId],
    );
    return {
      data,
      filters: { branches: branches.rows, courses: courses.rows },
    };
  }
  static async courseCycleStudents(auth, cycleId) {
    const branchId = this.scopeBranch(auth, null);
    const cycle = await db.query(
      `SELECT cc.id,cc.code,c.name course_name,b.name branch_name,b.province,b.city,cc.start_date,cc.end_date FROM course_cycles cc JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id WHERE cc.id=$1 AND ($2::uuid IS NULL OR cc.branch_id=$2)`,
      [cycleId, branchId],
    );
    if (!cycle.rows.length) {
      const error = new Error("Curso no encontrado");
      error.status = 404;
      throw error;
    }
    const students = await db.query(
      `SELECT DISTINCT s.id,s.identification,s.first_name,s.last_name,
       TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.birth_date,s.blood_type,
       s.address,s.email,s.phone,e.status enrollment_status,e.enrollment_date,
       e.created_at registration_date,
       COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''),ru.username,'Sin identificar') registered_by
       FROM course_cycle_schedule_assignments a
       JOIN students s ON s.status <> 'inhabilitado' AND s.id=a.student_id
       JOIN enrollments e ON e.id=a.enrollment_id
       LEFT JOIN users ru ON ru.id=e.created_by
       WHERE a.cycle_id=$1 AND a.status='activo' AND e.status NOT IN ('completado','cancelado')
       ORDER BY s.last_name,s.first_name`,
      [cycleId],
    );
    return { cycle: cycle.rows[0], students: students.rows };
  }
  static async exportCourseCycleStudents(auth, cycleId) {
    const report = await this.courseCycleStudents(auth, cycleId);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.resolve(__dirname, "../../documentos/Plantilla del reporte.xlsx"));
    const sheet = workbook.worksheets[0];
    const columns = [
      ["identification", "CÉDULA"], ["name", "ESTUDIANTE"],
      ["email", "CORREO"], ["phone", "TELÉFONO"],
      ["birth_date", "FECHA DE NACIMIENTO", "date"], ["blood_type", "TIPO DE SANGRE"],
      ["address", "DIRECCIÓN"], ["enrollment_date", "FECHA DE MATRÍCULA", "date"],
      ["registration_date", "FECHA DE REGISTRO", "dateTime"],
      ["registered_by", "REGISTRADO POR"], ["enrollment_status", "ESTADO"],
    ];
    const headerStyle = { ...sheet.getRow(6).getCell(1).style };
    const dataStyle = { ...sheet.getRow(7).getCell(1).style };
    for (let rowIndex = 6; rowIndex <= sheet.rowCount; rowIndex += 1)
      for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1)
        sheet.getRow(rowIndex).getCell(columnIndex).value = null;
    ["A1:K1", "A2:K2", "A3:K3", "A4:K4"].forEach((range) => {
      if (sheet.model.merges.includes(range)) sheet.unMergeCells(range);
    });
    const lastColumn = sheet.getColumn(columns.length).letter;
    [1, 2, 3, 4].forEach((row) => sheet.mergeCells(`A${row}:${lastColumn}${row}`));
    if (sheet.columnCount > columns.length)
      sheet.spliceColumns(columns.length + 1, sheet.columnCount - columns.length);
    sheet.name = "ESTUDIANTES DEL CICLO";
    sheet.getCell("A3").value = `ESTUDIANTES MATRICULADOS · ${report.cycle.code}`;
    sheet.getCell("A4").value = `Curso: ${report.cycle.course_name}   |   Sucursal: ${report.cycle.branch_name}   |   Periodo: ${String(report.cycle.start_date).slice(0, 10)} al ${String(report.cycle.end_date).slice(0, 10)}`;
    columns.forEach(([, label], index) => {
      const cell = sheet.getRow(6).getCell(index + 1); cell.value = label; cell.style = headerStyle;
    });
    report.students.forEach((student, rowIndex) => {
      const row = sheet.getRow(rowIndex + 7);
      columns.forEach(([key, , kind], columnIndex) => {
        const cell = row.getCell(columnIndex + 1);
        cell.value = (kind === "date" || kind === "dateTime") && student[key] ? new Date(student[key]) : student[key] ?? "";
        cell.style = dataStyle;
        if (kind === "date") cell.numFmt = "dd/mm/yyyy";
        if (kind === "dateTime") cell.numFmt = "dd/mm/yyyy hh:mm";
      });
    });
    columns.forEach(([, label], index) => {
      sheet.getColumn(index + 1).width = Math.max(15, Math.min(label.length + 8, 34));
    });
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: columns.length } };
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    return {
      buffer: await workbook.xlsx.writeBuffer(),
      filename: `estudiantes_ciclo_${String(report.cycle.code).replace(/[^a-z0-9_-]+/gi, "_")}.xlsx`,
    };
  }
  static async universal(auth, filters = {}) {
    const reportScope = await resolveUniversalScope(auth, filters),
      branchId = reportScope.branchId,
      range = resolveCourseDateRange(filters),
      type = filters.type || "today_enrollments",
      limit = Math.min(Math.max(Number(filters.limit) || 500, 1), 1000);
    if (type === "payments") requireFinancialReportAccess(auth);
    const today = new Date(),
      defaultTo = today.toISOString().slice(0, 10),
      defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1)
        .toISOString()
        .slice(0, 10),
      from = range.from || defaultFrom,
      to = range.to || defaultTo,
      province = reportScope.province,
      city = reportScope.city,
      courseType = ["moto", "carro"].includes(filters.courseType) ? filters.courseType : null;
    const params = [branchId, from, to, province, city, limit, courseType],
      summaryParams = [branchId, from, to, province, city, courseType],
      branchScope = `($1::uuid IS NULL OR b.id=$1) AND ($4::text IS NULL OR LOWER(b.province)=LOWER($4)) AND ($5::text IS NULL OR LOWER(b.city)=LOWER($5))`,
      courseScope = `($7::text IS NULL OR ($7='moto' AND LOWER(c.name) LIKE '%moto%') OR ($7='carro' AND (LOWER(c.name) LIKE '%autom%' OR LOWER(c.name) LIKE '%carro%')))`,
      summaryCourseScope = `($6::text IS NULL OR ($6='moto' AND LOWER(c.name) LIKE '%moto%') OR ($6='carro' AND (LOWER(c.name) LIKE '%autom%' OR LOWER(c.name) LIKE '%carro%')))`;
    const practiceFrom = `FROM additional_driving_practices ap
      JOIN students s ON s.id=ap.student_id AND s.status <> 'inhabilitado'
      JOIN branches b ON b.id=ap.branch_id
      JOIN instructor_profiles ip ON ip.id=ap.instructor_id
      CROSS JOIN LATERAL (SELECT CASE WHEN LOWER(ip.practice_area)='moto'
        THEN 'Practicas adicionales - Moto' ELSE 'Practicas adicionales - Automovil' END name) c`;
    const renewalFrom = `FROM service_transactions st
      JOIN students s ON s.id=st.student_id AND s.status <> 'inhabilitado'
      JOIN branches b ON b.id=st.branch_id
      CROSS JOIN LATERAL (SELECT 'Renovacion de licencia'::text name) c`;
    const [branches, summary] = await Promise.all([
      db.query(
        `SELECT id,name,province,city FROM branches WHERE active=TRUE AND ($1::uuid IS NULL OR id=$1) AND ($2::text IS NULL OR LOWER(province)=LOWER($2)) AND ($3::text IS NULL OR LOWER(city)=LOWER($3)) ORDER BY province,city,name`,
        [branchId, province, city],
      ),
      db.query(
        `SELECT
        ((SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.status <> 'inhabilitado' JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id WHERE e.created_at::date=CURRENT_DATE AND ${branchScope} AND ${summaryCourseScope})
          + (SELECT COUNT(*) ${practiceFrom} WHERE ap.created_at::date=CURRENT_DATE AND ${branchScope} AND ${summaryCourseScope})
          + (SELECT COUNT(*) ${renewalFrom} WHERE st.result='RENOVACION_LICENCIA' AND st.created_at::date=CURRENT_DATE AND ${branchScope} AND ${summaryCourseScope}))::int today_enrollments,
        (SELECT COUNT(DISTINCT s.id) FROM students s JOIN enrollments e ON s.status <> 'inhabilitado' AND e.student_id=s.id JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id JOIN course_cycle_schedule_assignments a ON a.enrollment_id=e.id JOIN course_cycles cc ON cc.id=a.cycle_id WHERE cc.start_date<=CURRENT_DATE AND cc.end_date>=CURRENT_DATE AND a.status='activo' AND LOWER(e.status) IN ('activo','en_curso') AND EXISTS(SELECT 1 FROM payments p JOIN payment_details pd ON pd.payment_id=p.id WHERE p.enrollment_id=e.id AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO')) AND ${branchScope} AND ${summaryCourseScope})::int active_students,
        (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.status <> 'inhabilitado' JOIN branches b ON b.id=e.sales_branch_id JOIN courses c ON c.id=e.course_id WHERE e.enrollment_date >= $2::date AND e.enrollment_date < ($3::date+INTERVAL '1 day') AND LOWER(e.status) NOT IN ('cancelado','inhabilitado') AND ${branchScope} AND ${summaryCourseScope})::int sales,
        (SELECT COUNT(*) FROM enrollments e JOIN students s ON s.id=e.student_id AND s.status <> 'inhabilitado' JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id WHERE e.enrollment_date BETWEEN $2::date AND $3::date AND ${branchScope} AND ${summaryCourseScope})::int enrollments,
        (SELECT COUNT(*) FROM course_cycles cc JOIN branches b ON b.id=cc.branch_id JOIN courses c ON c.id=cc.course_id WHERE cc.active AND cc.deleted_at IS NULL AND cc.start_date<=$3::date AND cc.end_date>=$2::date AND ${branchScope} AND ${summaryCourseScope})::int cycles,
        (SELECT COUNT(DISTINCT ip.id) FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches b ON b.id=u.branch_id WHERE ip.deleted_at IS NULL AND LOWER(ip.status)='activo' AND ${branchScope} AND ($6::text IS NULL OR LOWER(ip.practice_area)=$6))::int instructors,
        (SELECT COALESCE(SUM(pd.amount),0) FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.id=e.student_id AND s.status <> 'inhabilitado' JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id WHERE pd.created_at BETWEEN $2::date AND ($3::date+INTERVAL '1 day') AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO') AND ${branchScope} AND ${summaryCourseScope})::numeric collected,
        (SELECT COUNT(*) FROM service_transactions st JOIN branches b ON b.id=st.branch_id WHERE (st.student_id IS NULL OR EXISTS(SELECT 1 FROM students visible WHERE visible.id=st.student_id AND visible.status <> 'inhabilitado')) AND st.performed_at BETWEEN $2::date AND ($3::date+INTERVAL '1 day') AND st.status='PAID' AND ${branchScope})::int services`,
        summaryParams,
      ),
    ]);
    let rows = [];
    if (type === "today_enrollments")
      rows = (
        await db.query(
          `SELECT * FROM (
           SELECT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,c.name course,b.name branch,e.created_at::date enrollment_date,e.status,COALESCE(p.final_amount,0)::numeric amount,COALESCE(p.balance,0)::numeric balance,COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''),ru.username,'Sin identificar') registered_by,e.created_at
           FROM enrollments e JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id LEFT JOIN users ru ON ru.id=e.created_by LEFT JOIN payments p ON p.enrollment_id=e.id
           WHERE $2::date IS NOT NULL AND $3::date IS NOT NULL
             AND e.created_at::date=CURRENT_DATE AND ${branchScope} AND ${courseScope}
           UNION ALL
           SELECT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,
             c.name course,b.name branch,ap.created_at::date enrollment_date,
             CASE ap.status WHEN 'SCHEDULED' THEN 'Programada' WHEN 'IN_PROGRESS' THEN 'En curso'
               WHEN 'COMPLETED' THEN 'Completada' ELSE 'Cancelada' END status,
             ap.total_amount::numeric amount,
             CASE WHEN st.status='PENDING' THEN ap.total_amount ELSE 0 END::numeric balance,
             COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''),ru.username,'Sin identificar') registered_by,ap.created_at
           ${practiceFrom}
           JOIN service_transactions st ON st.id=ap.transaction_id
           LEFT JOIN users ru ON ru.id=ap.created_by
           WHERE ap.created_at::date=CURRENT_DATE AND ${branchScope} AND ${courseScope}
           UNION ALL
           SELECT st.customer_identification identification,st.customer_name name,
             st.customer_email email,st.customer_phone phone,c.name course,b.name branch,
             st.created_at::date enrollment_date,
             CASE st.status WHEN 'PAID' THEN 'Pago confirmado' WHEN 'PENDING' THEN 'Pendiente pago' ELSE 'Anulada' END status,
             st.amount::numeric amount,CASE WHEN st.status='PENDING' THEN st.amount ELSE 0 END::numeric balance,
             COALESCE(NULLIF(TRIM(CONCAT(ru.first_name,' ',ru.last_name)),''),ru.username,'Sin identificar') registered_by,st.created_at
           ${renewalFrom}
           LEFT JOIN users ru ON ru.id=st.created_by
           WHERE st.result='RENOVACION_LICENCIA' AND st.created_at::date=CURRENT_DATE AND ${branchScope} AND ${courseScope}
           ) registrations ORDER BY created_at DESC,name LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "active_students")
      rows = (
        await db.query(
          `SELECT DISTINCT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,c.name course,b.name branch,cc.start_date,cc.end_date,TRIM(CONCAT(iu.first_name,' ',iu.last_name)) instructor,COALESCE(ru.username,TRIM(CONCAT(ru.first_name,' ',ru.last_name))) registered_by
      FROM students s JOIN enrollments e ON s.status <> 'inhabilitado' AND e.student_id=s.id JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id JOIN course_cycle_schedule_assignments a ON a.enrollment_id=e.id JOIN course_cycles cc ON cc.id=a.cycle_id LEFT JOIN instructor_profiles ip ON ip.id=a.instructor_id LEFT JOIN users iu ON iu.id=ip.user_id LEFT JOIN users ru ON ru.id=e.created_by
      WHERE $2::date IS NOT NULL AND $3::date IS NOT NULL AND cc.start_date<=CURRENT_DATE AND cc.end_date>=CURRENT_DATE AND a.status='activo' AND LOWER(e.status) IN ('activo','en_curso') AND EXISTS(SELECT 1 FROM payments p JOIN payment_details pd ON pd.payment_id=p.id WHERE p.enrollment_id=e.id AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO')) AND ${branchScope} AND ${courseScope} ORDER BY b.name,name LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "sales")
      rows = (
        await db.query(
          `SELECT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,c.name course,b.name branch,
           academic.name academic_branch,e.sales_branch_source,e.enrollment_date,e.status,
           COALESCE(p.final_amount,0)::numeric amount,COALESCE(p.balance,0)::numeric balance,
           COALESCE(ru.username,TRIM(CONCAT(ru.first_name,' ',ru.last_name))) registered_by
           FROM enrollments e JOIN students s ON s.id=e.student_id AND s.status<>'inhabilitado'
           JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.sales_branch_id
           JOIN branches academic ON academic.id=e.branch_id LEFT JOIN users ru ON ru.id=e.created_by
           LEFT JOIN LATERAL (SELECT final_amount,balance FROM payments WHERE enrollment_id=e.id AND status<>'anulado' ORDER BY created_at DESC,id DESC LIMIT 1) p ON TRUE
           WHERE e.enrollment_date >= $2::date AND e.enrollment_date < ($3::date+INTERVAL '1 day')
           AND LOWER(e.status) NOT IN ('cancelado','inhabilitado') AND ${branchScope} AND ${courseScope}
           ORDER BY e.enrollment_date DESC,name,e.id LIMIT $6`, params,
        )
      ).rows;
    else if (type === "enrollments")
      rows = (
        await db.query(
          `SELECT s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,s.email,s.phone,c.name course,b.name branch,e.enrollment_date,e.status,COALESCE(p.final_amount,0)::numeric amount,COALESCE(p.balance,0)::numeric balance,COALESCE(ru.username,TRIM(CONCAT(ru.first_name,' ',ru.last_name))) registered_by FROM enrollments e JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id JOIN courses c ON c.id=e.course_id JOIN branches b ON b.id=e.branch_id LEFT JOIN users ru ON ru.id=e.created_by LEFT JOIN payments p ON p.enrollment_id=e.id WHERE e.enrollment_date BETWEEN $2::date AND $3::date AND ${branchScope} AND ${courseScope} ORDER BY e.enrollment_date DESC,name LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "cycles")
      rows = (
        await db.query(
          `SELECT cc.id,cc.code,c.name course,b.name branch,cc.start_date,cc.end_date,CASE WHEN cc.start_date>CURRENT_DATE THEN 'Próximo' WHEN cc.end_date<CURRENT_DATE THEN 'Finalizado' ELSE 'En ejecución' END status,COALESCE(cc.published_capacity,cc.capacity_per_instructor)::int capacity,COUNT(DISTINCT a.enrollment_id)::int students FROM course_cycles cc JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id LEFT JOIN course_cycle_schedule_assignments a ON a.cycle_id=cc.id AND a.status='activo' WHERE cc.active AND cc.deleted_at IS NULL AND cc.start_date<=$3::date AND cc.end_date>=$2::date AND ${branchScope} AND ${courseScope} GROUP BY cc.id,c.name,b.name ORDER BY cc.start_date DESC LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "instructors")
      rows = (
        await db.query(
          `SELECT TRIM(CONCAT(u.first_name,' ',u.last_name)) name,u.email,b.name branch,ip.practice_area,COUNT(DISTINCT eia.enrollment_id)::int students,COUNT(ps.id) FILTER(WHERE UPPER(ps.status)='COMPLETADA')::int completed_classes,COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(ps.actual_end,ps.scheduled_end)-COALESCE(ps.actual_start,ps.scheduled_start)))/3600) FILTER(WHERE UPPER(ps.status)='COMPLETADA')::numeric,1),0)::numeric hours FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id JOIN branches b ON b.id=u.branch_id LEFT JOIN enrollment_instructor_assignments eia ON eia.active=TRUE AND eia.instructor_id=ip.id AND eia.start_date<=$3::date AND eia.end_date>=$2::date LEFT JOIN practical_sessions ps ON ps.instructor_id=ip.id AND ps.scheduled_start BETWEEN $2::date AND ($3::date+INTERVAL '1 day') AND ps.deleted_at IS NULL WHERE ip.deleted_at IS NULL AND ${branchScope} AND ($7::text IS NULL OR LOWER(ip.practice_area)=$7) GROUP BY ip.id,u.first_name,u.last_name,u.email,b.name ORDER BY hours DESC,name LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "payments")
      rows = (
        await db.query(
          `SELECT pd.created_at::date payment_date,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,b.name branch,c.name course,pd.payment_method,pd.amount::numeric,p.balance::numeric,p.status FROM payment_details pd JOIN payments p ON p.id=pd.payment_id JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.status <> 'inhabilitado' AND s.id=e.student_id JOIN branches b ON b.id=e.branch_id JOIN courses c ON c.id=e.course_id WHERE pd.created_at BETWEEN $2::date AND ($3::date+INTERVAL '1 day') AND UPPER(pd.status) IN ('ACTIVE','ACTIVO','CONFIRMADO') AND ${branchScope} AND ${courseScope} ORDER BY pd.created_at DESC LIMIT $6`,
          params,
        )
      ).rows;
    else if (type === "services")
      rows = (
        await db.query(
          `SELECT st.performed_at::date service_date,st.customer_identification identification,st.customer_name name,sc.name service,b.name branch,st.payment_method,st.amount::numeric,st.status FROM service_transactions st JOIN service_catalog sc ON sc.id=st.service_id JOIN branches b ON b.id=st.branch_id WHERE (st.student_id IS NULL OR EXISTS(SELECT 1 FROM students visible WHERE visible.id=st.student_id AND visible.status <> 'inhabilitado')) AND st.performed_at BETWEEN $2::date AND ($3::date+INTERVAL '1 day') AND ${branchScope} ORDER BY st.performed_at DESC LIMIT $6`,
          params.slice(0, 6),
        )
      ).rows;
    else {
      const error = new Error("Tipo de reporte no soportado");
      error.status = 422;
      throw error;
    }
    const canSeeFinancialValues = isGeneralManager(auth);
    const visibleSummary = { ...summary.rows[0] };
    if (!canSeeFinancialValues) delete visibleSummary.collected;
    const visibleRows = canSeeFinancialValues
      ? rows
      : rows.map(({ amount, balance, ...row }) => row);
    return {
      type,
      period: { from, to },
      summary: visibleSummary,
      rows: visibleRows,
      filters: { branches: branches.rows },
    };
  }
  static async exportUniversal(auth, filters = {}) {
    const report = await this.universal(auth, { ...filters, limit: 1000 });
    let academicReport = null;
    if (report.type === "instructors") {
      academicReport = await ManagerDashboardService.academic(auth, filters);
      report.rows = (academicReport.instructors || [])
        .filter((item) => !filters.courseType || String(item.practice_area || "").toLowerCase() === filters.courseType)
        .map((item) => ({
        ...item,
        instructor_display: item.name,
        branch: item.branch_name,
        hours: item.taught_hours,
        }));
    }
    const definitions = {
      sales: { title: "VENTAS POR SUCURSAL", columns: [["identification", "CEDULA"], ["name", "ESTUDIANTE"], ["course", "CURSO"], ["branch", "SUCURSAL DE VENTA"], ["academic_branch", "SUCURSAL DE FORMACION"], ["registered_by", "INSCRITO POR"], ["enrollment_date", "INSCRIPCION", "date"], ["status", "ESTADO"], ["amount", "VALOR", "money"], ["balance", "PENDIENTE", "money"]] },
      today_enrollments: { title: "REGISTRADOS HOY", columns: [["identification", "CÉDULA"], ["name", "ESTUDIANTE"], ["course", "CURSO"], ["branch", "SUCURSAL"], ["registered_by", "REGISTRADO POR"], ["enrollment_date", "FECHA DE REGISTRO", "date"], ["amount", "VALOR", "money"], ["balance", "PENDIENTE", "money"]] },
      active_students: { title: "ESTUDIANTES ACTIVOS", columns: [["identification", "CÉDULA"], ["name", "ESTUDIANTE"], ["course", "CURSO"], ["branch", "SUCURSAL"], ["registered_by", "REGISTRADO POR"], ["instructor", "INSTRUCTOR"], ["start_date", "INICIO", "date"], ["end_date", "FIN", "date"]] },
      enrollments: { title: "MATRÍCULAS REGISTRADAS", columns: [["identification", "CÉDULA"], ["name", "ESTUDIANTE"], ["course", "CURSO"], ["branch", "SUCURSAL"], ["registered_by", "REGISTRADO POR"], ["enrollment_date", "MATRÍCULA", "date"], ["status", "ESTADO"], ["amount", "VALOR", "money"], ["balance", "PENDIENTE", "money"]] },
      cycles: { title: "CURSOS Y CICLOS", columns: [["code", "CICLO"], ["course", "CURSO"], ["branch", "SUCURSAL"], ["start_date", "INICIO", "date"], ["end_date", "FIN", "date"], ["students", "ESTUDIANTES"], ["capacity", "CAPACIDAD"], ["status", "ESTADO"]] },
      instructors: { title: "ACTIVIDAD DE INSTRUCTORES", columns: [["instructor_display", "INSTRUCTOR"], ["branch", "SUCURSAL"], ["courses", "CURSOS"], ["car_students", "ALUMNOS DE CARRO"], ["moto_students", "ALUMNOS DE MOTO"], ["students", "TOTAL ALUMNOS"], ["scheduled_classes", "CLASES PROGRAMADAS"], ["hours", "HORAS IMPARTIDAS"], ["practical_classes", "CLASES PRACTICAS"], ["exams_taken", "EXAMENES TOMADOS"]] },
      payments: { title: "PAGOS E INGRESOS", columns: [["payment_date", "FECHA", "date"], ["identification", "CÉDULA"], ["name", "ESTUDIANTE"], ["branch", "SUCURSAL"], ["course", "CURSO"], ["payment_method", "MÉTODO"], ["amount", "COBRADO", "money"], ["balance", "PENDIENTE", "money"]] },
      services: { title: "SERVICIOS INDEPENDIENTES", columns: [["service_date", "FECHA", "date"], ["identification", "IDENTIFICACIÓN"], ["name", "PERSONA"], ["service", "SERVICIO"], ["branch", "SUCURSAL"], ["payment_method", "MÉTODO"], ["amount", "VALOR", "money"], ["status", "ESTADO"]] },
    };
    const definition = definitions[report.type] || definitions.today_enrollments;
    if (!isGeneralManager(auth)) {
      definition.columns = definition.columns.filter(([, , kind]) => kind !== "money");
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.resolve(__dirname, "../../documentos/Plantilla del reporte.xlsx"));
    const sheet = workbook.worksheets[0], headerStyle = { ...sheet.getRow(6).getCell(1).style }, dataStyle = { ...sheet.getRow(7).getCell(1).style };
    for (let rowIndex = 6; rowIndex <= sheet.rowCount; rowIndex += 1) {
      for (let columnIndex = 1; columnIndex <= sheet.columnCount; columnIndex += 1) {
        sheet.getRow(rowIndex).getCell(columnIndex).value = null;
      }
    }
    ["A1:K1", "A2:K2", "A3:K3", "A4:K4"].forEach((range) => {
      if (sheet.model.merges.includes(range)) sheet.unMergeCells(range);
    });
    const lastColumn = sheet.getColumn(definition.columns.length).letter;
    [1, 2, 3, 4].forEach((row) =>
      sheet.mergeCells(`A${row}:${lastColumn}${row}`),
    );
    if (sheet.columnCount > definition.columns.length) {
      sheet.spliceColumns(
        definition.columns.length + 1,
        sheet.columnCount - definition.columns.length,
      );
    }
    sheet.name = definition.title.slice(0, 31);
    sheet.getCell("A3").value = definition.title;
    const selectedBranch = report.filters.branches.find((item) => String(item.id) === String(filters.branchId));
    sheet.getCell("A4").value = `Escuela: SportmancarERP   |   Sucursal: ${selectedBranch?.name || "Todas"}   |   Periodo: ${report.period.from} al ${report.period.to}`;
    const header = sheet.getRow(6);
    definition.columns.forEach(([, label], index) => { const cell = header.getCell(index + 1); cell.value = label; cell.style = headerStyle; });
    report.rows.forEach((item, rowIndex) => {
      const row = sheet.getRow(rowIndex + 7);
      definition.columns.forEach(([key, , kind], columnIndex) => {
        const cell = row.getCell(columnIndex + 1), value = item[key];
        cell.value = kind === "date" && value ? new Date(value) : kind === "money" ? Number(value || 0) : value ?? "";
        cell.style = dataStyle;
        if (kind === "date") cell.numFmt = "dd/mm/yyyy";
        if (kind === "money") cell.numFmt = '$#,##0.00';
      });
    });
    definition.columns.forEach(([, label], index) => { sheet.getColumn(index + 1).width = Math.max(14, Math.min(label.length + 8, 32)); });
    sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6, column: definition.columns.length } };
    sheet.views = [{ state: "frozen", ySplit: 6 }];
    if (report.type === "instructors" && filters.exportMode === "complete") {
      const usedNames = new Set([sheet.name]);
      for (const instructor of report.rows) {
        const detail = await ManagerDashboardService.instructorStudents(
          auth,
          { ...filters, instructorId: instructor.id, cycleId: null },
          true,
        );
        const safeBase = String(instructor.name || "Instructor")
          .replace(/[\\/\?\*\[\]:]/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 31) || "Instructor";
        let sheetName = safeBase;
        let suffix = 2;
        while (usedNames.has(sheetName)) {
          const ending = ` ${suffix++}`;
          sheetName = `${safeBase.slice(0, 31 - ending.length)}${ending}`;
        }
        usedNames.add(sheetName);
        const instructorSheet = workbook.addWorksheet(sheetName);
        const columns = 7;
        [1, 2, 3, 4].forEach((row) => instructorSheet.mergeCells(row, 1, row, columns));
        instructorSheet.getCell("A1").value = "UNIDAD DE ESCUELAS DE CAPACITACIÓN";
        instructorSheet.getCell("A2").value = "ESCUELA DE CAPACITACIÓN DE CONDUCTORES NO PROFESIONALES";
        instructorSheet.getCell("A3").value = `INSTRUCTOR: ${instructor.name || ""}`;
        instructorSheet.getCell("A4").value = `Sucursal: ${instructor.branch_name || ""}   |   Periodo consultado: ${report.period.from} al ${report.period.to}`;
        [1, 2, 3].forEach((row) => {
          instructorSheet.getRow(row).font = { bold: true, size: row === 1 ? 15 : 12 };
          instructorSheet.getRow(row).alignment = { horizontal: "center", vertical: "middle" };
        });
        instructorSheet.getRow(4).alignment = { horizontal: "center", vertical: "middle" };
        const grouped = new Map();
        [...(detail.data || []).filter(item => item.activity_type !== 'EXAM_ONLY'), ...(detail.occupations || [])].forEach((student) => {
          if (!grouped.has(student.cycle_id)) grouped.set(student.cycle_id, []);
          grouped.get(student.cycle_id).push(student);
        });
        let currentRow = 6;
        for (const students of grouped.values()) {
          const course = students[0];
          instructorSheet.mergeCells(currentRow, 1, currentRow, columns);
          const titleCell = instructorSheet.getCell(currentRow, 1);
          titleCell.value = course.course_name;
          titleCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
          titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
          titleCell.alignment = { horizontal: "left", vertical: "middle" };
          currentRow += 1;
          instructorSheet.mergeCells(currentRow, 1, currentRow, columns);
          instructorSheet.getCell(currentRow, 1).value = `Periodo del curso: ${course.start_date ? new Date(course.start_date).toLocaleDateString("es-EC") : ""} al ${course.end_date ? new Date(course.end_date).toLocaleDateString("es-EC") : ""}`;
          instructorSheet.getCell(currentRow, 1).font = { italic: true, color: { argb: "FF475467" } };
          currentRow += 1;
          const labels = ["IDENTIFICACIÓN", "ESTUDIANTE", "CORREO", "CLASES", "ASISTENCIAS", "HORAS", "HORAS PROGRAMADAS"];
          labels.forEach((label, index) => {
            const cell = instructorSheet.getCell(currentRow, index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
            cell.alignment = { horizontal: "center", vertical: "middle" };
          });
          currentRow += 1;
          students.forEach((student, studentIndex) => {
            const values = student.is_occupation
              ? ["OCUPACION", `${student.name} (${student.schedule_time})`, "", student.classes, "", "", ""]
              : [student.identification, student.name, student.email, student.classes, student.attended, Number(student.hours || 0), Number(student.scheduled_hours || 0)];
            values.forEach((value, index) => {
              const cell = instructorSheet.getCell(currentRow, index + 1);
              cell.value = value ?? "";
              cell.border = { top: { style: "thin", color: { argb: "FFD0D5DD" } }, left: { style: "thin", color: { argb: "FFD0D5DD" } }, bottom: { style: "thin", color: { argb: "FFD0D5DD" } }, right: { style: "thin", color: { argb: "FFD0D5DD" } } };
              if (studentIndex % 2) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
            });
            currentRow += 1;
          });
          currentRow += 2;
        }
        if (detail.exams?.length) {
          instructorSheet.mergeCells(currentRow, 1, currentRow, columns);
          const examTitle = instructorSheet.getCell(currentRow++, 1);
          examTitle.value = "FORMACIÓN INTENSIVA";
          examTitle.font = { bold: true, color: { argb: "FFFFFFFF" } };
          examTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
          ["IDENTIFICACION", "ESTUDIANTE", "CURSO", "FECHA Y HORA", "ESTADO", "RESULTADO"].forEach((label, index) => {
            const cell = instructorSheet.getCell(currentRow, index + 1);
            cell.value = label;
            cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
          });
          currentRow++;
          detail.exams.forEach(exam => {
            [exam.identification, exam.name, exam.course_name, exam.scheduled_at,
              exam.status, exam.result ? `${exam.result} (${Number(exam.percentage)}%)` : "Sin evaluacion registrada"]
              .forEach((value, index) => { instructorSheet.getCell(currentRow, index + 1).value = value; });
            currentRow++;
          });
        }
        if (!grouped.size && !detail.exams?.length) instructorSheet.getCell("A6").value = "No existen cursos con estudiantes en el periodo seleccionado.";
        [18, 28, 36, 12, 15, 12, 22].forEach((width, index) => { instructorSheet.getColumn(index + 1).width = width; });
        instructorSheet.views = [{ state: "frozen", ySplit: 4 }];
      }
    }
    const buffer = await workbook.xlsx.writeBuffer();
    const prefix = report.type === "instructors" && filters.exportMode === "complete" ? "reporte_completo_instructores" : `reporte_${report.type}`;
    return { buffer: Buffer.from(buffer), filename: `${prefix}_${report.period.from}_${report.period.to}.xlsx` };
  }
}

/**
 * Helper to get report-specific metadata (title, headers, column widths).
 * @param {string} reportType - The type of report (e.g., 'active_students').
 * @returns {object|null} Metadata for the report type, or null if not found.
 */
ReportService._getReportMetadata = function(reportType) {
  const metadata = {
    active_students: {
      title: 'Reporte de Estudiantes Activos',
      headers: [
        { header: 'Cédula', key: 'identification', width: 15 },
        { header: 'Nombre Completo', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Teléfono', key: 'phone', width: 15 },
        { header: 'Curso', key: 'course', width: 25 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Fecha Inicio Ciclo', key: 'start_date', width: 18 },
        { header: 'Fecha Fin Ciclo', key: 'end_date', width: 18 },
        { header: 'Instructor Asignado', key: 'instructor', width: 30 },
        { header: 'Registrado Por', key: 'registered_by', width: 25 },
      ],
    },
    enrollments: {
      title: 'Reporte de Matrículas',
      headers: [
        { header: 'Cédula', key: 'identification', width: 15 },
        { header: 'Nombre Completo', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Teléfono', key: 'phone', width: 15 },
        { header: 'Curso', key: 'course', width: 25 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Fecha Matrícula', key: 'enrollment_date', width: 18 },
        { header: 'Estado Matrícula', key: 'status', width: 18 },
        { header: 'Monto Pagado', key: 'amount', width: 15 },
        { header: 'Saldo Pendiente', key: 'balance', width: 15 },
        { header: 'Registrado Por', key: 'registered_by', width: 25 },
      ],
    },
    cycles: {
      title: 'Reporte de Ciclos de Curso',
      headers: [
        { header: 'Código', key: 'code', width: 15 },
        { header: 'Curso', key: 'course', width: 25 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Fecha Inicio', key: 'start_date', width: 18 },
        { header: 'Fecha Fin', key: 'end_date', width: 18 },
        { header: 'Estado', key: 'status', width: 15 },
        { header: 'Capacidad', key: 'capacity', width: 12 },
        { header: 'Estudiantes', key: 'students', width: 12 },
      ],
    },
    instructors: {
      title: 'Reporte de Instructores',
      headers: [
        { header: 'Nombre Completo', key: 'name', width: 30 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Área Práctica', key: 'practice_area', width: 20 },
        { header: 'Estudiantes Asignados', key: 'students', width: 20 },
        { header: 'Clases Completadas', key: 'completed_classes', width: 20 },
        { header: 'Horas Prácticas', key: 'hours', width: 15 },
      ],
    },
    payments: {
      title: 'Reporte de Pagos',
      headers: [
        { header: 'Fecha Pago', key: 'payment_date', width: 18 },
        { header: 'Cédula Estudiante', key: 'identification', width: 18 },
        { header: 'Nombre Estudiante', key: 'name', width: 30 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Curso', key: 'course', width: 25 },
        { header: 'Método Pago', key: 'payment_method', width: 18 },
        { header: 'Monto', key: 'amount', width: 15 },
        { header: 'Saldo Pendiente', key: 'balance', width: 15 },
        { header: 'Estado Pago', key: 'status', width: 15 },
      ],
    },
    services: {
      title: 'Reporte de Servicios Adicionales',
      headers: [
        { header: 'Fecha Servicio', key: 'service_date', width: 18 },
        { header: 'Cédula Cliente', key: 'identification', width: 18 },
        { header: 'Nombre Cliente', key: 'name', width: 30 },
        { header: 'Servicio', key: 'service', width: 25 },
        { header: 'Sucursal', key: 'branch', width: 20 },
        { header: 'Método Pago', key: 'payment_method', width: 18 },
        { header: 'Monto', key: 'amount', width: 15 },
        { header: 'Estado', key: 'status', width: 15 },
      ],
    },
  };
  return metadata[reportType];
};

/**
 * Applies the general report template structure to an Excel worksheet.
 * This includes the main title, specific report title, date, and general styling.
 * @param {ExcelJS.Worksheet} worksheet - The ExcelJS worksheet to apply the template to.
 * @param {string} specificReportTitle - The title specific to the report being generated.
 */
ReportService._applyGeneralTemplate = function(worksheet, specificReportTitle) {
  // Row 1: Logo placeholder, General Title, Date
  worksheet.getRow(1).height = 30;
  worksheet.mergeCells('A1:C1'); // Placeholder for logo
  worksheet.getCell('A1').value = 'SportmancarERP'; // Text placeholder for logo
  worksheet.getCell('A1').font = { size: 14, bold: true };
  worksheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };

  worksheet.mergeCells('D1:F1'); // General Report Title
  worksheet.getCell('D1').value = 'REPORTE GERENCIAL';
  worksheet.getCell('D1').font = { size: 16, bold: true };
  worksheet.getCell('D1').alignment = { vertical: 'middle', horizontal: 'center' };

  // Assuming reports won't exceed column I, adjust merge range if more columns are added.
  worksheet.mergeCells('G1:I1'); // Date of Generation
  worksheet.getCell('G1').value = `Fecha de Generación: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' })}`;
  worksheet.getCell('G1').alignment = { vertical: 'middle', horizontal: 'right' };

  // Apply light blue background to rows 1-3
  const lightBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFADD8E6' } };
  worksheet.getRow(1).fill = lightBlueFill;
  worksheet.getRow(2).fill = lightBlueFill;
  worksheet.getRow(3).fill = lightBlueFill;

  // Row 2: Specific Report Title
  worksheet.mergeCells('A2:I2'); // Merge across all potential columns
  worksheet.getCell('A2').value = specificReportTitle;
  worksheet.getCell('A2').font = { size: 14, bold: true };
  worksheet.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };

  // Row 3: Empty for separation (already filled with light blue)
  worksheet.getRow(3).height = 10;

  // Row 4: Empty for separation
  worksheet.getRow(4).height = 10;

  // Row 5: Data Headers - style is set here, content will be added by specific report logic
  worksheet.getRow(5).font = { bold: true };
};

ReportService.exportUniversalReportToExcel = async function(auth, filters = {}) {
  const { type, rows } = await this.universal(auth, filters); // Get data using existing method

  const metadata = this._getReportMetadata(type);
  if (!metadata) {
    const error = new Error('Tipo de reporte no soportado para exportación a Excel');
    error.status = 422;
    throw error;
  }

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(metadata.title);

  // Apply general template (header, titles, basic styles)
  this._applyGeneralTemplate(worksheet, metadata.title);

  // Set columns for the worksheet (including widths)
  worksheet.columns = metadata.headers.map(h => ({ key: h.key, width: h.width })); // Eliminamos 'header' de aquí

  // Add the actual headers to row 5
  worksheet.getRow(5).values = metadata.headers.map(h => h.header);

  // Add data rows one by one, starting from row 6, to respect the template
  rows.forEach(row => {
    worksheet.addRow(row);
  });

  // Generate buffer
  return await workbook.xlsx.writeBuffer();
};

module.exports = ReportService;
module.exports.resolveCourseDateRange = resolveCourseDateRange;
