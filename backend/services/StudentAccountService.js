const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const db = require('../config/database');
const SessionService = require('./SessionService');
const AuditService = require('./AuditService');
const { createError } = require('../middleware/errorHandler');

class StudentAccountService {
  static async createForStudent(studentId, client = db) {
    const existing = await client.query('SELECT id,username FROM users WHERE student_id=$1', [studentId]);
    if (existing.rows.length) return { created:false,username:existing.rows[0].username };
    const result = await client.query(`SELECT s.* FROM students s WHERE s.id=$1`,[studentId]);
    if (!result.rows.length) throw new Error('Estudiante no encontrado para crear acceso');
    const student=result.rows[0];
    const username=String(student.identification || '').trim();
    if (!username) throw createError(422, 'La cedula es requerida para crear el usuario');
    if ((await client.query('SELECT 1 FROM users WHERE username=$1',[username])).rows.length) {
      throw createError(409, 'Ya existe otra cuenta con esa cedula como usuario');
    }
    const temporaryPassword=username;
    const hash=await bcrypt.hash(temporaryPassword,12);
    // El correo pertenece al expediente del estudiante, pero en usuarios debe ser único.
    // Si ya lo utiliza otra cuenta, conservamos el correo en students y permitimos
    // crear el acceso con el nombre de usuario generado.
    let accountEmail = student.email || null;
    if (accountEmail) {
      const emailInUse = await client.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [accountEmail]);
      if (emailInUse.rows.length) accountEmail = null;
    }
    const user=(await client.query(`INSERT INTO users(branch_id,student_id,first_name,last_name,username,email,phone,password_hash,role,active,must_change_password)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,'estudiante',TRUE,TRUE) RETURNING id,username`,[
      student.branch_id,student.id,student.first_name,student.last_name,username,accountEmail,student.phone,hash
    ])).rows[0];
    const role=(await client.query("SELECT id FROM roles WHERE code='STUDENT' AND active=TRUE")).rows[0];
    if(!role) throw new Error('El rol STUDENT no está disponible');
    await client.query(`INSERT INTO user_roles(user_id,role_id,branch_id,active,created_by) VALUES($1,$2,$3,TRUE,$4)`,[user.id,role.id,student.branch_id,student.created_by]);
    return {created:true,userId:user.id,username,temporaryPassword,mustChangePassword:true};
  }

  static async resetTemporaryPassword(studentId, actor, requestContext) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const result = await client.query(`
        SELECT u.id, u.username, u.branch_id
        FROM users u
        WHERE u.student_id = $1
        FOR UPDATE
      `, [studentId]);
      if (!result.rows.length) throw createError(404, 'El estudiante no tiene una cuenta de acceso');

      const account = result.rows[0];
      const temporaryPassword = `Sm@${crypto.randomBytes(3).toString('hex').slice(0, 5)}`;
      const passwordHash = await bcrypt.hash(temporaryPassword, 12);
      await client.query(`
        UPDATE users
        SET password_hash = $2, active = TRUE, failed_login_attempts = 0,
          locked_until = NULL, must_change_password = TRUE,
          password_changed_at = NOW(), updated_at = NOW()
        WHERE id = $1
      `, [account.id, passwordHash]);
      await SessionService.revokeAllForUser(account.id, 'Contraseña temporal restablecida desde el expediente', client);
      await AuditService.log({
        userId: actor.id,
        branchId: account.branch_id,
        role: actor.role,
        action: 'USER_UPDATED',
        module: 'ESTUDIANTES',
        entityType: 'USER',
        entityId: account.id,
        description: 'Contraseña temporal del estudiante restablecida',
        newValues: { mustChangePassword: true, active: true },
        requestContext,
      }, client);
      await client.query('COMMIT');
      return {
        username: account.username,
        temporaryPassword,
        mustChangePassword: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports=StudentAccountService;
