const db=require('../config/database');
const {createError}=require('../middleware/errorHandler');
const Cycles=require('./CourseCycleService');
const Audit=require('./AuditService');
const Cash=require('./CashOperationsService');

class AdditionalEnrollmentService {
  static async validateCrossCourseTheory(client,studentId,enrollmentId) {
    const conflicts=(await client.query(`WITH blocks AS (
      SELECT a.enrollment_id,a.schedule_date+a.start_time starts,a.schedule_date+a.end_time ends
        FROM course_cycle_schedule_assignments a WHERE a.student_id=$1 AND a.status='activo'
      UNION ALL SELECT ps.enrollment_id,ps.scheduled_start,ps.scheduled_end FROM practical_sessions ps
        JOIN enrollments e ON e.id=ps.enrollment_id WHERE e.student_id=$1 AND ps.deleted_at IS NULL
          AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
      UNION ALL SELECT gs.enrollment_id,
        (g.start_date+(CASE WHEN g.modality='presencial_regular' THEN day.number ELSE day.number*7 END))+g.start_time,
        (g.start_date+(CASE WHEN g.modality='presencial_regular' THEN day.number ELSE day.number*7 END))+g.end_time
        FROM theory_group_students gs JOIN theory_course_groups g ON g.id=gs.group_id
        CROSS JOIN LATERAL generate_series(0,CASE WHEN g.modality='presencial_regular' THEN 4 ELSE 1 END) day(number)
        WHERE gs.student_id=$1 AND gs.active AND g.status<>'cancelado'
    ) SELECT 1 FROM blocks fresh JOIN blocks old ON old.enrollment_id<>fresh.enrollment_id
      AND old.starts<fresh.ends AND old.ends>fresh.starts WHERE fresh.enrollment_id=$2 LIMIT 1`,[studentId,enrollmentId])).rows;
    if(conflicts.length)throw createError(409,'El horario se cruza con clases o teoria de otra matricula del estudiante');
  }

  static price(course,data,allowDiscount) {
    const benefit=String(data.discountBenefit || '').trim();
    const kind=/moto|clase\s*a/i.test(course.name) ? 'moto' : /auto|clase\s*b/i.test(course.name) ? 'carro' : null;
    const benefits={UNIVERSITY_STUDENT:{moto:117,carro:180},POLICE:{moto:110,carro:170}};
    if(benefit && (!kind || !benefits[benefit]))throw createError(422,'Convenio no disponible para este curso');
    const discount=benefit ? Number(course.price)-benefits[benefit][kind] : Number(data.discount || 0);
    if(!Number.isFinite(discount) || discount<0 || Math.abs(discount*100-Math.round(discount*100))>0.000001
      || discount>Number(course.price)-(kind==='carro' && !benefit ? 175 : 0))throw createError(422,'Descuento no valido para este curso');
    if(discount>0 && !allowDiscount && !benefit)throw createError(403,'No tienes permiso para aplicar descuentos');
    return {discount,total:Number(course.price)};
  }

