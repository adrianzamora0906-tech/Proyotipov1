const db = require('../config/database');
const StudentAccountService = require('./StudentAccountService');
const ReferralCampaignService = require('./ReferralCampaignService');
const { createError } = require('../middleware/errorHandler');

class StudentService {
  static async getActiveSeatReservations(filters = {}) {
    await db.query('SELECT expire_course_cycle_seat_reservations()');
    const params = [];
    let where = "reservation.status='activo'";
    const add = value => { params.push(value); return `$${params.length}`; };
    if (filters.branch_id) where += ` AND reservation.branch_id=${add(filters.branch_id)}`;
    if (filters.city_id) where += ` AND branch.city_id=${add(filters.city_id)}`;
    if (filters.province) where += ` AND LOWER(branch.province)=LOWER(${add(filters.province)})`;
    if (filters.city) where += ` AND LOWER(branch.city)=LOWER(${add(filters.city)})`;
    if (filters.created_only && filters.created_by) where += ` AND reservation.created_by=${add(filters.created_by)}`;
    if (filters.search) {
      const value = add(`%${String(filters.search).trim()}%`);
      where += ` AND (reservation.referred_name ILIKE ${value} OR reservation.referred_identification ILIKE ${value} OR instructor_user.first_name ILIKE ${value} OR instructor_user.last_name ILIKE ${value})`;
    }
    if (filters.course_type === 'carro') {
      where += ` AND (course.name ILIKE '%autom%' OR course.name ILIKE '%carro%' OR course.name ILIKE '%clase b%')`;
    } else if (filters.course_type === 'moto') {
      where += ` AND (course.name ILIKE '%moto%' OR course.name ILIKE '%clase a%')`;
    }
    const result = await db.query(`
      SELECT reservation.id,reservation.cycle_id,reservation.course_id,reservation.branch_id,reservation.instructor_id,
        reservation.referred_name name,
        reservation.referred_identification identification,reservation.referred_phone phone,
        reservation.created_at,reservation.expires_at,reservation.reservation_kind,reservation.draft_data,
        branch.name branch_name,branch.city_id,branch.city,branch.province,
        course.name course_name,cycle.code cycle_code,cycle.start_date,cycle.end_date,
        TRIM(CONCAT(instructor_user.first_name,' ',instructor_user.last_name)) instructor_name,
        requested.start_time,requested.end_time
      FROM course_cycle_seat_reservations reservation
      JOIN branches branch ON branch.id=reservation.branch_id
      JOIN courses course ON course.id=reservation.course_id
      JOIN course_cycles cycle ON cycle.id=reservation.cycle_id
      JOIN instructor_profiles instructor ON instructor.id=reservation.instructor_id
      JOIN users instructor_user ON instructor_user.id=instructor.user_id
      LEFT JOIN LATERAL (
        SELECT to_char(o.start_time,'HH24:MI') start_time,to_char(o.end_time,'HH24:MI') end_time
        FROM instructor_availability_overrides o
        WHERE o.instructor_id=reservation.instructor_id AND o.active=TRUE AND o.status='reserved'
          AND o.reason LIKE CONCAT('RESERVA_CURSO:',reservation.id,':%')
        ORDER BY o.schedule_date,o.start_time LIMIT 1
      ) requested ON TRUE
      WHERE ${where}
      ORDER BY cycle.start_date,requested.start_time,reservation.referred_name
    `, params);
    return result.rows;
  }

