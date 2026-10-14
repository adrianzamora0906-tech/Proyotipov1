const crypto = require('crypto');
const db = require('../config/database');
const Audit = require('./AuditService');

class AttendanceAuditService {
  static async record(req, stage, error = null) {
    try {
      const byCode = req.params.code !== undefined;
      const hash = crypto.createHash('sha256').update(String(byCode ? req.params.code : req.params.token)).digest('hex');
      // Link a challenge only when it belongs to the authenticated student.
      const context = (await db.query(`SELECT u.student_id,u.branch_id user_branch_id,
        TRIM(CONCAT(s.first_name,' ',s.last_name)) student_name,
        ps.id session_id,ps.branch_id,ps.instructor_id,aq.attendance_phase,
        TRIM(CONCAT(iu.first_name,' ',iu.last_name)) instructor_name
        FROM users u LEFT JOIN students s ON s.id=u.student_id
        LEFT JOIN LATERAL (SELECT candidate.* FROM attendance_qr_challenges candidate
          JOIN practical_sessions session ON session.id=candidate.practical_session_id
          JOIN enrollments enrollment ON enrollment.id=session.enrollment_id
          WHERE candidate.${byCode ? 'numeric_code_hash' : 'token_hash'}=$2
            AND enrollment.student_id=u.student_id LIMIT 1) aq ON TRUE
        LEFT JOIN practical_sessions ps ON ps.id=aq.practical_session_id
        LEFT JOIN instructor_profiles ip ON ip.id=ps.instructor_id
        LEFT JOIN users iu ON iu.id=ip.user_id WHERE u.id=$1`, [req.user.id,hash])).rows[0] || {};
      const stageName = { scan:'validar QR o codigo', location:'validar ubicacion', confirm:'confirmar asistencia' }[stage];
      const outcome = error ? 'REJECTED' : 'ACCEPTED';
      const reason = error ? (error.status && error.status < 500 ? error.message : 'Error del servidor') : null;
      const description = `${context.student_name || 'Estudiante'} intento ${stageName}: ${error ? `rechazado (${reason})` : 'solicitud aceptada'}${context.attendance_phase ? `; ${context.attendance_phase === 'EXIT' ? 'salida' : 'entrada'}` : ''}${context.instructor_name ? `; instructor ${context.instructor_name}` : ''}`;
      await Audit.log({userId:req.user.id,role:req.user.role,branchId:context.branch_id || context.user_branch_id,
        action:error ? 'ATTENDANCE_QR_ATTEMPT_FAILED' : 'ATTENDANCE_QR_ATTEMPT_ACCEPTED',module:'ASISTENCIA',
        entityType:context.session_id ? 'PRACTICAL_SESSION' : 'USER',entityId:context.session_id || req.user.id,
        description,requestContext:req.requestContext,
        metadata:{studentId:context.student_id,instructorId:context.instructor_id,phase:context.attendance_phase,
          stage,outcome,method:byCode ? 'code' : 'qr',reason,statusCode:error?.status || (error ? 500 : 200)}},db);
    } catch (auditError) {
      // An audit outage must not change the result of an attendance operation.
      console.error('No se pudo auditar el intento de asistencia:', auditError.message);
    }
  }

  static async run(req, stage, operation) {
    try {
      const result = await operation();
      await this.record(req,stage);
      return result;
    } catch (error) {
      await this.record(req,stage,error);
      throw error;
    }
  }
}
module.exports = AttendanceAuditService;
