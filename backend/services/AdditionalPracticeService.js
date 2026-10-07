const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const AuditService = require('./AuditService');

class AdditionalPracticeService {
  static async checkAvailability(data, branchId) {
    const instructorId = data.instructor_id;
    const startDate = String(data.start_date || '');
    const startTime = String(data.daily_start_time || '');
    const days = Number(data.number_of_days);
    if (!instructorId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !Number.isInteger(days) || days < 3 || days > 8) {
      throw createError(422, 'Completa instructor, fecha, horario y duración');
    }
    const conflicts = await db.query(`
      WITH requested AS (
        SELECT d::date AS schedule_day, $3::time start_time, ($3::time + INTERVAL '100 minutes')::time end_time
        FROM generate_series($2::date, $2::date + 60, INTERVAL '1 day') d
      ), occupied AS (
        SELECT a.schedule_date AS schedule_day FROM course_cycle_schedule_assignments a JOIN requested r ON r.schedule_day=a.schedule_date
        WHERE a.instructor_id=$1 AND a.status='activo' AND a.start_time<r.end_time AND a.end_time>r.start_time
        UNION
        SELECT block.schedule_date AS schedule_day FROM referred_instructor_schedule_blocks block JOIN requested r ON r.schedule_day=block.schedule_date
        WHERE block.instructor_id=$1 AND block.status='activo' AND block.start_time<r.end_time AND block.end_time>r.start_time
        UNION
        SELECT ps.scheduled_start::date AS schedule_day FROM practical_sessions ps JOIN requested r ON r.schedule_day=ps.scheduled_start::date
        WHERE ps.instructor_id=$1 AND ps.deleted_at IS NULL AND UPPER(ps.status) NOT IN ('CANCELADA','CANCELADO')
          AND ps.scheduled_start::time<r.end_time AND ps.scheduled_end::time>r.start_time
        UNION
        SELECT d::date AS schedule_day FROM additional_driving_practices ap
        CROSS JOIN LATERAL generate_series(ap.start_date, ap.start_date + (ap.number_of_days - 1), INTERVAL '1 day') d
        JOIN requested r ON r.schedule_day=d::date
        WHERE ap.instructor_id=$1 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
          AND ap.daily_start_time<r.end_time AND (ap.daily_start_time + INTERVAL '100 minutes')::time>r.start_time
      ) SELECT schedule_day FROM occupied ORDER BY schedule_day
    `, [instructorId, startDate, startTime]);
    const instructor = await db.query(`SELECT TRIM(CONCAT(u.first_name,' ',u.last_name)) name FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id WHERE ip.id=$1`, [instructorId]);
    const dateKey = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
    const occupiedDays = new Set(conflicts.rows.map(row => dateKey(row.schedule_day)));
    const requestedStart = new Date(`${startDate}T00:00:00Z`);
    const windowIsFree = candidate => {
      for (let offset=0; offset<days; offset+=1) {
        const day = new Date(candidate); day.setUTCDate(day.getUTCDate()+offset);
        if (occupiedDays.has(day.toISOString().slice(0,10))) return false;
      }
      return true;
    };
    const available = windowIsFree(requestedStart);
    const candidate = new Date(requestedStart);
    while (!windowIsFree(candidate) && candidate < new Date(requestedStart.getTime() + 60*86400000)) candidate.setUTCDate(candidate.getUTCDate()+1);
    const availableFrom = candidate.toISOString().slice(0,10);
    const alternative = await db.query(`
      SELECT ip.id, TRIM(CONCAT(u.first_name,' ',u.last_name)) name
      FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
      WHERE u.branch_id=$1 AND u.active=TRUE AND ip.id<>$2
        AND NOT EXISTS (
          SELECT 1 FROM course_cycle_schedule_assignments a
          WHERE a.instructor_id=ip.id AND a.status='activo'
            AND a.schedule_date BETWEEN $3::date AND $3::date + ($5::int-1)
            AND a.start_time < ($4::time + INTERVAL '100 minutes')::time AND a.end_time>$4::time
        )
        AND NOT EXISTS (
          SELECT 1 FROM referred_instructor_schedule_blocks block
          WHERE block.instructor_id=ip.id AND block.status='activo'
            AND block.schedule_date BETWEEN $3::date AND $3::date + ($5::int-1)
            AND block.start_time < ($4::time + INTERVAL '100 minutes')::time AND block.end_time>$4::time
        )
      ORDER BY name LIMIT 1
    `, [branchId, instructorId, startDate, startTime, days]);
    return { available, available_from: availableFrom, conflict_dates: [...occupiedDays], instructor_name: instructor.rows[0]?.name, alternative_instructor: alternative.rows[0] || null };
  }

  static async resolveByIdentification(identification) {
    const clean = String(identification || '').replace(/\D/g, '');
    if (!clean) throw createError(422, 'Ingresa una cédula válida');
    const result = await db.query(`
      SELECT s.*, TRUE AS former_student
      FROM students s WHERE s.identification=$1 LIMIT 1
    `, [clean]);
    return result.rows[0] || null;
  }

  static calculatePrice(days, formerStudent) {
    const numberOfDays = Number(days);
    if (!Number.isInteger(numberOfDays) || numberOfDays < 3 || numberOfDays > 8) {
      throw createError(422, 'La práctica debe durar entre 3 y 8 días');
    }
    const dailyRate = formerStudent ? 17 : 20;
    return { dailyRate, totalAmount: numberOfDays === 8 ? 136 : numberOfDays * dailyRate };
  }

