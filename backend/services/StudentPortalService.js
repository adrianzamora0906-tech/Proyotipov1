const db=require('../config/database');
const {createError}=require('../middleware/errorHandler');

class StudentPortalService{
  static async studentForUser(userId){
    const result=await db.query(`SELECT s.*,b.name branch_name,b.code branch_code FROM users u JOIN students s ON s.id=u.student_id JOIN branches b ON b.id=s.branch_id WHERE u.id=$1 AND u.active=TRUE`,[userId]);
    if(!result.rows.length)throw createError(403,'Este usuario no está vinculado a un estudiante');
    return result.rows[0];
  }
  static async summary(userId,enrollmentId=null){
    const student=await this.studentForUser(userId);
    const enrollments=(await db.query(`SELECT e.id,e.course_id,e.status,e.created_at,c.name course_name FROM enrollments e
      JOIN courses c ON c.id=e.course_id WHERE e.student_id=$1 ORDER BY e.created_at DESC`,[student.id])).rows;
    if(enrollmentId && !enrollments.some(e=>e.id===enrollmentId))throw createError(404,'Matricula no encontrada');
    const enrollment=(await db.query(`SELECT e.*,c.name course_name,c.price,cc.id cycle_id,cc.code cycle_code,cc.start_date,cc.end_date,cc.status cycle_status,
      COALESCE(NULLIF(TRIM(CONCAT(iu.first_name,' ',iu.last_name)),''),'Por asignar') instructor_name,
      tg.start_date theory_group_start_date,tg.end_date theory_group_end_date,
      tg.start_time theory_group_start_time,tg.end_time theory_group_end_time,
      tg.status theory_group_status,
      NULLIF(TRIM(CONCAT(tu.first_name,' ',tu.last_name)),'') theory_instructor_name
      FROM enrollments e JOIN courses c ON c.id=e.course_id
      LEFT JOIN course_cycle_schedule_assignments a ON a.enrollment_id=e.id AND a.status='activo'
      LEFT JOIN course_cycles cc ON cc.id=a.cycle_id
      LEFT JOIN instructor_profiles ip ON ip.id=a.instructor_id LEFT JOIN users iu ON iu.id=ip.user_id
      LEFT JOIN theory_group_students tgs ON tgs.enrollment_id=e.id AND tgs.active=TRUE
      LEFT JOIN theory_course_groups tg ON tg.id=tgs.group_id AND tg.status<>'cancelado'
      LEFT JOIN instructor_profiles tip ON tip.id=tg.instructor_id
      LEFT JOIN users tu ON tu.id=tip.user_id
      WHERE e.student_id=$1 AND ($2::uuid IS NULL OR e.id=$2) ORDER BY e.created_at DESC LIMIT 1`,[student.id,enrollmentId])).rows[0]||null;
    const payment=enrollment?(await db.query(`SELECT p.total,p.final_amount,p.balance,p.status,
      COALESCE(SUM(pd.amount) FILTER(WHERE pd.status='ACTIVE'),0)::numeric paid,
      COALESCE((SELECT SUM(tv.amount) FROM transfer_payment_verifications tv
        WHERE tv.student_id=$2 AND tv.enrollment_id=$1 AND tv.status IN ('PENDING','AWAITING_APPROVAL') AND tv.service_transaction_id IS NULL),0)::numeric pending_transfer_amount,
      COALESCE((SELECT COUNT(*) FROM transfer_payment_verifications tv
        WHERE tv.student_id=$2 AND tv.enrollment_id=$1 AND tv.status IN ('PENDING','AWAITING_APPROVAL') AND tv.service_transaction_id IS NULL),0)::int pending_transfer_count
      FROM payments p LEFT JOIN payment_details pd ON pd.payment_id=p.id
      WHERE p.enrollment_id=$1 GROUP BY p.id ORDER BY p.created_at DESC LIMIT 1`,[enrollment.id,student.id])).rows[0]||null:null;
    const documents=(await db.query(`SELECT dt.code,dt.name,dt.required,sd.id IS NOT NULL uploaded,sd.uploaded_at
      FROM document_types dt LEFT JOIN student_documents sd ON sd.document_type_id=dt.id AND sd.student_id=$1
      WHERE dt.active=TRUE AND (dt.required=TRUE OR (
        dt.code='certificado_discapacidad' AND EXISTS(
          SELECT 1 FROM enrollments type_f_enrollment
          JOIN courses type_f_course ON type_f_course.id=type_f_enrollment.course_id
          WHERE type_f_enrollment.student_id=$1
            AND type_f_enrollment.status<>'cancelado'
            AND type_f_course.name ILIKE '%tipo f%'
        )
      )) ORDER BY dt.name`,[student.id])).rows;
    let classes=enrollment?(await db.query(`SELECT ps.id,ps.session_number,ps.scheduled_start,ps.scheduled_end,ps.status,ps.attendance_status,ps.performance_level,ps.observations,
      TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name,
      COALESCE((SELECT json_agg(json_build_object('code',st.code,'name',st.name) ORDER BY st.name) FROM practical_session_topic_records pstr JOIN session_topics st ON st.id=pstr.topic_id WHERE pstr.practical_session_id=ps.id),'[]'::json) topics
      FROM practical_sessions ps JOIN instructor_profiles ip ON ip.id=ps.instructor_id JOIN users u ON u.id=ip.user_id
      WHERE ps.enrollment_id=$1 AND ps.deleted_at IS NULL ORDER BY ps.scheduled_start`,[enrollment.id])).rows:[];
    if(enrollment&&!classes.length)classes=(await db.query(`SELECT a.id,NULL::int session_number,(a.schedule_date+a.start_time)::timestamp scheduled_start,
      (a.schedule_date+a.end_time)::timestamp scheduled_end,CASE WHEN a.schedule_date<CURRENT_DATE THEN 'COMPLETADA' WHEN a.schedule_date=CURRENT_DATE THEN 'PROGRAMADA' ELSE 'PROGRAMADA' END status,
      CASE WHEN a.schedule_date<CURRENT_DATE THEN 'Asistio' ELSE NULL END attendance_status,CASE WHEN a.schedule_date<CURRENT_DATE THEN 'Bueno' ELSE NULL END performance_level,NULL observations,
      TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor_name FROM course_cycle_schedule_assignments a
      LEFT JOIN instructor_profiles ip ON ip.id=a.instructor_id LEFT JOIN users u ON u.id=ip.user_id WHERE a.enrollment_id=$1 AND a.status='activo' ORDER BY a.schedule_date,a.start_time`,[enrollment.id])).rows;
    const attended=classes.filter(item=>{
      const status=String(item.attendance_status||'');
      return /asist/i.test(status) && !/no\s+asist|ausent/i.test(status);
    }).length;
    const absent=classes.filter(item=>/ausente|no asist/i.test(`${item.status} ${item.attendance_status}`)).length;
    const pending=classes.filter(item=>['PROGRAMADA','PENDIENTE','REPROGRAMADA'].includes(String(item.status||'').toUpperCase())).length;
    const scores={excelente:100,muy_bueno:90,'muy bueno':90,bueno:80,regular:65,deficiente:45,requiere_acompanamiento:50,en_desarrollo:70,cumplio_objetivo:85,domino_practicado:100};
    const performanceValues=classes.map(item=>scores[String(item.performance_level||'').toLowerCase()]).filter(Number.isFinite);
    const performance=performanceValues.length?Math.round(performanceValues.reduce((a,b)=>a+b,0)/performanceValues.length):null;
    return {student:{id:student.id,identification:student.identification,name:`${student.first_name} ${student.last_name}`,email:student.email,phone:student.phone,branch:student.branch_name,status:student.status},enrollment,enrollments,payment,documents,classes,metrics:{totalClasses:classes.length,attended,pending,absent,performance,documentsComplete:documents.filter(x=>x.uploaded).length,documentsTotal:documents.length}};
  }
}
module.exports=StudentPortalService;
