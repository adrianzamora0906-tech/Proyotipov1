const db=require('../config/database');
class AuditQueryService {
  static async list(auth, filters = {}) {
    const limit = [25, 50, 100].includes(Number(filters.limit)) ? Number(filters.limit) : 50;
    const page = Math.max(Number(filters.page) || 1, 1);
    const params = [];
    const where = ['1=1'];
    if (!auth.global) { params.push(auth.branchId); where.push(`al.branch_id=$${params.length}`); }
    else if (filters.branchId) { params.push(filters.branchId); where.push(`al.branch_id=$${params.length}`); }
    for (const [key, column] of Object.entries({ action: 'al.action', module: 'al.module', userId: 'al.user_id', entityType: 'al.entity_type', entityId: 'al.entity_id' })) {
      if (filters[key]) { params.push(filters[key]); where.push(`${column}=$${params.length}`); }
    }
    if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`al.created_at>=$${params.length}::date`); }
    if (filters.dateTo) { params.push(filters.dateTo); where.push(`al.created_at<$${params.length}::date + INTERVAL '1 day'`); }
    const total = (await db.query(`SELECT COUNT(*)::int total FROM audit_logs al WHERE ${where.join(' AND ')}`, params)).rows[0].total;
    params.push(limit, (page - 1) * limit);
    const r = await db.query(`
      SELECT al.*,u.username,u.first_name,u.last_name,b.name branch_name,
        TRIM(CONCAT(attendance_student.first_name,' ',attendance_student.last_name)) attendance_student_name,
        attendance_student.identification attendance_identification,
        TRIM(CONCAT(attendance_instructor.first_name,' ',attendance_instructor.last_name)) attendance_instructor_name,
        vr.status void_request_status,vr.reason void_request_reason,vr.review_note,
        vr.requested_at,vr.reviewed_at,
        COALESCE(NULLIF(TRIM(requester.first_name || ' ' || requester.last_name),''),requester.username) requested_by_name,
        COALESCE(NULLIF(TRIM(reviewer.first_name || ' ' || reviewer.last_name),''),reviewer.username) reviewed_by_name
      FROM audit_logs al
      LEFT JOIN users u ON u.id=al.user_id
      LEFT JOIN branches b ON b.id=al.branch_id
      LEFT JOIN practical_sessions attendance_session ON al.action LIKE 'ATTENDANCE_%'
        AND attendance_session.id::text=al.entity_id::text
      LEFT JOIN enrollments attendance_enrollment ON attendance_enrollment.id=attendance_session.enrollment_id
      LEFT JOIN students attendance_student ON attendance_student.id=attendance_enrollment.student_id
      LEFT JOIN instructor_profiles attendance_profile ON attendance_profile.id=attendance_session.instructor_id
      LEFT JOIN users attendance_instructor ON attendance_instructor.id=attendance_profile.user_id
      LEFT JOIN payment_void_requests vr ON al.action='PAYMENT_VOIDED' AND vr.payment_detail_id::text=al.entity_id::text
      LEFT JOIN users requester ON requester.id=vr.requested_by
      LEFT JOIN users reviewer ON reviewer.id=vr.reviewed_by
      WHERE ${where.join(' AND ')}
      ORDER BY al.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { data: r.rows, pagination: { page, limit, total, pages: Math.max(Math.ceil(total / limit), 1) } };
  }

  static async summary(auth) {
    const params = [];
    let where = 'created_at>=CURRENT_DATE';
    if (!auth.global) { params.push(auth.branchId); where += ' AND branch_id=$1'; }
    const r = await db.query(`SELECT COUNT(*)::int actions_today,COUNT(DISTINCT user_id)::int active_users,COUNT(*) FILTER(WHERE module='FINANCIERO')::int financial_actions,COUNT(*) FILTER(WHERE module IN('CONFIGURACION','PERMISOS','ROLES','USUARIOS'))::int administrative_actions FROM audit_logs WHERE ${where}`, params);
    return r.rows[0];
  }

  static async paymentVoids(auth, filters = {}) {
    const page = Math.max(Number(filters.page) || 1, 1);
    const limit = 10;
    const params = [];
    const where = ['1=1'];
    if (!auth.global) { params.push(auth.branchId); where.push(`r.branch_id=$${params.length}`); }
    else if (filters.branchId) { params.push(filters.branchId); where.push(`r.branch_id=$${params.length}`); }
    if (filters.status) { params.push(String(filters.status).toUpperCase()); where.push(`r.status=$${params.length}`); }
    if (filters.dateFrom) { params.push(filters.dateFrom); where.push(`r.requested_at >= $${params.length}::date`); }
    if (filters.dateTo) { params.push(filters.dateTo); where.push(`r.requested_at < $${params.length}::date + INTERVAL '1 day'`); }
    const clause = where.join(' AND ');
    const count = (await db.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE r.status='PENDING')::int pending,COUNT(*) FILTER(WHERE r.status='APPROVED')::int approved,COUNT(*) FILTER(WHERE r.status='REJECTED')::int rejected,COALESCE(SUM(pd.amount) FILTER(WHERE r.status='APPROVED'),0)::numeric approved_amount FROM payment_void_requests r JOIN payment_details pd ON pd.id=r.payment_detail_id WHERE ${clause}`, params)).rows[0];
    const listParams = [...params, limit, (page - 1) * limit];
    const rows = (await db.query(`
      SELECT r.id,r.status,r.reason,r.review_note,r.requested_at,r.reviewed_at,
        pd.id payment_detail_id,pd.amount,pd.payment_method,pd.reference,p.id payment_id,
        s.id student_id,s.identification,s.first_name || ' ' || s.last_name student_name,
        b.id branch_id,b.name branch_name,
        COALESCE(NULLIF(TRIM(requester.first_name || ' ' || requester.last_name),''),requester.username) requested_by_name,
        COALESCE(NULLIF(TRIM(reviewer.first_name || ' ' || reviewer.last_name),''),reviewer.username) reviewed_by_name
      FROM payment_void_requests r
      JOIN payment_details pd ON pd.id=r.payment_detail_id
      JOIN payments p ON p.id=pd.payment_id
      JOIN enrollments e ON e.id=p.enrollment_id
      JOIN students s ON s.id=e.student_id
      JOIN branches b ON b.id=r.branch_id
      JOIN users requester ON requester.id=r.requested_by
      LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by
      WHERE ${clause}
      ORDER BY CASE r.status WHEN 'PENDING' THEN 0 ELSE 1 END,r.requested_at DESC
      LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`, listParams)).rows;
    const branches = auth.global ? (await db.query('SELECT id,name FROM branches WHERE active=TRUE ORDER BY name')).rows : [];
    return { data: rows, summary: count, branches, pagination: { page, limit, total: count.total, pages: Math.max(Math.ceil(count.total / limit), 1) } };
  }
}
module.exports=AuditQueryService;