  static async create(studentId, data, actor, requestContext = {}) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const studentResult = await client.query(`
        SELECT s.*, EXISTS(SELECT 1 FROM enrollments e WHERE e.student_id=s.id) former_student
        FROM students s WHERE s.id=$1 FOR UPDATE
      `, [studentId]);
      if (!studentResult.rows.length) throw createError(404, 'Estudiante no encontrado');
      const student = studentResult.rows[0];
      if (student.status === 'inhabilitado') throw createError(409, 'Habilita al estudiante antes de registrar practicas');
      const branchId = data.branch_id || actor.branch_id;
      if (!branchId) throw createError(422, 'La sucursal es requerida');

      const referredByUserId = data.referred_by_user_id || null;
      let referrer = null;
      if (referredByUserId) {
        referrer = (await client.query(`
          SELECT u.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name
          FROM users u
          WHERE u.id=$1 AND u.active=TRUE AND u.student_id IS NULL AND u.branch_id IS NOT NULL
        `, [referredByUserId])).rows[0];
        if (!referrer) throw createError(422, 'La persona que refirio las practicas no es valida');
      }

      const instructor = await client.query(`
        SELECT ip.id FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id
        WHERE ip.id=$1 AND u.branch_id=$2 AND u.active=TRUE
      `, [data.instructor_id, branchId]);
      if (!instructor.rows.length) throw createError(422, 'El instructor no pertenece a la sucursal seleccionada');

      const availability = await this.checkAvailability(data, branchId);
      if (!availability.available) throw createError(409, `${availability.instructor_name || 'El instructor'} no está disponible en ese horario. Disponible desde ${availability.available_from}`);

      const startDate = String(data.start_date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw createError(422, 'Selecciona una fecha de inicio válida');
      const dailyStartTime = String(data.daily_start_time || '');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyStartTime)) throw createError(422, 'Selecciona un horario válido');
      const formerStudent = data.customer_type === 'FORMER_STUDENT';
      const { dailyRate, totalAmount } = this.calculatePrice(data.number_of_days, formerStudent);
      const service = await client.query("SELECT id FROM service_catalog WHERE code='PRACTICA_LICENCIADOS' AND active=TRUE LIMIT 1");
      if (!service.rows.length) throw createError(500, 'El servicio de prácticas adicionales no está configurado');
      const paymentMethod = String(data.payment_method || 'pendiente').toLowerCase();
      const transactionStatus = paymentMethod === 'pendiente' ? 'PENDING' : 'PAID';

      const transaction = await client.query(`
        INSERT INTO service_transactions
          (service_id,branch_id,student_id,customer_identification,customer_name,customer_email,
           customer_phone,amount,payment_method,status,performed_at,result)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::date,'PROGRAMADA') RETURNING id
      `, [service.rows[0].id, branchId, student.id, student.identification,
        `${student.first_name} ${student.last_name}`.trim(), student.email, student.phone,
        totalAmount, paymentMethod, transactionStatus, startDate]);

      const practice = await client.query(`
        INSERT INTO additional_driving_practices
          (transaction_id,student_id,branch_id,instructor_id,customer_type,number_of_days,
           daily_rate,total_amount,start_date,daily_start_time,created_by,referred_by_user_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
      `, [transaction.rows[0].id, student.id, branchId, data.instructor_id,
        formerStudent ? 'FORMER_STUDENT' : 'EXTERNAL', Number(data.number_of_days),
        dailyRate, totalAmount, startDate, dailyStartTime, actor.id, referredByUserId]);
      const notes = String(data.notes || '').trim().slice(0, 500);
      if (!student.former_student) {
        await client.query(`
          UPDATE students
          SET registration_type='ADDITIONAL_PRACTICE',
            notes=COALESCE($3, notes),
            updated_by=$2,
            updated_at=NOW()
          WHERE id=$1
        `, [student.id, actor.id, notes || null]);
      } else if (notes) {
        await client.query(`
          UPDATE students
          SET notes=$2, updated_by=$3, updated_at=NOW()
          WHERE id=$1
        `, [student.id, notes, actor.id]);
      }
      await client.query('INSERT INTO history(student_id,action) VALUES ($1,$2)', [
        student.id, `Práctica adicional registrada: ${data.number_of_days} días con instructor asignado`,
      ]);
      await AuditService.log({
        userId: actor.id,
        role: actor.role,
        branchId,
        action: 'ADDITIONAL_PRACTICE_CREATED',
        module: 'ESTUDIANTES',
        entityType: 'ADDITIONAL_DRIVING_PRACTICE',
        entityId: practice.rows[0].id,
        description: referrer
          ? `Horas practicas registradas con referido ${referrer.name}`
          : 'Horas practicas registradas sin referido',
        metadata: { studentId: student.id, instructorId: data.instructor_id, referredByUserId,
          customerType: formerStudent ? 'FORMER_STUDENT' : 'EXTERNAL',
          formerStudentDeclared: formerStudent && data.former_student_declared === true },
        requestContext,
      }, client);
      const access = await require('./StudentAccountService').createForStudent(student.id, client);
      await client.query('COMMIT');
      return { ...practice.rows[0], former_student: formerStudent, access };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}

module.exports = AdditionalPracticeService;