  static async create(studentId,data,actor,access={}) {
    if(!actor?.permissions?.includes('STUDENT_CREATE')
      || !['SCHEDULE_ASSIGN','SCHEDULE_CHANGE'].some(code=>actor.permissions.includes(code)))throw createError(403,'No tienes permiso para matricular y asignar horarios');
    if(!data.course_id || !data.schedulePlan?.selections?.length)throw createError(422,'Selecciona el nuevo curso y su horario');
    if(data.reservationId)throw createError(422,'Para una segunda matricula utiliza el registro directo del curso');
    const client=await db.getClient();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`student-suspension:${studentId}`]);
      const student=(await client.query('SELECT * FROM students WHERE id=$1 FOR UPDATE',[studentId])).rows[0];
      if(!student || student.identification!==data.identification)throw createError(404,'Estudiante no encontrado');
      if(student.status==='inhabilitado')throw createError(409,'Habilita al estudiante antes de agregar otro curso');
      const actorBranch=access.operationalCoverage?.operational_branch_id || access.branchId || actor.branch_id;
      const targetBranch=data.branch_id || actorBranch;
      if(actor.role==='instructor' && !access.global && (student.branch_id!==actorBranch || targetBranch!==actorBranch))throw createError(403,'Solo puedes matricular estudiantes de tu sucursal');
      const scope=(await client.query(`SELECT 1 FROM students s LEFT JOIN branches b ON b.id=s.branch_id
        LEFT JOIN branches own ON own.id=$2 WHERE s.id=$1 AND ($4::boolean OR s.branch_id=$2
          OR b.city_id=own.city_id OR s.city_id=own.city_id OR s.created_by=$3 OR s.updated_by=$3)`,[studentId,actorBranch,actor.id,!!access.global])).rows;
      if(!scope.length)throw createError(403,'No tienes acceso a este expediente');
      if((await client.query("SELECT 1 FROM enrollments WHERE student_id=$1 AND course_id=$2 AND status IN ('activo','inhabilitado')",[studentId,data.course_id])).rows.length)
        throw createError(409,'Este estudiante ya tiene una matricula vigente en el mismo curso');
      await client.query(`UPDATE transfer_payment_verifications tv SET enrollment_id=single.id
        FROM (SELECT (array_agg(id))[1] id FROM enrollments WHERE student_id=$1 AND status='activo' HAVING COUNT(*)=1) single
        WHERE tv.student_id=$1 AND tv.service_transaction_id IS NULL AND tv.enrollment_id IS NULL AND single.id IS NOT NULL`,[studentId]);
      if((await client.query(`SELECT 1 FROM transfer_payment_verifications WHERE student_id=$1 AND service_transaction_id IS NULL
        AND enrollment_id IS NULL AND status IN ('PENDING','AWAITING_APPROVAL')`,[studentId])).rows.length)
        throw createError(409,'Asigna las transferencias pendientes a su matricula antes de agregar otro curso');
      const course=(await client.query(`SELECT c.id,c.name,c.price,b.city_id FROM branch_courses bc
        JOIN courses c ON c.id=bc.course_id JOIN branches b ON b.id=bc.branch_id
        WHERE bc.branch_id=$1 AND bc.course_id=$2 AND bc.active AND c.active AND b.active`,[targetBranch,data.course_id])).rows[0];
      if(!course)throw createError(422,'Curso no habilitado en la sucursal seleccionada');
      const cycle=(await client.query('SELECT id,branch_id,course_id,modality FROM course_cycles WHERE id=$1 AND active AND deleted_at IS NULL',[data.schedulePlan.selections[0].cycleId])).rows[0];
      if(!cycle || cycle.course_id!==data.course_id || cycle.branch_id!==await Cycles.enrollmentBranchForCycle(targetBranch,cycle.modality,client))
        throw createError(422,'El horario no corresponde al curso y sucursal seleccionados');
      const {discount}=this.price(course,data,actor.permissions.includes('PAYMENT_CREATE'));
      const enrollment=(await client.query(`INSERT INTO enrollments(student_id,branch_id,course_id,status,created_by)
        VALUES($1,$2,$3,'activo',$4) RETURNING id`,[studentId,targetBranch,data.course_id,actor.id])).rows[0];
      await client.query(`INSERT INTO payments(enrollment_id,total,discount,final_amount,balance,status)
        VALUES($1,$2,$3,$2::numeric-$3::numeric,$2::numeric-$3::numeric,
          CASE WHEN $2::numeric-$3::numeric<=0 THEN 'pagado' ELSE 'pendiente' END)`,[enrollment.id,course.price,discount]);
      const reservation=await Cycles.reserveSchedule({...actor,branch_id:actorBranch},{studentId,enrollmentId:enrollment.id,schedulePlan:data.schedulePlan},client);
      await this.validateCrossCourseTheory(client,studentId,enrollment.id);
      if(data.registrationTransfer)await Cash.createTransfer({studentId,enrollmentId:enrollment.id,amount:data.registrationTransfer.amount,
        reference:data.registrationTransfer.reference,transferDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Guayaquil'}).format(new Date())},actor,access,data.requestContext,client);
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[studentId,`Matricula adicional: ${course.name}. Se conservan los otros cursos y la cuenta de acceso.`]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:targetBranch,action:'STUDENT_ADDITIONAL_ENROLLMENT_CREATED',module:'ESTUDIANTES',
        entityType:'ENROLLMENT',entityId:enrollment.id,description:'Matricula adicional confirmada sobre expediente existente',
        metadata:{studentId,courseId:data.course_id,existingIdentityPreserved:true},requestContext:data.requestContext},client);
      await client.query('SELECT refresh_student_operational_status($1)',[studentId]);
      await client.query('COMMIT');
      return {...student,enrollment_id:enrollment.id,existingStudent:true,scheduleReserved:true,assignedInstructor:reservation.instructor};
    } catch(error) {await client.query('ROLLBACK');throw error;}
    finally {client.release();}
  }
}
module.exports=AdditionalEnrollmentService;
