const db=require('../config/database');
const Audit=require('./AuditService');
const {createError}=require('../middleware/errorHandler');
const uuid=value=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
class InstructorChangeFeedbackService {
  static async create(changes,actor,reason,client) {
    const groups=new Map();
    for(const change of changes){
      if(!change.previousInstructorId||change.previousInstructorId===change.newInstructorId)continue;
      const key=[change.enrollmentId,change.previousInstructorId,change.newInstructorId].join(':');
      const group=groups.get(key)||{...change,classes:[]};group.classes.push(change.assignmentId);groups.set(key,group);
    }
    for(const group of groups.values()){
      const created=(await client.query(`INSERT INTO instructor_change_feedback(student_id,enrollment_id,branch_id,
        previous_instructor_id,new_instructor_id,previous_instructor_user_id,created_by,administrative_reason,changed_classes)
        SELECT $1,$2,$3,$4,$5,ip.user_id,$6,$7,$8::jsonb FROM instructor_profiles ip WHERE ip.id=$4 RETURNING id`,
      [group.studentId,group.enrollmentId,group.branchId,group.previousInstructorId,group.newInstructorId,actor.id,reason,JSON.stringify(group.classes)])).rows[0];
      if(!created)throw createError(409,'No se pudo abrir el seguimiento del cambio');
      await Audit.log({userId:actor.id,role:actor.role,branchId:group.branchId,action:'INSTRUCTOR_CHANGE_FEEDBACK_CREATED',module:'HORARIOS',entityType:'INSTRUCTOR_CHANGE_FEEDBACK',entityId:created.id,
        description:'Seguimiento privado solicitado al estudiante y al instructor anterior',metadata:{studentId:group.studentId,classes:group.classes.length}},client);
      const recipients=(await client.query('SELECT id FROM users WHERE student_id=$1 UNION SELECT user_id id FROM instructor_profiles WHERE id=$2',[group.studentId,group.previousInstructorId])).rows.map(r=>r.id);
      await client.query("SELECT pg_notify('erp_instructor_feedback',$1)",[JSON.stringify({type:'instructor-feedback-changed',userIds:recipients})]);
    }
  }
  static async pending(actor) {
    // Select explicit public fields: never return either private response to participants.
    return (await db.query(`SELECT f.id,f.created_at,CONCAT_WS(' ',s.first_name,s.last_name) student_name,
      CASE WHEN u.student_id=f.student_id THEN 'student' ELSE 'instructor' END participant
      FROM instructor_change_feedback f JOIN students s ON s.id=f.student_id
      JOIN users u ON u.id=$1
      WHERE (u.student_id=f.student_id AND f.student_response IS NULL)
        OR (f.previous_instructor_user_id=u.id AND f.instructor_response IS NULL)
      ORDER BY f.created_at,f.id LIMIT 50`,[actor.id])).rows;
  }
  static async respond(id,text,actor) {
    if(!uuid(id))throw createError(422,'Seguimiento invalido');
    const response=typeof text==='string'?text.trim():'';
    if(response.length<10||response.length>3000)throw createError(422,'Escribe entre 10 y 3000 caracteres');
    const c=await db.getClient();
    try{
      await c.query('BEGIN');
      const row=(await c.query(`SELECT f.*,u.student_id current_student FROM instructor_change_feedback f
        JOIN users u ON u.id=$2 WHERE f.id=$1 FOR UPDATE OF f`,[id,actor.id])).rows[0];
      if(!row)throw createError(404,'Seguimiento no encontrado');
      const participant=row.current_student===row.student_id?'student':row.previous_instructor_user_id===actor.id?'instructor':null;
      if(!participant)throw createError(403,'No puedes responder este seguimiento');
      if(row[participant+'_response']!==null)throw createError(409,'Tu comentario ya fue enviado');
      await c.query(`UPDATE instructor_change_feedback SET ${participant}_response=$2,${participant}_responded_by=$3,${participant}_responded_at=NOW() WHERE id=$1`,[id,response,actor.id]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:row.branch_id,action:'INSTRUCTOR_CHANGE_FEEDBACK_RESPONDED',module:'HORARIOS',entityType:'INSTRUCTOR_CHANGE_FEEDBACK',entityId:id,
        description:'Comentario privado registrado',metadata:{participant}},c);
      await c.query('COMMIT');return {id,submitted:true};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
  static assertAdmin(authorization) {
    if(!authorization?.roles?.some(role=>['ADMIN_SYSTEM','BRANCH_ADMIN','GENERAL_MANAGER'].includes(role)))throw createError(403,'Solo administracion puede consultar los comentarios');
  }
  static async list(studentId,actor,authorization) {
    this.assertAdmin(authorization);
    if(!uuid(studentId))throw createError(422,'Estudiante invalido');
    const branch=authorization.operationalCoverage?.operational_branch_id||authorization.branchId||actor.branch_id;
    return (await db.query(`SELECT f.*,CONCAT_WS(' ',old.first_name,old.last_name) previous_instructor_name,
      CONCAT_WS(' ',next.first_name,next.last_name) new_instructor_name
      FROM instructor_change_feedback f JOIN instructor_profiles oi ON oi.id=f.previous_instructor_id
      JOIN users old ON old.id=oi.user_id JOIN instructor_profiles ni ON ni.id=f.new_instructor_id
      JOIN users next ON next.id=ni.user_id WHERE f.student_id=$1 AND ($2::boolean OR f.branch_id=$3)
      ORDER BY f.created_at DESC LIMIT 100`,[studentId,Boolean(authorization.global),branch])).rows;
  }
  static async review(id,actor,authorization) {
    this.assertAdmin(authorization);
    if(!uuid(id))throw createError(422,'Seguimiento invalido');
    const c=await db.getClient();
    try{
      await c.query('BEGIN');
      const row=(await c.query(`SELECT id,branch_id FROM instructor_change_feedback WHERE id=$1 AND student_response IS NOT NULL AND instructor_response IS NOT NULL
        AND ($2::boolean OR branch_id=$3) FOR UPDATE`,[id,Boolean(authorization.global),authorization.operationalCoverage?.operational_branch_id||authorization.branchId||actor.branch_id])).rows[0];
      if(!row)throw createError(409,'No disponible o faltan respuestas');
      await c.query('UPDATE instructor_change_feedback SET reviewed_by=$2,reviewed_at=NOW() WHERE id=$1',[id,actor.id]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:row.branch_id,action:'INSTRUCTOR_CHANGE_FEEDBACK_REVIEWED',module:'HORARIOS',entityType:'INSTRUCTOR_CHANGE_FEEDBACK',entityId:id,description:'Administracion reviso ambas respuestas'},c);
      await c.query('COMMIT');return {id,reviewed:true};
    }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
  }
}
module.exports=InstructorChangeFeedbackService;
