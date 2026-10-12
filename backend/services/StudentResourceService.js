const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAGES = [
  ['REGISTER','Registro', [['POST','^/api/students/?$'],['POST','^/api/students/(license-renewals|[^/]+/additional-practices)$']]],
  ['SEARCH','Buscar', [['GET','^/api/students/search$']]],
  ['LIST','Listado', [['GET','^/api/students/?$']]],
  ['PROFILE','Abrir perfil', [['GET','^/api/students/[0-9a-f-]{36}$']]],
  ['REVIEW','Revisar edicion', [['GET','^/api/students/[^/]+/edit-'],['POST','^/api/students/[^/]+/edit-preview$']]],
  ['UPDATE','Actualizar', [['PUT','^/api/students/'],['PATCH','^/api/students/'],['POST','^/api/students/[^/]+/(disable|enable|reset-access)$']]],
  ['DELETE','Eliminar', [['DELETE','^/api/students/[0-9a-f-]{36}$']]],
  ['DOCUMENTS','Documentos', [['ANY','^/api/students/[^/]+/documents'],['ANY','^/api/documents']]],
  ['PAYMENTS','Pagos y saldo', [['ANY','^/api/students/[^/]+/(payments|balance)$'],['ANY','^/api/(payments|receipts)']]],
  ['SCHEDULE','Horario y clases', [['ANY','^/api/(schedules|course-cycles|attendance)'],['ANY','^/api/students/[^/]+/branch-admin-attendance$']]],
  ['HISTORY','Historial', [['GET','^/api/students/[^/]+/history$']]],
  ['RESERVATION','Reservas', [['ANY','^/api/students/reservations']]],
];

class StudentResourceService {
  static stage(method,route,operation=null) {
    if(operation==='STUDENT_SEARCH')return 'SEARCH';
    return STAGES.find(([, ,rules]) => rules.some(([verb,pattern]) =>
      (verb==='ANY'||verb===method) && new RegExp(pattern).test(route)))?.[0] || null;
  }

  static validate(filters) {
    for (const field of ['studentId','branchId']) {
      if (filters[field] && !UUID.test(filters[field])) throw createError(400,`${field} no valido`);
    }
  }

  static async summary(filters) {
    this.validate(filters);
    const hours=Math.min(Math.max(Number(filters.hours)||24,1),720);
    const stageCase=`CASE WHEN m.operation='STUDENT_SEARCH' THEN 'SEARCH' ${STAGES.map(([stage,,rules])=>`WHEN ${rules.map(([verb,pattern])=>
      `(${verb==='ANY'?'TRUE':`m.method='${verb}'`} AND m.route ~ '${pattern}')`).join(' OR ')} THEN '${stage}'`).join(' ')} END`;
    const stages=(await db.query(`WITH scoped AS (
      SELECT m.*,${stageCase} stage FROM request_resource_metrics m
      WHERE m.created_at>=NOW()-($1::text||' hours')::interval
        AND ($2::uuid IS NULL OR m.branch_id=$2)
        AND ($3::uuid IS NULL OR m.student_id=$3)
    ) SELECT stage,COUNT(*)::int operations,COUNT(*) FILTER(WHERE NOT success)::int errors,
      ROUND(AVG(duration_ms)::numeric,1)::float avg_ms,
      ROUND(percentile_cont(.95) WITHIN GROUP(ORDER BY duration_ms)::numeric,1)::float p95_ms,
      ROUND(AVG(cpu_ms)::numeric,1)::float avg_cpu_ms,
      ROUND(AVG(db_query_count)::numeric,1)::float avg_queries,
      ROUND(AVG(db_duration_ms)::numeric,1)::float avg_db_ms,
      ROUND(AVG(heap_delta_bytes))::bigint avg_heap_delta_bytes,
      MIN(heap_delta_bytes) min_heap_delta_bytes,MAX(heap_delta_bytes) max_heap_delta_bytes,
      SUM(request_bytes)::bigint request_bytes,SUM(response_bytes)::bigint response_bytes,
      MAX(created_at) last_at FROM scoped WHERE stage IS NOT NULL GROUP BY stage`,
    [hours,filters.branchId||null,filters.studentId||null])).rows;
    const storage=filters.studentId ? await this.storage(filters.studentId,filters.branchId||null) : null;
    return { stages:STAGES.map(([stage,label])=>({stage,label,...stages.find(row=>row.stage===stage),operations:Number(stages.find(row=>row.stage===stage)?.operations||0)})), storage };
  }

