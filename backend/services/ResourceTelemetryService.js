const { AsyncLocalStorage } = require('async_hooks');
const ExcelJS = require('exceljs');
const db = require('../config/database');
const StudentResourceService = require('./StudentResourceService');

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;

const storage = new AsyncLocalStorage();
const TRACKED = [
  { method: 'POST', pattern: /^\/api\/students\/?$/, operation: 'STUDENT_ENROLLMENT' },
  { method: 'POST', pattern: /^\/api\/students\/[^/]+\/additional-practices\/?$/, operation: 'ADDITIONAL_PRACTICE' },
  { method: 'POST', pattern: /^\/api\/payments\/register\/?$/, operation: 'PAYMENT' },
  { method: 'POST', pattern: /^\/api\/payments\/transfer-verifications\/?$/, operation: 'PAYMENT' },
  { method: 'POST', pattern: /^\/api\/attendance\//, operation: 'INSTRUCTOR_ATTENDANCE' },
  { method: 'POST', pattern: /^\/api\/instructor\//, operation: 'INSTRUCTOR_OPERATION' },
  { method: 'PUT', pattern: /^\/api\/instructor\//, operation: 'INSTRUCTOR_OPERATION' },
];

const EXCLUDED_PATHS = new Set(['/api/health', '/api/admin/resource-monitor', '/api/admin/enrollment-monitor']);
const classifyOperation = (method, path) => {
  const explicit = TRACKED.find(item => item.method === method && item.pattern.test(path));
  if (explicit) return explicit.operation;
  if (/^\/api\/auth\/(login|refresh)/.test(path)) return 'SESSION_START';
  if (/^\/api\/auth\/logout/.test(path)) return 'SESSION_END';
  if (/^\/api\/students/.test(path)) return method === 'GET' ? 'STUDENT_QUERY' : 'STUDENT_OPERATION';
  if (/^\/api\/(payments|receipts)/.test(path)) return method === 'GET' ? 'FINANCIAL_QUERY' : 'PAYMENT';
  if (/^\/api\/documents/.test(path)) return method === 'GET' ? 'DOCUMENT_QUERY' : 'DOCUMENT_OPERATION';
  if (/^\/api\/(schedules|course-cycles)/.test(path)) return method === 'GET' ? 'ACADEMIC_QUERY' : 'SCHEDULE_OPERATION';
  if (/^\/api\/(instructor|instructors|attendance)/.test(path)) return method === 'GET' ? 'INSTRUCTOR_QUERY' : 'INSTRUCTOR_OPERATION';
  if (/^\/api\/admin\/(reports|manager)/.test(path)) return 'REPORT_QUERY';
  if (/^\/api\/admin/.test(path)) return method === 'GET' ? 'ADMIN_QUERY' : 'ADMIN_OPERATION';
  if (/^\/api\/notifications/.test(path)) return 'NOTIFICATION_QUERY';
  return 'SYSTEM_REQUEST';
};
const describeAction = (method, path) => {
  if (path === '/api/auth/login') return 'Inició sesión';
  if (path === '/api/auth/logout') return 'Cerró sesión';
  if (path === '/api/auth/me') return 'Consultó su perfil';
  if (path === '/api/auth/authorization') return 'Validó sus permisos de acceso';
  if (/^\/api\/payments\/register/.test(path)) return 'Registró un pago';
  if (/^\/api\/payments\/transfer-verifications/.test(path)) return method === 'GET' ? 'Consultó transferencias' : 'Gestionó una transferencia';
  if (/^\/api\/payments\/pending/.test(path)) return 'Consultó pagos pendientes';
  if (/^\/api\/payments\/methods/.test(path)) return 'Consultó métodos de pago';
  if (/^\/api\/payments/.test(path)) return method === 'GET' ? 'Consultó información financiera' : 'Gestionó un pago';
  if (/^\/api\/receipts\/.+\/print/.test(path)) return 'Generó o consultó un recibo';
  if (/^\/api\/receipts/.test(path)) return 'Consultó recibos';
  if (method === 'POST' && /^\/api\/students\/?$/.test(path)) return 'Registró una inscripción';
  if (/^\/api\/students\/.+\/balance/.test(path)) return 'Consultó el saldo de un estudiante';
  if (/^\/api\/students\/.+\/documents/.test(path)) return method === 'GET' ? 'Consultó documentos de un estudiante' : 'Cargó un documento del estudiante';
  if (/^\/api\/students\/.+\/additional-practices/.test(path)) return 'Registró una práctica adicional';
  if (/^\/api\/students\/branches/.test(path)) return 'Consultó sucursales disponibles';
  if (/^\/api\/students/.test(path)) return method === 'GET' ? 'Consultó estudiantes' : 'Actualizó un estudiante';
  if (/^\/api\/documents/.test(path)) return method === 'GET' ? 'Consultó documentación' : 'Gestionó documentación';
  if (/^\/api\/attendance/.test(path)) return method === 'GET' ? 'Consultó asistencias' : 'Registró o actualizó una asistencia';
  if (/^\/api\/instructor/.test(path)) return method === 'GET' ? 'Consultó agenda o actividad de instructor' : 'Registró actividad de instructor';
  if (/^\/api\/(schedules|course-cycles)/.test(path)) return method === 'GET' ? 'Consultó horarios o ciclos' : 'Configuró un horario o ciclo';
  if (/^\/api\/admin\/reports/.test(path)) return method === 'GET' ? 'Consultó un reporte' : 'Generó o exportó un reporte';
  if (/^\/api\/admin\/audit/.test(path)) return 'Consultó la auditoría';
  if (/^\/api\/admin\/branches/.test(path)) return method === 'GET' ? 'Consultó administración de sucursales' : 'Configuró una sucursal';
  if (/^\/api\/admin\/users/.test(path)) return method === 'GET' ? 'Consultó usuarios y accesos' : 'Gestionó un usuario o sus permisos';
  if (/^\/api\/admin/.test(path)) return method === 'GET' ? 'Consultó administración del sistema' : 'Modificó la configuración del sistema';
  if (/^\/api\/notifications/.test(path)) return 'Consultó notificaciones';
  return method === 'GET' ? 'Consultó información del sistema' : 'Realizó una operación en el sistema';
};

const percentile = (values, ratio) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] || 0);
};