  static async createTemporarySeatReservation(data = {}, user, access = {}) {
    const identification=String(data.identification||'').replace(/\D/g,'');
    const firstName=String(data.firstName||'').trim(),lastName=String(data.lastName||'').trim();
    const branchId=data.branchId,courseId=data.courseId,instructorId=data.instructorId;
    const plan=data.schedulePlan&&typeof data.schedulePlan==='object'?data.schedulePlan:{};
    const selections=Array.isArray(plan.selections)?plan.selections:[];
    if(identification.length!==10||!firstName||!lastName)throw createError(422,'Cédula, nombre y apellido son requeridos para reservar');
    if(!branchId||!courseId||!instructorId||!selections.length)throw createError(422,'Sucursal, curso, instructor y horario son requeridos para reservar');
    const cycleId=selections[0].cycleId;
    if(!cycleId||selections.some(item=>String(item.cycleId)!==String(cycleId)))throw createError(422,'Todos los horarios deben pertenecer al mismo curso');
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      await client.query('SELECT expire_course_cycle_seat_reservations()');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`temporary-seat:${cycleId}:${instructorId}`]);
      const cycle=(await client.query(`SELECT cc.id,cc.branch_id,cc.course_id,cc.start_date,cc.end_date,cc.modality
        FROM course_cycles cc WHERE cc.id=$1 AND cc.branch_id=$2 AND cc.course_id=$3 AND cc.active=TRUE
          AND cc.deleted_at IS NULL AND cc.status IN('activo','proximo') AND CURRENT_DATE<=cc.start_date+2`,[cycleId,branchId,courseId])).rows[0];
      if(!cycle)throw createError(409,'El curso seleccionado ya no admite reservas');
      if(!access.global&&String(user.branch_id)!==String(branchId)){
        const allowed=await client.query(`SELECT 1 FROM branches requested JOIN branches own ON own.id=$2
          WHERE requested.id=$1 AND requested.city_id=own.city_id`,[branchId,user.branch_id]);
        if(!allowed.rowCount)throw createError(403,'No puedes reservar en esta sucursal');
      }
      const belongs=await client.query(`SELECT 1 FROM course_cycles cc WHERE cc.id=$1 AND (
        EXISTS(SELECT 1 FROM course_cycle_instructors cci WHERE cci.cycle_id=cc.id AND cci.instructor_id=$2 AND cci.active=TRUE)
        OR EXISTS(SELECT 1 FROM instructor_group_members igm WHERE igm.group_id=cc.group_id AND igm.instructor_id=$2 AND igm.active=TRUE AND igm.ended_at IS NULL))`,[cycleId,instructorId]);
      if(!belongs.rowCount)throw createError(422,'El instructor no pertenece al curso seleccionado');
      const duplicate=await client.query(`SELECT 1 FROM course_cycle_seat_reservations
        WHERE status='activo' AND referred_identification=$1 AND expires_at>NOW()`,[identification]);
      if(duplicate.rowCount)throw createError(409,'Esta cédula ya tiene una reserva activa');
      for(const selection of selections){
        const time=String(selection.time||''),match=time.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/),date=String(selection.date||'');
        if(!match||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw createError(422,'El horario seleccionado no es válido');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`instructor-slot:${instructorId}:${date}:${match[1]}:${match[2]}`]);
        // Compartir el mismo candado que usa la matrícula definitiva evita que
        // una reserva y una inscripción confirmen simultáneamente el mismo cupo.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${cycleId}:${date}:${match[1]}:${match[2]}`]);
        const validTemplate=await client.query(`SELECT 1 FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id AND t.active=TRUE
          WHERE p.branch_id=$1 AND p.course_id=$2 AND t.modality=$3 AND t.day_of_week=EXTRACT(DOW FROM $4::date)
            AND t.start_time=$5::time AND t.end_time=$6::time`,[branchId,courseId,cycle.modality,date,match[1],match[2]]);
        if(!validTemplate.rowCount)throw createError(422,'Uno de los horarios no pertenece al curso');
        const busy=await client.query(`SELECT 1 FROM (
          SELECT instructor_id,schedule_date,start_time,end_time FROM course_cycle_schedule_assignments WHERE status='activo'
          UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks WHERE status='activo'
          UNION ALL SELECT instructor_id,schedule_date,start_time,end_time FROM instructor_availability_overrides WHERE active=TRUE
        ) occupied WHERE instructor_id=$1 AND schedule_date=$2::date AND start_time<$4::time AND end_time>$3::time LIMIT 1`,[instructorId,date,match[1],match[2]]);
        if(busy.rowCount)throw createError(409,`El horario ${date} ${match[1]} ya no está disponible`);
      }
      const safeDraft={birthDate:data.birthDate||null,email:String(data.email||'').slice(0,160),phone:String(data.phone||'').slice(0,40),address:String(data.address||'').slice(0,300),bloodType:data.bloodType||null,cityId:data.cityId||null,referredByUserId:data.referredByUserId||null,theorySchedule:plan.theorySchedule||null,schedulePlan:plan};
      const firstTime=String(selections[0].time).match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
      const reservation=(await client.query(`INSERT INTO course_cycle_seat_reservations
        (cycle_id,instructor_id,referred_name,referred_phone,referred_identification,course_id,branch_id,reserved_start_time,reserved_end_time,notes,created_by,expires_at,reservation_kind,draft_data)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::time,$9::time,$10,$11,NOW()+INTERVAL '2 days','temporary_enrollment',$12::jsonb) RETURNING *`,
        [cycleId,instructorId,`${firstName} ${lastName}`,data.phone||null,identification,courseId,branchId,firstTime[1],firstTime[2],String(data.notes||'').slice(0,240)||null,user.id,JSON.stringify(safeDraft)])).rows[0];
      for(const selection of selections){const match=String(selection.time).match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);await client.query(`INSERT INTO instructor_availability_overrides
        (instructor_id,schedule_date,start_time,end_time,status,reason,active,created_by,updated_by)
        VALUES($1,$2::date,$3::time,$4::time,'reserved',$5,TRUE,$6,$6)
        ON CONFLICT(instructor_id,schedule_date,start_time,end_time) DO UPDATE SET
          status='reserved',reason=EXCLUDED.reason,active=TRUE,updated_by=EXCLUDED.updated_by,updated_at=NOW()`,[instructorId,selection.date,match[1],match[2],`RESERVA_CURSO:${reservation.id}:${cycleId}`,user.id]);}
      await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,'TEMPORARY_ENROLLMENT_RESERVED','course_cycle_seat_reservations',$4,$5::jsonb)`,[user.id,user.role,branchId,reservation.id,JSON.stringify({cycleId,instructorId,identification,expiresAt:reservation.expires_at})]);
      await client.query('COMMIT');return reservation;
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }

  static async cancelSeatReservation(reservationId, user, access = {}) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const reservation = (await client.query(`
        SELECT reservation.*,branch.city_id,
               own_branch.city_id AS user_city_id
        FROM course_cycle_seat_reservations reservation
        JOIN branches branch ON branch.id=reservation.branch_id
        LEFT JOIN branches own_branch ON own_branch.id=$2
        WHERE reservation.id=$1 AND reservation.status='activo'
        FOR UPDATE OF reservation
      `, [reservationId, user.branch_id || null])).rows[0];
      if (!reservation) throw createError(404, 'La reserva ya fue eliminada, activada o vencio');
      const inScope = access.global
        || String(reservation.branch_id) === String(user.branch_id || '')
        || String(reservation.created_by) === String(user.id)
        || (reservation.city_id && String(reservation.city_id) === String(reservation.user_city_id || ''));
      if (!inScope) throw createError(403, 'No puedes eliminar una reserva de otra sede');

      const cancelled = (await client.query(`
        UPDATE course_cycle_seat_reservations
        SET status='cancelado',cancelled_by=$2,updated_at=NOW()
        WHERE id=$1 AND status='activo'
        RETURNING *
      `, [reservationId, user.id])).rows[0];
      if (!cancelled) throw createError(409, 'La reserva cambio mientras intentabas eliminarla');
      await client.query(`
        UPDATE instructor_availability_overrides
        SET active=FALSE,updated_by=$1,updated_at=NOW()
        WHERE active=TRUE AND reason LIKE $2
      `, [user.id, `RESERVA_CURSO:${reservationId}:%`]);
      await client.query(`INSERT INTO audit_logs(
        user_id,role,branch_id,action,entity,entity_id,metadata
      ) VALUES($1,$2,$3,'TEMPORARY_ENROLLMENT_CANCELLED','course_cycle_seat_reservations',$4,$5::jsonb)`, [
        user.id, user.role, reservation.branch_id, reservationId,
        JSON.stringify({ cycleId: reservation.cycle_id, instructorId: reservation.instructor_id,
          identification: reservation.referred_identification, releasedSeat: true }),
      ]);
      await client.query('COMMIT');
      return cancelled;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtener todos los estudiantes con su branch y enrollment info
   */
  static async getAll(filters = {}) {
    // CURRENT_DATE no genera eventos en PostgreSQL. Recalcular al consultar garantiza
    // que un ciclo cambie a "en_curso" o "completado" aunque no haya otra escritura.
    await db.query('SELECT refresh_due_student_academic_statuses()');
    let sql = `
      SELECT s.*, b.name as branch_name, c.name as city_name, c.province as city_province,
        TRIM(CONCAT(creator.first_name, ' ', creator.last_name)) AS created_by_name,
        TRIM(CONCAT(referrer.first_name, ' ', referrer.last_name)) AS referred_by_name,
        referrer_branch.name AS referred_by_branch_name,
        instructor.instructor_id, instructor.instructor_name,
        instructor.assignment_start_date, instructor.assignment_end_date,
        (SELECT course.name
         FROM enrollments active_enrollment
         JOIN courses course ON course.id = active_enrollment.course_id
         WHERE active_enrollment.student_id = s.id
         ORDER BY CASE WHEN active_enrollment.status = 'activo' THEN 0 ELSE 1 END,
           active_enrollment.enrollment_date DESC
         LIMIT 1) AS course
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN cities c ON s.city_id = c.id
      LEFT JOIN users creator ON creator.id = s.created_by
      LEFT JOIN users referrer ON referrer.id = s.referred_by_user_id
      LEFT JOIN branches referrer_branch ON referrer_branch.id = referrer.branch_id
      LEFT JOIN LATERAL (
        SELECT ip.id AS instructor_id,
          TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS instructor_name,
          eia.start_date AS assignment_start_date,
          eia.end_date AS assignment_end_date
        FROM enrollments e
        JOIN enrollment_instructor_assignments eia ON eia.enrollment_id = e.id AND eia.active = true
        JOIN instructor_profiles ip ON ip.id = eia.instructor_id AND ip.deleted_at IS NULL
        JOIN users u ON u.id = ip.user_id AND u.active = true
        WHERE e.student_id = s.id
        ORDER BY CASE WHEN e.status = 'activo' THEN 0 ELSE 1 END, eia.assigned_at DESC
        LIMIT 1
      ) instructor ON true
      WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (filters.status === 'active') {
      sql += ` AND EXISTS (SELECT 1 FROM enrollments active_e WHERE active_e.student_id = s.id AND active_e.status = 'activo')`;
    } else if (filters.status === 'payment_pending') {
      sql += ` AND s.status IN ('pendiente_pago', 'pago_parcial', 'pending_payment')`;
    } else if (filters.status === 'documents_pending') {
      sql += ` AND s.status IN ('pendiente_documentacion', 'pendiente_documentos', 'pendiente_doc', 'pending_documents')`;
    } else if (filters.status === 'historical') {
      sql += ` AND NOT EXISTS (SELECT 1 FROM enrollments active_e WHERE active_e.student_id = s.id AND active_e.status = 'activo')`;
    } else if (filters.status) {
      sql += ` AND s.status = $${idx++}`;
      params.push(filters.status);
    }
    if (filters.instructor_id) {
      sql += ` AND instructor.instructor_id = $${idx++}`;
      params.push(filters.instructor_id);
    }
    if (filters.date_from) {
      sql += ` AND instructor.assignment_start_date <= COALESCE($${idx++}::date, CURRENT_DATE)`;
      params.push(filters.date_to || filters.date_from);
    }
    if (filters.date_to) {
      sql += ` AND (instructor.assignment_end_date IS NULL OR instructor.assignment_end_date >= $${idx++}::date)`;
      params.push(filters.date_from || filters.date_to);
    }
    if (filters.created_date) {
      const createdDateParam = idx++;
      sql += ` AND s.created_at >= $${createdDateParam}::date AND s.created_at < ($${createdDateParam}::date + INTERVAL '1 day')`;
      params.push(filters.created_date);
    }
    if (filters.search) {
      sql += ` AND (s.identification ILIKE $${idx} OR s.first_name ILIKE $${idx} OR s.last_name ILIKE $${idx} OR CONCAT(s.first_name, ' ', s.last_name) ILIKE $${idx})`;
      params.push(`%${filters.search}%`);
      idx += 1;
    }
    if (filters.registration_type) {
      sql += ` AND s.registration_type = $${idx++}`;
      params.push(filters.registration_type);
    }
    if (filters.course_type === 'carro') {
      sql += ` AND EXISTS (
        SELECT 1 FROM enrollments course_enrollment
        JOIN courses filtered_course ON filtered_course.id = course_enrollment.course_id
        WHERE course_enrollment.student_id = s.id
          AND (filtered_course.name ILIKE '%autom%' OR filtered_course.name ILIKE '%carro%' OR filtered_course.name ILIKE '%clase b%')
      )`;
    } else if (filters.course_type === 'moto') {
      sql += ` AND EXISTS (
        SELECT 1 FROM enrollments course_enrollment
        JOIN courses filtered_course ON filtered_course.id = course_enrollment.course_id
        WHERE course_enrollment.student_id = s.id
          AND (filtered_course.name ILIKE '%moto%' OR filtered_course.name ILIKE '%clase a%')
      )`;
    }
    if (filters.province) {
      sql += ` AND LOWER(b.province) = LOWER($${idx++})`;
      params.push(filters.province);
    }
    if (filters.city) {
      sql += ` AND LOWER(b.city) = LOWER($${idx++})`;
      params.push(filters.city);
    }
    if (filters.created_only) {
      sql += ` AND (s.created_by = $${idx} OR s.updated_by = $${idx++})`;
      params.push(filters.created_by);
      if (filters.exclude_branch_id) {
        sql += ` AND (s.branch_id IS NULL OR s.branch_id <> $${idx++})`;
        params.push(filters.exclude_branch_id);
      }
    } else if (filters.branch_id) {
      sql += ` AND s.branch_id = $${idx++}`;
      params.push(filters.branch_id);
    } else if (filters.city_id && filters.created_by) {
      sql += ` AND (b.city_id = $${idx} OR s.city_id = $${idx} OR s.created_by = $${idx + 1} OR s.updated_by = $${idx + 1})`;
      idx += 2;
      params.push(filters.city_id, filters.created_by);
    } else if (filters.city_id) {
      sql += ` AND (b.city_id = $${idx} OR s.city_id = $${idx++})`;
      params.push(filters.city_id);
    }

    sql += ' ORDER BY s.created_at DESC';
    const result = await db.query(sql, params);
    return result.rows;
  }

  /**
   * Obtener estudiante por ID
   */
  static async getById(id, scope = {}) {
    await db.query('SELECT refresh_student_operational_status($1)', [id]);
    const branchId = scope.branch_id || null;
    const cityId = scope.city_id || null;
    const createdBy = scope.created_by || null;
    const updatedBy = scope.updated_by || createdBy;
    const result = await db.query(`
      SELECT s.*, b.name as branch_name, c.name as city_name, c.province as city_province,
        TRIM(CONCAT(referrer.first_name, ' ', referrer.last_name)) AS referred_by_name,
        referrer_branch.name AS referred_by_branch_name,
        (SELECT json_build_object(
          'id', account.id,
          'username', account.username,
          'active', account.active,
          'must_change_password', account.must_change_password,
          'last_login_at', account.last_login_at,
          'password_changed_at', account.password_changed_at
        ) FROM users account WHERE account.student_id = s.id LIMIT 1) AS access_account,
        (SELECT course.name
         FROM enrollments active_enrollment
         JOIN courses course ON course.id = active_enrollment.course_id
         WHERE active_enrollment.student_id = s.id
         ORDER BY CASE WHEN active_enrollment.status = 'activo' THEN 0 ELSE 1 END,
           active_enrollment.enrollment_date DESC
         LIMIT 1) AS course,
        (SELECT json_agg(json_build_object(
          'id', e.id, 'status', e.status, 'enrollment_date', e.enrollment_date,
          'course_id', e.course_id,
          'practical_start_date', e.practical_start_date,
          'practical_end_date', e.practical_end_date
        )) FROM enrollments e WHERE e.student_id = s.id) as enrollments,
        (SELECT json_agg(json_build_object(
          'id', ap.id,
          'instructor_name', TRIM(CONCAT(iu.first_name, ' ', iu.last_name)),
          'branch_name', pb.name,
          'start_date', ap.start_date,
          'end_date', ap.start_date + (ap.number_of_days - 1),
          'daily_start_time', ap.daily_start_time,
          'number_of_days', ap.number_of_days,
          'completed_days', ap.completed_days,
          'total_amount', ap.total_amount,
          'customer_type', ap.customer_type,
          'status', CASE
            WHEN ap.status = 'CANCELLED' THEN 'CANCELLED'
            WHEN ap.completed_days >= ap.number_of_days OR CURRENT_DATE > ap.start_date + (ap.number_of_days - 1) THEN 'COMPLETED'
            WHEN CURRENT_DATE >= ap.start_date THEN 'IN_PROGRESS'
            ELSE 'SCHEDULED'
          END
        ) ORDER BY ap.start_date DESC, ap.created_at DESC)
         FROM additional_driving_practices ap
         JOIN instructor_profiles aip ON aip.id = ap.instructor_id
         JOIN users iu ON iu.id = aip.user_id
         JOIN branches pb ON pb.id = ap.branch_id
         WHERE ap.student_id = s.id) AS additional_practices
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      LEFT JOIN cities c ON s.city_id = c.id
      LEFT JOIN users referrer ON referrer.id = s.referred_by_user_id
      LEFT JOIN branches referrer_branch ON referrer_branch.id = referrer.branch_id
      LEFT JOIN LATERAL (
        SELECT ip.id AS instructor_id,
          TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS instructor_name,
          eia.start_date AS assignment_start_date,
          eia.end_date AS assignment_end_date
        FROM enrollments e
        JOIN enrollment_instructor_assignments eia ON eia.enrollment_id = e.id AND eia.active = true
        JOIN instructor_profiles ip ON ip.id = eia.instructor_id AND ip.deleted_at IS NULL
        JOIN users u ON u.id = ip.user_id AND u.active = true
        WHERE e.student_id = s.id
        ORDER BY CASE WHEN e.status = 'activo' THEN 0 ELSE 1 END, eia.assigned_at DESC
        LIMIT 1
      ) instructor ON true
      WHERE s.id = $1
        AND (
          ($2::uuid IS NULL AND $3::uuid IS NULL AND $4::uuid IS NULL)
          OR s.branch_id = $2
          OR b.city_id = $3
          OR s.city_id = $3
          OR s.created_by = $4
          OR s.updated_by = $5
        )
    `, [id, branchId, cityId, createdBy, updatedBy]);

    if (result.rows.length === 0) throw createError(404, 'Estudiante no encontrado');
    return result.rows[0];
  }

  /**
   * Buscar estudiantes por identificación o nombre
   */
  static async search(query, scope = {}) {
    const branchId = scope.branch_id || null;
    const cityId = scope.city_id || null;
    const createdBy = scope.created_by || null;
    const updatedBy = scope.updated_by || createdBy;
    const searchTerm = `%${query}%`;
    const result = await db.query(`
      SELECT s.*, b.name as branch_name
      FROM students s
      LEFT JOIN branches b ON s.branch_id = b.id
      WHERE (s.identification ILIKE $1
         OR s.first_name ILIKE $1
         OR s.last_name ILIKE $1
         OR s.first_name || ' ' || s.last_name ILIKE $1)
        AND (
          ($2::uuid IS NULL AND $3::uuid IS NULL AND $4::uuid IS NULL)
          OR s.branch_id = $2
          OR b.city_id = $3
          OR s.city_id = $3
          OR s.created_by = $4
          OR s.updated_by = $5
        )
      ORDER BY s.created_at DESC
      LIMIT 20
    `, [searchTerm, branchId, cityId, createdBy, updatedBy]);
    return result.rows;
  }

  /**
   * Crear nuevo estudiante
   */
  static async create(data, userId, { allowDiscount = false } = {}) {
    await db.query('SELECT expire_course_cycle_seat_reservations()');
    let seatReservation = null;
    const referralAttribution = await ReferralCampaignService.findPendingAttribution(data.identification);
    if (data.reservationId) {
      const reserved = await db.query(`SELECT id,cycle_id,course_id,branch_id,instructor_id,enrollment_id,student_id
        FROM course_cycle_seat_reservations WHERE id=$1 AND status='activo'
          AND (expires_at IS NULL OR expires_at>NOW())`, [data.reservationId]);
      if (!reserved.rows.length) throw createError(409, 'Este cupo reservado ya fue activado o cancelado');
      seatReservation = reserved.rows[0];
      data.course_id = seatReservation.course_id;
      data.branch_id = seatReservation.branch_id;
      // Un intento anterior puede haber creado la ficha y fallado después al
      // confirmar el horario. Reanudar esa activación evita duplicar al alumno
      // y conserva el mismo cupo, matrícula e instructor reservado.
      if (seatReservation.student_id && seatReservation.enrollment_id) {
        const linkedStudent = await db.query(`SELECT * FROM students
          WHERE id=$1 AND identification=$2`,[seatReservation.student_id,data.identification]);
        if (!linkedStudent.rows.length) {
          throw createError(409,'La reserva ya está vinculada a otra identificación');
        }
        if (referralAttribution) {
          await ReferralCampaignService.convertByIdentification({
            identification: data.identification,
            studentId: seatReservation.student_id,
            enrollmentId: seatReservation.enrollment_id,
            convertedBy: userId,
          });
        }
        const access = await StudentAccountService.createForStudent(seatReservation.student_id);
        return { ...linkedStudent.rows[0], access, resumedReservation: true };
      }
    }
    // Verificar identificación única
    const existing = await db.query(
      'SELECT id FROM students WHERE identification = $1',
      [data.identification]
    );
    if (existing.rows.length > 0) {
      throw createError(409, 'Ya existe un estudiante con esta identificación');
    }

    let branchId = data.branch_id || null;
    let cityId = data.city_id || null;
    if (!branchId && data.branch) {
      const branch = await db.query(
        'SELECT id FROM branches WHERE name = $1 AND active = true LIMIT 1',
        [data.branch]
      );
      if (branch.rows.length === 0) throw createError(422, 'Sucursal no vÃ¡lida');
      branchId = branch.rows[0].id;
    }
    if (branchId) {
      const branchLocation = await db.query('SELECT city_id FROM branches WHERE id = $1 AND active = true', [branchId]);
      if (branchLocation.rows.length === 0) throw createError(422, 'Sucursal no válida');
      if (cityId && cityId !== branchLocation.rows[0].city_id) throw createError(422, 'La sucursal no pertenece a la ciudad seleccionada');
      cityId = branchLocation.rows[0].city_id;
    }

    // La atribución capturada en la landing prevalece sobre una selección manual.
    // Así el código oculto no puede alterarse durante la matrícula.
    let referredByUserId = referralAttribution?.referrer_user_id || data.referredByUserId || null;
    if (referredByUserId) {
      const referrer = await db.query(`
        SELECT u.id
        FROM users u
        WHERE u.id = $1 AND u.active = TRUE AND u.student_id IS NULL AND u.branch_id IS NOT NULL
      `, [referredByUserId]);
      if (!referrer.rows.length) throw createError(422, 'La persona que refirió al estudiante no es válida');
      referredByUserId = referrer.rows[0].id;
    }

    let courseId = data.course_id || null;
    if (!courseId && data.course) {
      const courseName = data.course === 'clase-a' ? '%Clase A%' :
        data.course === 'clase-b' ? '%Clase B%' : `%${data.course}%`;
      const course = await db.query(
        'SELECT id FROM courses WHERE name ILIKE $1 AND active = true LIMIT 1',
        [courseName]
      );
      if (course.rows.length === 0) throw createError(422, 'Curso no vÃ¡lido');
      courseId = course.rows[0].id;
    }

    const discount = Number(data.discount || 0);
    if (!Number.isFinite(discount) || discount < 0) throw createError(422, 'El descuento no es válido');
    if (discount > 0 && !allowDiscount) throw createError(403, 'No tienes permiso para aplicar descuentos');
    if (courseId && discount > 0) {
      const coursePrice = await db.query('SELECT name,price FROM courses WHERE id=$1 AND active=TRUE', [courseId]);
      const selectedCourse = coursePrice.rows[0];
      const isCarCourse = /auto|automóvil|clase b/i.test(String(selectedCourse?.name || ''));
      const minimumFinalAmount = isCarCourse ? 175 : 0;
      if (!selectedCourse || discount > Number(selectedCourse.price) - minimumFinalAmount) {
        if (isCarCourse) throw createError(422, 'El curso de automóvil no puede quedar por debajo de $175.00');
        throw createError(422, 'El descuento no puede superar el valor del curso');
      }
    }

    const notes = String(data.notes || '').trim().slice(0, 500);
    const result = await db.query(`
      INSERT INTO students (identification, first_name, last_name, birth_date, email, phone,
        address, blood_type, branch_id, city_id, status, created_by, registration_type, referred_by_user_id, notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *
    `, [
      data.identification,
      data.firstName,
      data.lastName,
      data.birthDate || null,
      data.email || '',
      data.phone || null,
      data.address || null,
      data.bloodType || 'N/D',
      branchId,
      cityId,
      data.status || 'pendiente_pago',
      userId,
      data.registrationType === 'ADDITIONAL_PRACTICE' ? 'ADDITIONAL_PRACTICE' : 'REGULAR',
      referredByUserId,
      notes || null,
    ]);

    const student = result.rows[0];

    // Registrar en historial
    await db.query(
      'INSERT INTO history (student_id, action) VALUES ($1, $2)',
      [student.id, referredByUserId ? 'Estudiante registrado con referido de personal' : 'Estudiante registrado']
    );

    // Si tiene course, crear enrollment
    let createdEnrollmentId = null;
    if (courseId) {
      const enrollmentResult = await db.query(`
        INSERT INTO enrollments (student_id, branch_id, course_id, status, created_by)
        VALUES ($1, $2, $3, 'activo', $4)
        RETURNING id
      `, [student.id, branchId, courseId, userId]);

      const enrollmentId = enrollmentResult.rows[0].id;
      createdEnrollmentId = enrollmentId;
      if (seatReservation) {
        const linked = await db.query(`UPDATE course_cycle_seat_reservations
          SET enrollment_id=$1,student_id=$2,updated_at=NOW()
          WHERE id=$3 AND status='activo' AND enrollment_id IS NULL RETURNING id`,
        [enrollmentId, student.id, seatReservation.id]);
        if (!linked.rows.length) throw createError(409, 'El cupo reservado ya no está disponible');
      }
      await db.query(`
        INSERT INTO payments (enrollment_id, total, discount, final_amount, balance, status)
        SELECT $1, c.price, $3, c.price - $3, c.price - $3,
          CASE WHEN c.price - $3 <= 0 THEN 'pagado' ELSE 'pendiente' END
        FROM courses c
        WHERE c.id = $2
      `, [enrollmentId, courseId, discount]);
      if (discount > 0) {
        await db.query('INSERT INTO history (student_id, action) VALUES ($1, $2)', [
          student.id,
          `Descuento de $${discount.toFixed(2)} aplicado al registrar la matrícula`,
        ]);
      }
    }

    if (referralAttribution && createdEnrollmentId) {
      await ReferralCampaignService.convertByIdentification({
        identification: data.identification,
        studentId: student.id,
        enrollmentId: createdEnrollmentId,
        convertedBy: userId,
      });
    }

    const access = data.registrationType === 'ADDITIONAL_PRACTICE'
      ? null
      : await StudentAccountService.createForStudent(student.id);
    return { ...student, enrollment_id: createdEnrollmentId, access };
  }

  /**
   * Actualizar estudiante
   */
  static async update(id, data, userId = null) {
    const fields = [];
    const values = [];
    let idx = 1;

    const fieldMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      birthDate: 'birth_date',
      email: 'email',
      phone: 'phone',
      address: 'address',
      bloodType: 'blood_type',
      branch_id: 'branch_id',
      notes: 'notes',
    };

    for (const [key, col] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(data[key]);
      }
    }

    if (fields.length === 0) throw createError(400, 'No hay campos para actualizar');
    fields.push(`updated_by = $${idx++}`);
    values.push(userId);
    fields.push('updated_at = NOW()');
    values.push(id);

    const result = await db.query(
      `UPDATE students SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    if (result.rows.length === 0) throw createError(404, 'Estudiante no encontrado');

    await db.query(
      'INSERT INTO history (student_id, action) VALUES ($1, $2)',
      [id, 'Estudiante actualizado']
    );

    return result.rows[0];
  }

  /**
   * Actualizar estado del estudiante
   */
  static async updateStatus(id, status, userId = null) {
    const result = await db.query(
      'UPDATE students SET status = $1, updated_by = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      [status, userId, id]
    );
    if (result.rows.length === 0) throw createError(404, 'Estudiante no encontrado');

    await db.query(
      'INSERT INTO history (student_id, action) VALUES ($1, $2)',
      [id, `Estado actualizado a: ${status}`]
    );

    return result.rows[0];
  }

  /**
   * Obtener historial del estudiante
   */
  static async getHistory(studentId) {
    const result = await db.query(
      'SELECT * FROM history WHERE student_id = $1 ORDER BY timestamp DESC',
      [studentId]
    );
    return result.rows;
  }

  /**
   * Obtener branches
   */
  static async getBranches() {
    const result = await db.query(`
      SELECT b.id, b.name, b.province, b.city, COALESCE(b.city_id, c.id) city_id, b.phone
      FROM branches b
      LEFT JOIN cities c ON LOWER(c.name) = LOWER(b.city) AND LOWER(c.province) = LOWER(b.province)
      WHERE b.active = true
      ORDER BY b.city, b.name
    `);
    return result.rows;
  }

  static async getInstructors(branchId) {
    const result = await db.query(`
      SELECT ip.id, TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS name,
        CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$1 ELSE u.branch_id=$1 END AS priority_branch,
        CASE WHEN priority_rule.branch_id=$1 THEN 'priority' WHEN priority_rule.branch_id IS NOT NULL THEN 'reserved_elsewhere' ELSE 'standard' END AS branch_assignment,
        CASE WHEN priority_rule.branch_id IS NOT NULL AND priority_rule.branch_id<>$1
          THEN jsonb_array_length(COALESCE(priority_rule.allowed_slots,'[]'::jsonb))=0
          ELSE FALSE END AS shared_with_target,
        ib.name AS home_branch,
        COALESCE(json_agg(DISTINCT jsonb_build_object('id', capable_course.id, 'name', capable_course.name))
          FILTER (WHERE capable_course.id IS NOT NULL), '[]') AS courses,
        COUNT(DISTINCT CASE WHEN e.status = 'activo' AND eia.active = true THEN assigned_student.id END)::int AS active_students
      FROM instructor_profiles ip
      JOIN users u ON u.id = ip.user_id
      JOIN branches ib ON ib.id = u.branch_id
      JOIN branches target ON target.id = $1
      LEFT JOIN LATERAL (SELECT rule.branch_id,rule.allowed_slots FROM instructor_branch_priorities rule
        WHERE rule.instructor_id=ip.id AND rule.assignment_type='priority' AND rule.active=TRUE
          AND rule.effective_from<=CURRENT_DATE AND (rule.effective_until IS NULL OR rule.effective_until>=CURRENT_DATE)
        ORDER BY (rule.branch_id=$1) DESC,rule.updated_at DESC LIMIT 1) priority_rule ON TRUE
      LEFT JOIN enrollment_instructor_assignments eia ON eia.instructor_id = ip.id AND eia.active = true
      LEFT JOIN instructor_course_capabilities capability ON capability.instructor_id=ip.id AND capability.active=TRUE
      LEFT JOIN courses capable_course ON capable_course.id=capability.course_id AND capable_course.active=TRUE
      LEFT JOIN enrollments e ON e.id = eia.enrollment_id AND e.branch_id = $1
      LEFT JOIN students assigned_student ON assigned_student.id = e.student_id AND assigned_student.branch_id = $1
      WHERE ib.city_id = target.city_id AND u.active = true AND ip.deleted_at IS NULL AND ip.status = 'activo'
      GROUP BY ip.id, u.first_name, u.last_name, u.branch_id, ib.name, priority_rule.branch_id, priority_rule.allowed_slots
      ORDER BY (CASE WHEN priority_rule.branch_id IS NOT NULL THEN priority_rule.branch_id=$1 ELSE u.branch_id=$1 END) DESC,
        u.last_name, u.first_name
    `, [branchId]);
    return result.rows;
  }

  static async searchReferralStaff(query) {
    const result = await db.query(`
      SELECT u.id,
        TRIM(CONCAT(u.first_name, ' ', u.last_name)) AS name,
        b.name AS branch_name,
        COALESCE(
          STRING_AGG(DISTINCT r.name, ', ' ORDER BY r.name),
          INITCAP(COALESCE(u.role, 'Personal'))
        ) AS role_name
      FROM users u
      JOIN branches b ON b.id = u.branch_id AND b.active = TRUE
      LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.active = TRUE
        AND (ur.valid_from IS NULL OR ur.valid_from <= NOW())
        AND (ur.valid_until IS NULL OR ur.valid_until > NOW())
      LEFT JOIN roles r ON r.id = ur.role_id AND r.active = TRUE
      WHERE u.active = TRUE AND u.student_id IS NULL
        AND TRIM(CONCAT(u.first_name, ' ', u.last_name)) ILIKE $1
      GROUP BY u.id, u.first_name, u.last_name, u.role, b.name
      ORDER BY
        CASE WHEN TRIM(CONCAT(u.first_name, ' ', u.last_name)) ILIKE $2 THEN 0 ELSE 1 END,
        u.first_name, u.last_name
      LIMIT 10
    `, [`%${query}%`, `${query}%`]);
    return result.rows;
  }

  static async getCities() {
    const result = await db.query(`
      SELECT DISTINCT c.id, c.name, c.province
      FROM branches b
      JOIN cities c ON c.id = b.city_id OR (LOWER(c.name) = LOWER(b.city) AND LOWER(c.province) = LOWER(b.province))
      WHERE b.active = true
      ORDER BY c.province, c.name
    `);
    return result.rows;
  }

  static async getActiveBranchCourses(branchId) {
    const result = await db.query(`SELECT c.id,c.name,c.description,c.price
      FROM branch_courses bc JOIN courses c ON c.id=bc.course_id
      WHERE bc.branch_id=$1 AND bc.active=TRUE AND c.active=TRUE ORDER BY c.name`, [branchId]);
    return result.rows;
  }
}

module.exports = StudentService;