  static async storage(studentId,branchId=null) {
    const student=(await db.query(`SELECT s.id,TRIM(CONCAT(s.first_name,' ',s.last_name)) name,
      s.identification,b.name branch FROM students s LEFT JOIN branches b ON b.id=s.branch_id
      WHERE s.id=$1 AND ($2::uuid IS NULL OR s.branch_id=$2)`,[studentId,branchId])).rows[0];
    if(!student) throw createError(404,'Estudiante no disponible en la sucursal seleccionada');
    const tables=[
      ['students','Ficha','t.id=$1'],['enrollments','Matriculas','t.student_id=$1'],
      ['users','Cuenta','t.student_id=$1'],['course_cycle_schedule_assignments','Asignaciones','t.student_id=$1'],
      ['history','Historial','t.student_id=$1'],['request_resource_metrics','Telemetria','t.student_id=$1'],
      ['user_sessions','Sesiones','t.user_id IN (SELECT id FROM users WHERE student_id=$1)'],
      ['audit_logs','Auditoria',"t.entity_id::text=$1::text OR t.metadata->>'studentId'=$1::text"],
      ['additional_driving_practices','Practicas adicionales','t.student_id=$1'],
      ['service_transactions','Servicios','t.student_id=$1'],
      ['enrollment_instructor_assignments','Instructores','t.enrollment_id IN (SELECT id FROM enrollments WHERE student_id=$1)'],
      ['practical_sessions','Clases','t.enrollment_id IN (SELECT id FROM enrollments WHERE student_id=$1)'],
      ['payments','Pagos','t.enrollment_id IN (SELECT id FROM enrollments WHERE student_id=$1)'],
      ['payment_details','Abonos','t.payment_id IN (SELECT p.id FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE e.student_id=$1)'],
    ];
    const byTable=(await db.query(tables.map(([table,label,condition])=>`SELECT '${label}' category,
      COUNT(*)::int records,COALESCE(SUM(octet_length(to_jsonb(t)::text)),0)::bigint logical_bytes
      FROM ${table} t WHERE ${condition}`).join(' UNION ALL '),[studentId])).rows;
    const documents=(await db.query(`SELECT COUNT(*)::int records,
      COUNT(*) FILTER(WHERE file_path LIKE 'data:%')::int inline_count,
      COUNT(*) FILTER(WHERE NULLIF(file_path,'') IS NOT NULL AND file_path NOT LIKE 'data:%')::int external_count,
      COALESCE(SUM(CASE WHEN file_path LIKE 'data:%' THEN octet_length(file_path) ELSE 0 END),0)::bigint content_bytes,
      COALESCE(SUM(octet_length(jsonb_build_object('id',id,'student_id',student_id,'document_type_id',document_type_id,
        'observations',observations,'uploaded_at',uploaded_at,'uploaded_by',uploaded_by,'created_at',created_at)::text)
        +CASE WHEN file_path NOT LIKE 'data:%' THEN octet_length(file_path) ELSE 0 END),0)::bigint metadata_bytes
      FROM student_documents WHERE student_id=$1`,[studentId])).rows[0];
    const recordsBytes=byTable.reduce((sum,row)=>sum+Number(row.logical_bytes),0)+Number(documents.metadata_bytes);
    const contentBytes=Number(documents.content_bytes);
    return {student,recordsBytes,contentBytes,logicalBytes:recordsBytes+contentBytes,
      documentCount:documents.records,externalCount:documents.external_count,
      byTable:[...byTable,{category:'Documentos',records:documents.records,logical_bytes:contentBytes+Number(documents.metadata_bytes)}],
      measuredAt:new Date().toISOString(),physicalDiskBytes:null};
  }
}

module.exports=StudentResourceService;