class ResourceTelemetryService {
  static context() { return storage.getStore(); }

  static async studentContext(req, data, requestPath) {
    const pathId = requestPath.match(/^\/api\/students\/([0-9a-f-]{36})(?:\/|$)/i)?.[1]
      || requestPath.match(/^\/api\/schedules\/student\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
    let studentId = uuid(pathId) || uuid(req.requestContext?.studentId) || uuid(data?.student_id) || uuid(data?.studentId)
      || uuid(data?.transfer?.student_id) || uuid(data?.student?.id) || uuid(req.body?.studentId) || uuid(req.body?.student_id);
    if (!studentId && /^\/api\/students\/?$/.test(requestPath) && !Array.isArray(data)) studentId = uuid(data?.id);
    const search = req.query?.query || req.query?.search;
    if (!studentId && req.method === 'GET' && /^\/api\/students(?:\/search)?\/?$/.test(requestPath)
      && String(search||'').trim() && Array.isArray(data) && data.length === 1) studentId = uuid(data[0].id);
    const identification = req.body?.cedula || req.body?.identification;
    if (!studentId && !identification) return null;
    // Validate identity independently: payment/document/account IDs are not student IDs.
    return (await db.pool.query(`SELECT s.id student_id,s.branch_id,e.id enrollment_id FROM students s
      LEFT JOIN LATERAL (SELECT id FROM enrollments WHERE student_id=s.id ORDER BY created_at DESC LIMIT 1) e ON TRUE
      WHERE ($1::uuid IS NOT NULL AND s.id=$1) OR ($1::uuid IS NULL AND s.identification=$2) LIMIT 1`,
    [studentId,identification ? String(identification).trim() : null])).rows[0] || null;
  }

  static recordQuery(durationMs) {
    const context = storage.getStore();
    if (!context || context.persisting) return;
    context.dbQueryCount += 1;
    context.dbDurationMs += Number(durationMs) || 0;
  }

  static middleware(req, res, next) {
    if (!req.path.startsWith('/api/') || [...EXCLUDED_PATHS].some(path => req.path.startsWith(path))) return next();
    const requestPath = req.path;
    const operation = req.method === 'GET' && (/^\/api\/students\/search$/.test(requestPath)
      || (/^\/api\/students\/?$/.test(requestPath) && req.query?.search))
      ? 'STUDENT_SEARCH' : classifyOperation(req.method, requestPath);
    const start = process.hrtime.bigint();
    const cpuStart = process.cpuUsage();
    const heapStart = process.memoryUsage().heapUsed;
    let receivedBytes = 0;
    const countPayload = chunk => { receivedBytes += chunk.length; };
    req.on?.('data', countPayload);
    res.once('close', () => req.removeListener?.('data', countPayload));
    const context = { dbQueryCount: 0, dbDurationMs: 0, persisting: false };
    let responseBody = null;
    const originalJson = res.json.bind(res);
    res.json = body => { responseBody = body; return originalJson(body); };

    res.once('finish', () => {
      req.removeListener?.('data', countPayload);
      const cpu = process.cpuUsage(cpuStart);
      const measured = { duration: Number(process.hrtime.bigint() - start) / 1e6,
        cpu: (cpu.user + cpu.system) / 1000, heap: process.memoryUsage().heapUsed - heapStart };
      const data = responseBody?.data || {};
      context.persisting = true;
      void (async () => {
      const userId = req.user?.id || responseBody?.user?.id || data.user?.id || null;
      const related = await ResourceTelemetryService.studentContext(req, data, requestPath);
      const studentId = related?.student_id || null;
      const enrollmentId = uuid(data.enrollment_id) || related?.enrollment_id || null;
      let branchId = data.branch_id || data.transfer?.branch_id || responseBody?.user?.branch_id || req.user?.branch_id || null;
      if (related?.branch_id) branchId = related.branch_id;
      const values = [
        req.requestContext?.requestId, userId, branchId,
        operation, req.method, requestPath.replace(/^(\/api\/documents\/(?:mobile-upload|mobile-upload-token)\/)[^/]+/, '$1[token]'), res.statusCode,
        measured.duration, measured.cpu,
        measured.heap, receivedBytes,
        Number(res.get('content-length')) || Buffer.byteLength(JSON.stringify(responseBody || {})),
        context.dbQueryCount, context.dbDurationMs, studentId, enrollmentId,
        res.statusCode >= 200 && res.statusCode < 400,
      ];
      await db.pool.query(`INSERT INTO request_resource_metrics
        (request_id,user_id,branch_id,operation,method,route,status_code,duration_ms,cpu_ms,heap_delta_bytes,
         request_bytes,response_bytes,db_query_count,db_duration_ms,student_id,enrollment_id,success)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, values)
        .then(() => ResourceTelemetryService.notify?.())
        .catch(error => console.error('No se pudo guardar telemetria:', error.message));
      })().catch(error => console.error('No se pudo relacionar la telemetria:', error.message));
    });
    storage.run(context, next);
  }

  static async dashboard(filters = {}) {
    StudentResourceService.validate(filters);
    const hours = Math.min(Math.max(Number(filters.hours) || 24, 1), 720);
    const resultLimit = filters.export ? 50000 : 100;
    const params = [hours];
    let scope = `m.created_at >= NOW() - ($1::text || ' hours')::interval`;
    if (filters.branchId) { params.push(filters.branchId); scope += ` AND m.branch_id=$${params.length}::uuid`; }
    if (filters.studentId) { params.push(filters.studentId); scope += ` AND m.student_id=$${params.length}::uuid`; }
    const rows = (await db.query(`SELECT m.*,trim(concat(u.first_name,' ',u.last_name)) actor_name,b.name branch_name,
      trim(concat(s.first_name,' ',s.last_name)) student_name,s.identification
      FROM request_resource_metrics m LEFT JOIN users u ON u.id=m.user_id LEFT JOIN branches b ON b.id=m.branch_id
      LEFT JOIN students s ON s.id=m.student_id WHERE ${scope} ORDER BY m.created_at DESC LIMIT ${resultLimit}`, params)).rows;
    rows.forEach(row => { row.action_description = row.operation==='STUDENT_SEARCH' ? 'Buscó estudiantes' : describeAction(row.method, row.route); });
    const auditParams = [hours];
    let auditScope = `a.created_at >= NOW() - ($1::text || ' hours')::interval`;
    if (filters.branchId) { auditParams.push(filters.branchId); auditScope += ` AND a.branch_id=$${auditParams.length}::uuid`; }
    if (filters.studentId) { auditParams.push(filters.studentId); auditScope += ` AND a.metadata->>'studentId'=$${auditParams.length}::text`; }
    const paymentEvents = (await db.query(`SELECT a.request_id,a.user_id,a.branch_id,a.action,a.description,a.created_at,
      trim(concat(u.first_name,' ',u.last_name)) actor_name,b.name branch_name,
      trim(concat(s.first_name,' ',s.last_name)) student_name,s.identification
      FROM audit_logs a LEFT JOIN users u ON u.id=a.user_id LEFT JOIN branches b ON b.id=a.branch_id
      LEFT JOIN students s ON s.id=CASE WHEN a.metadata->>'studentId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN (a.metadata->>'studentId')::uuid ELSE NULL END
      WHERE ${auditScope} AND a.action IN ('PAYMENT_REGISTERED','SERVICE_PAYMENT_REGISTERED','TRANSFER_VERIFICATION_CREATED')
      ORDER BY a.created_at DESC LIMIT ${resultLimit}`, auditParams)).rows;
    const measuredRequests = new Set(rows.map(row => String(row.request_id)));
    paymentEvents.forEach(event => {
      if (!event.request_id || measuredRequests.has(String(event.request_id))) return;
      rows.push({ ...event, operation: 'PAYMENT', action_description: event.description || 'Registró un pago', success: true, status_code: null, duration_ms: null, cpu_ms: null,
        heap_delta_bytes: null, request_bytes: null, response_bytes: null, db_query_count: null, db_duration_ms: null,
        historical: true });
    });
    rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    rows.splice(resultLimit);
    const measured = rows.filter(row => !row.historical);
    const successful = measured.filter(row => row.success);
    const capacity = (await db.query(`WITH scoped AS (
        SELECT * FROM request_resource_metrics m WHERE ${scope}
      ), minute_load AS (
        SELECT date_trunc('minute',created_at) AS bucket_minute,COUNT(*)::int requests,
          COUNT(DISTINCT user_id)::int active_users
        FROM scoped GROUP BY 1
      )
      SELECT COUNT(*)::int sample_count,
        COUNT(*) FILTER(WHERE success)::int successful_count,
        COUNT(*) FILTER(WHERE NOT success)::int error_count,
        COUNT(*) FILTER(WHERE operation='STUDENT_ENROLLMENT' AND success)::int enrollment_count,
        COALESCE(AVG(duration_ms) FILTER(WHERE success),0)::float avg_duration_ms,
        COALESCE(percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms) FILTER(WHERE success),0)::float p95_duration_ms,
        COALESCE(AVG(cpu_ms) FILTER(WHERE success),0)::float avg_cpu_ms,
        COALESCE(percentile_cont(.95) WITHIN GROUP(ORDER BY cpu_ms) FILTER(WHERE success),0)::float p95_cpu_ms,
        COALESCE(AVG(db_duration_ms) FILTER(WHERE success),0)::float avg_db_ms,
        COALESCE(percentile_cont(.95) WITHIN GROUP(ORDER BY db_duration_ms) FILTER(WHERE success),0)::float p95_db_ms,
        COALESCE(AVG(db_query_count) FILTER(WHERE success),0)::float avg_queries,
        COALESCE(percentile_cont(.95) WITHIN GROUP(ORDER BY db_query_count) FILTER(WHERE success),0)::float p95_queries,
        COALESCE(AVG(request_bytes) FILTER(WHERE success),0)::float avg_request_bytes,
        COALESCE(AVG(response_bytes) FILTER(WHERE success),0)::float avg_response_bytes,
        COALESCE((SELECT MAX(requests) FROM minute_load),0)::int peak_requests_per_minute,
        COALESCE((SELECT ROUND(AVG(requests),1) FROM minute_load),0)::float avg_requests_per_active_minute,
        COALESCE((SELECT MAX(active_users) FROM minute_load),0)::int peak_active_users_per_minute,
        COUNT(DISTINCT user_id)::int unique_users
      FROM scoped`, params)).rows[0];
    const operationLoad = (await db.query(`SELECT operation,COUNT(*)::int requests,
        COUNT(*) FILTER(WHERE NOT success)::int errors,
        ROUND(AVG(duration_ms)::numeric,1)::float avg_duration_ms,
        ROUND(percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms)::numeric,1)::float p95_duration_ms,
        ROUND(AVG(db_query_count)::numeric,1)::float avg_queries,
        ROUND(AVG(db_duration_ms)::numeric,1)::float avg_db_ms
      FROM request_resource_metrics m WHERE ${scope}
      GROUP BY operation ORDER BY COUNT(*) DESC,operation LIMIT 6`, params)).rows;
    const pool = db.pool;
    const sampleCount = Number(capacity.sample_count || 0);
    const summary = {
      sampleCount, enrollmentCount:Number(capacity.enrollment_count||0),
      avgDurationMs:Number(capacity.avg_duration_ms||0),p95DurationMs:Number(capacity.p95_duration_ms||0),
      avgCpuMs:Number(capacity.avg_cpu_ms||0),p95CpuMs:Number(capacity.p95_cpu_ms||0),
      avgDbMs:Number(capacity.avg_db_ms||0),p95DbMs:Number(capacity.p95_db_ms||0),
      avgQueries:Number(capacity.avg_queries||0),p95Queries:Number(capacity.p95_queries||0),
      avgRequestBytes:Number(capacity.avg_request_bytes||0),avgResponseBytes:Number(capacity.avg_response_bytes||0),
      successRate:sampleCount?Number(capacity.successful_count||0)*100/sampleCount:0,
      errorRate:sampleCount?Number(capacity.error_count||0)*100/sampleCount:0,
    };
    const peakUsers=Number(capacity.peak_active_users_per_minute||0),peakRpm=Number(capacity.peak_requests_per_minute||0);
    const currentRss=process.memoryUsage().rss,currentWaiting=pool.waitingCount;
    let purchase={cpu:'2 vCPU',ram:'4 GB RAM',database:'PostgreSQL en SSD',profile:'Base'};
    if(peakUsers>30||peakRpm>300||summary.p95DurationMs>2500||currentRss>1.5*1024**3){purchase={cpu:'8 vCPU',ram:'16 GB RAM',database:'PostgreSQL en NVMe',profile:'Alta demanda'};}
    else if(peakUsers>10||peakRpm>100||summary.p95DurationMs>1000||summary.p95CpuMs>500||currentRss>700*1024**2){purchase={cpu:'4 vCPU',ram:'8 GB RAM',database:'PostgreSQL en SSD/NVMe',profile:'Crecimiento'};}
    const confidence=sampleCount>=1000&&peakUsers>=5?'alta':sampleCount>=100?'media':'baja';
    const pressure=currentWaiting>0||summary.errorRate>2||summary.p95DurationMs>1500;
    const sizing = sampleCount < 100 ? {
      level:'insufficient',confidence,message:`Muestra insuficiente: ${sampleCount} operaciones; aún no representa una hora pico.`,recommendation:'No comprar todavía por esta lectura. Reunir al menos 100 operaciones y probar varios usuarios trabajando al mismo tiempo.',purchase
    } : {
      level:pressure?'review':'healthy',confidence,
      message:`Pico observado: ${peakUsers} usuarios distintos y ${peakRpm} peticiones en un minuto. Error ${summary.errorRate.toFixed(1)} %, P95 ${summary.p95DurationMs.toFixed(0)} ms.`,
      recommendation:`Perfil sugerido ${purchase.profile}: ${purchase.cpu}, ${purchase.ram} y ${purchase.database}. Confianza ${confidence}; confirmar con una prueba de carga antes de comprar.`,purchase
    };
    const branches = (await db.query('SELECT id,name FROM branches WHERE active=TRUE ORDER BY name')).rows;
    const studentResources = await StudentResourceService.summary(filters);
    return { summary, sizing, studentResources, capacity:{peakRequestsPerMinute:peakRpm,avgRequestsPerActiveMinute:Number(capacity.avg_requests_per_active_minute||0),peakActiveUsersPerMinute:peakUsers,uniqueUsers:Number(capacity.unique_users||0),operationLoad}, rows, branches, process: { uptimeSeconds: process.uptime(), rssBytes: currentRss, heapUsedBytes: process.memoryUsage().heapUsed, nodeVersion: process.version, pool: { total: pool.totalCount, idle: pool.idleCount, waiting: currentWaiting, max: Number(process.env.DB_POOL_MAX) || 10 } }, serverTime: new Date().toISOString(), note: 'Usuarios por minuto es una aproximación de concurrencia basada en actividad autenticada; debe confirmarse con una prueba de carga.' };
  }

  static async export(filters = {}) {
    const data = await this.dashboard({ ...filters, export: true });
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'SportmancarERP'; workbook.created = new Date();
    const summary = workbook.addWorksheet('Resumen');
    summary.mergeCells('A1:D1'); summary.getCell('A1').value = 'SPORTMANCARERP - MONITOREO INTEGRAL DE RECURSOS';
    summary.getCell('A1').font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
    summary.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF202A64' } };
    summary.addRows([
      ['Periodo analizado', `Últimas ${Math.min(Math.max(Number(filters.hours) || 24, 1), 720)} horas`],
      ['Generado', new Date()], ['Operaciones medidas', data.summary.sampleCount], ['Inscripciones', data.summary.enrollmentCount],
      ['Tiempo promedio (ms)', data.summary.avgDurationMs], ['Tiempo P95 (ms)', data.summary.p95DurationMs],
      ['CPU promedio (ms)', data.summary.avgCpuMs], ['CPU P95 (ms)', data.summary.p95CpuMs],
      ['Consultas promedio', data.summary.avgQueries], ['Tiempo promedio BD (ms)', data.summary.avgDbMs],
      ['Consultas P95', data.summary.p95Queries], ['Tiempo BD P95 (ms)', data.summary.p95DbMs],
      ['Tasa de éxito (%)', data.summary.successRate], ['Tasa de errores (%)', data.summary.errorRate],
      ['Pico de usuarios distintos por minuto', data.capacity.peakActiveUsersPerMinute],
      ['Usuarios distintos del periodo', data.capacity.uniqueUsers],
      ['Pico de peticiones por minuto', data.capacity.peakRequestsPerMinute],
      ['Promedio por minuto con actividad', data.capacity.avgRequestsPerActiveMinute],
      ['Memoria actual del proceso (bytes)', data.process.rssBytes],
      ['Conexiones PostgreSQL', `${data.process.pool.total}/${data.process.pool.max}`],
      ['Perfil sugerido', data.sizing.purchase?.profile], ['Procesador sugerido', data.sizing.purchase?.cpu],
      ['Memoria sugerida', data.sizing.purchase?.ram], ['Almacenamiento sugerido', data.sizing.purchase?.database],
      ['Confianza', data.sizing.confidence],
      ['Evaluación', data.sizing.message], ['Recomendación', data.sizing.recommendation],
    ]);
    summary.getColumn(1).width = 34; summary.getColumn(2).width = 80;
    summary.getColumn(1).font = { bold: true, color: { argb: 'FF344054' } };
    summary.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
    summary.getCell('B3').numFmt = 'dd/mm/yyyy hh:mm:ss';

    const detail = workbook.addWorksheet('Operaciones');
    detail.columns = [
      ['Fecha y hora','created_at',22],['Acción realizada','action_description',38],['Categoría','operation',27],['Método','method',11],['Ruta','route',45],
      ['Responsable','actor_name',28],['Sucursal','branch_name',28],['Estudiante','student_name',30],['Identificación','identification',17],
      ['Resultado','result',14],['Código HTTP','status_code',13],['Duración ms','duration_ms',15],['CPU ms','cpu_ms',13],
      ['Consultas BD','db_query_count',14],['Tiempo BD ms','db_duration_ms',15],['Memoria observada bytes','heap_delta_bytes',24],
      ['Entrada bytes','request_bytes',16],['Salida bytes','response_bytes',16],['ID solicitud','request_id',38],
    ].map(([header,key,width]) => ({ header, key, width }));
    detail.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF202A64' } };
    detail.views = [{ state: 'frozen', ySplit: 1 }]; detail.autoFilter = 'A1:S1';
    data.rows.forEach(row => detail.addRow({ ...row, created_at: row.created_at ? new Date(row.created_at) : null,
      operation: row.operation, result: row.success ? (row.historical ? 'Correcto sin medición' : 'Correcto') : 'Error',
      duration_ms: row.historical ? null : Number(row.duration_ms), cpu_ms: row.historical ? null : Number(row.cpu_ms),
      db_query_count: row.historical ? null : Number(row.db_query_count), db_duration_ms: row.historical ? null : Number(row.db_duration_ms),
      heap_delta_bytes: row.historical ? null : Number(row.heap_delta_bytes), request_bytes: row.historical ? null : Number(row.request_bytes), response_bytes: row.historical ? null : Number(row.response_bytes) }));
    detail.getColumn('created_at').numFmt = 'dd/mm/yyyy hh:mm:ss';
    detail.eachRow((row, index) => { if (index > 1 && index % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F7FB' } }; });
    const load = workbook.addWorksheet('Carga por modulo');
    load.columns = [
      ['Categoría','operation',28],['Operaciones','requests',14],['Errores','errors',12],
      ['Promedio ms','avg_duration_ms',15],['P95 ms','p95_duration_ms',15],
      ['Consultas promedio','avg_queries',20],['Tiempo BD promedio ms','avg_db_ms',23],
    ].map(([header,key,width])=>({header,key,width}));
    load.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    load.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF202A64'}};
    data.capacity.operationLoad.forEach(row=>load.addRow(row));
    load.views=[{state:'frozen',ySplit:1}];load.autoFilter='A1:G1';
    const stages = workbook.addWorksheet('Etapas del estudiante');
    stages.columns = [
      ['Etapa','label',25],['Operaciones','operations',14],['Errores','errors',12],
      ['Promedio ms','avg_ms',15],['P95 ms','p95_ms',15],['CPU observada proceso ms','avg_cpu_ms',27],
      ['Consultas promedio','avg_queries',20],['Tiempo BD promedio ms','avg_db_ms',23],
      ['Cambio heap promedio bytes','avg_heap_delta_bytes',29],['Cambio heap minimo bytes','min_heap_delta_bytes',28],
      ['Cambio heap maximo bytes','max_heap_delta_bytes',28],['Entrada total bytes','request_bytes',23],['Salida total bytes','response_bytes',23],
    ].map(([header,key,width])=>({header,key,width}));
    data.studentResources.stages.forEach(row=>stages.addRow({...row,
      avg_heap_delta_bytes:row.operations?Number(row.avg_heap_delta_bytes):null,
      min_heap_delta_bytes:row.operations?Number(row.min_heap_delta_bytes):null,
      max_heap_delta_bytes:row.operations?Number(row.max_heap_delta_bytes):null,
      request_bytes:row.operations?Number(row.request_bytes):null,
      response_bytes:row.operations?Number(row.response_bytes):null,
    }));
    stages.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
    stages.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF202A64'}};
    stages.views=[{state:'frozen',ySplit:1}];stages.autoFilter='A1:M1';
    const storage = workbook.addWorksheet('Almacenamiento logico');
    const measured = data.studentResources.storage;
    storage.addRows([
      ['Estudiante',measured?.student.name||'Sin estudiante seleccionado'],
      ['Identificacion',measured?.student.identification||''],
      ['Medido',measured?.measuredAt||''],
      ['Estimacion logica bytes',measured?.logicalBytes??null],
      ['Contenido de documentos en BD bytes',measured?.contentBytes??null],
      ['Registros y metadatos bytes',measured?.recordsBytes??null],
      ['Archivos externos sin medir',measured?.externalCount??null],
      ['Alcance','Bytes logicos de las tablas incluidas; no asigna disco fisico, indices, WAL ni copias de seguridad.'],
      ['CPU y memoria','Observaciones del proceso compartido; no recursos exclusivos de un estudiante.'],
      [],['Categoria','Registros','Bytes logicos'],
      ...(measured?.byTable||[]).map(row=>[row.category,row.records,Number(row.logical_bytes)]),
    ]);
    storage.getColumn(1).width=40;storage.getColumn(2).width=85;storage.getColumn(2).alignment={wrapText:true};storage.getColumn(3).width=20;
    return { buffer: await workbook.xlsx.writeBuffer(), filename: `monitoreo-recursos-${new Date().toISOString().slice(0, 10)}.xlsx` };
  }
}

module.exports = ResourceTelemetryService;
