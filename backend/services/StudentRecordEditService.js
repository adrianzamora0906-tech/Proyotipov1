const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');
const Cycles = require('./CourseCycleService');
const Sessions = require('./CycleInstructorAssignmentService');
const Cash = require('./CashOperationsService');
const AccountSessions = require('./SessionService');
const Payments = require('./PaymentService');
const Audit = require('./AuditService');

const fields = {
  identification: ['identification', 'Cedula'], firstName: ['first_name', 'Nombres'],
  lastName: ['last_name', 'Apellidos'], birthDate: ['birth_date', 'Fecha de nacimiento'],
  email: ['email', 'Correo'], phone: ['phone', 'Telefono'], address: ['address', 'Direccion'],
  bloodType: ['blood_type', 'Tipo de sangre'], city_id: ['city_id', 'Canton'],
  branch_id: ['branch_id', 'Sucursal'], pickupBranchId: ['pickup_branch_id', 'Lugar de recogida'],
  notes: ['notes', 'Observaciones'], disabilityPercentage: ['disability_percentage', 'Discapacidad (%)'],
  referredByUserId: ['referred_by_user_id', 'Referido por'],
  discountBenefit: ['discount_benefit', 'Convenio'],
};
const iso = value => value ? new Date(value).toISOString().slice(0, 10) : null;
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const confirmationSecret = crypto.randomBytes(32);
const confirmation = value => crypto.createHmac('sha256', confirmationSecret).update(JSON.stringify(value)).digest('hex');
const same = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();
const has = (actor, permission) => (actor.permissions || []).includes(permission);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value));
const time = value => String(value || '').slice(0, 5);

class StudentRecordEditService {
  static async snapshot(id, client = db, lock = false) {
    const student = (await client.query(`SELECT * FROM students WHERE id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0];
    if (!student) throw createError(404, 'Estudiante no encontrado');
    const enrollments = (await client.query(`SELECT e.*,c.name course_name,c.price course_price FROM enrollments e
      JOIN courses c ON c.id=e.course_id WHERE e.student_id=$1 AND e.status='activo' ORDER BY e.id
      ${lock ? 'FOR UPDATE OF e' : ''}`, [id])).rows;
    const assignments = (await client.query(`SELECT a.*,cc.code,cc.modality FROM course_cycle_schedule_assignments a
      JOIN course_cycles cc ON cc.id=a.cycle_id WHERE a.student_id=$1 AND a.status='activo'
      ORDER BY a.schedule_date,a.start_time,a.id ${lock ? 'FOR UPDATE OF a' : ''}`, [id])).rows;
    const appointments = (await client.query(`SELECT ps.* FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id
      WHERE e.student_id=$1 AND ps.deleted_at IS NULL AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
      ORDER BY ps.scheduled_start,ps.id ${lock ? 'FOR UPDATE OF ps' : ''}`, [id])).rows;
    const payments = (await client.query(`SELECT p.* FROM payments p JOIN enrollments e ON e.id=p.enrollment_id
      WHERE e.student_id=$1 AND e.status='activo' AND p.status<>'anulado' ORDER BY p.id ${lock ? 'FOR UPDATE OF p' : ''}`, [id])).rows;
    const documents = (await client.query(`SELECT d.id,t.code type,t.name,d.file_path,d.observations,d.uploaded_at
      FROM student_documents d JOIN document_types t ON t.id=d.document_type_id
      WHERE d.student_id=$1 ORDER BY t.code ${lock ? 'FOR UPDATE OF d' : ''}`, [id])).rows;
    const account = (await client.query(`SELECT id,username,email,first_name,last_name,branch_id,must_change_password
      FROM users WHERE student_id=$1 ${lock ? 'FOR UPDATE' : ''}`, [id])).rows[0] || null;
    const transfers = (await client.query(`SELECT id,amount,status FROM transfer_payment_verifications
      WHERE student_id=$1 AND service_transaction_id IS NULL AND status IN ('PENDING','AWAITING_APPROVAL') ORDER BY id`,[id])).rows;
    const value = { student, enrollments, assignments, appointments, payments, documents, account, transfers };
    value.revision = hash(value);
    return value;
  }

  static async assertScope(snapshot, actor, access, client = db) {
    if (access.global) return;
    const branchId = access.branchId || actor.branch_id;
    const allowed = (await client.query(`SELECT 1 FROM students s LEFT JOIN branches b ON b.id=s.branch_id
      LEFT JOIN branches own ON own.id=$2 WHERE s.id=$1 AND
        (s.branch_id=$2 OR b.city_id=own.city_id OR s.city_id=own.city_id OR s.created_by=$3 OR s.updated_by=$3)`,
    [snapshot.student.id, branchId, actor.id])).rows.length;
    if (!allowed) throw createError(403, 'No tienes acceso a este expediente');
  }

  static async context(id, actor, access = {}) {
    const snapshot = await this.snapshot(id);
    await this.assertScope(snapshot, actor, access);
    const [branches, cities, courses, instructors, documentTypes] = await Promise.all([
      db.query(`SELECT b.id,b.name,b.city_id FROM branches b WHERE b.active=TRUE AND
        ($1::boolean OR b.city_id=(SELECT city_id FROM branches WHERE id=$2) OR b.id=$3) ORDER BY b.name`,
      [!!access.global,access.branchId || actor.branch_id,snapshot.student.branch_id]),
      db.query('SELECT id,name,province FROM cities ORDER BY province,name'),
      db.query(`SELECT c.id,c.name,c.price,bc.branch_id FROM courses c JOIN branch_courses bc ON bc.course_id=c.id
        WHERE bc.active=TRUE ORDER BY c.name`),
      db.query(`SELECT ip.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name,u.branch_id
        FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
        WHERE ip.status='activo' AND ip.deleted_at IS NULL AND u.active=TRUE ORDER BY u.first_name,u.last_name`),
      db.query("SELECT code,name FROM document_types WHERE active=TRUE AND code<>'foto' ORDER BY name"),
    ]);
    const referrers=(await db.query(`SELECT id,TRIM(CONCAT(first_name,' ',last_name)) name FROM users
      WHERE active=TRUE AND student_id IS NULL AND branch_id IS NOT NULL ORDER BY first_name,last_name`)).rows;
    return { student:snapshot.student,enrollments:snapshot.enrollments,revision:snapshot.revision,
      assignments:snapshot.assignments.map(a=>({cycleId:a.cycle_id,date:iso(a.schedule_date),time:`${time(a.start_time)} - ${time(a.end_time)}`,instructorId:a.instructor_id,code:a.code,modality:a.modality})),
      exam:snapshot.appointments.find(p=>p.appointment_type==='EXAM_ONLY') || null,
      payment:snapshot.payments[0] || null,
      documents:snapshot.documents.map(({file_path,...d})=>({...d,hasFile:!!file_path})),
      branches:branches.rows,cities:cities.rows,courses:courses.rows,instructors:instructors.rows,referrers,documentTypes:documentTypes.rows,
      canSchedule:has(actor,'SCHEDULE_CHANGE') || has(actor,'SCHEDULE_ASSIGN'),
      canFinance:has(actor,'PAYMENT_CREATE'),canDocuments:has(actor,'DOCUMENT_UPDATE') || has(actor,'DOCUMENT_CREATE') };
  }

  static async options(id, actor, access, filters = {}) {
    const snapshot = await this.snapshot(id);
    await this.assertScope(snapshot,actor,access);
    const branch = (await db.query(`SELECT COALESCE(reference.id,current.id) id,current.city_id
      FROM branches current LEFT JOIN branches reference ON current.code='SP_IC2' AND reference.code='SP_IC1'
        AND reference.city_id=current.city_id AND reference.active=TRUE WHERE current.id=$1 AND current.active=TRUE`,
    [filters.branch_id || snapshot.student.branch_id])).rows[0];
    if (!branch) throw createError(422,'Sucursal no disponible');
    await this.validateTargetBranch(branch.id,snapshot,actor,access);
    const cycles = (await db.query(`SELECT cc.*,c.name course_name,
      (SELECT json_agg(t) FROM branch_course_programs p JOIN branch_course_schedule_templates t ON t.program_id=p.id
        WHERE p.branch_id=cc.branch_id AND p.course_id=cc.course_id AND t.modality=cc.modality AND t.active=TRUE) schedule_templates
      FROM course_cycles cc JOIN courses c ON c.id=cc.course_id WHERE cc.branch_id=$1 AND cc.active=TRUE AND cc.deleted_at IS NULL
        AND cc.status IN ('activo','proximo') AND CURRENT_DATE<=cc.start_date+2
        AND ($2::uuid IS NULL OR cc.course_id=$2) AND ($3::text IS NULL OR cc.modality=$3)
      ORDER BY cc.start_date,cc.code LIMIT 40`, [branch.id,filters.course_id || null,filters.modality || null])).rows;
    const result = [];
    for (const cycle of cycles) {
      const instructors = (await db.query(`SELECT DISTINCT ip.id,TRIM(CONCAT(u.first_name,' ',u.last_name)) name
        FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id
        JOIN instructor_course_capabilities cap ON cap.instructor_id=ip.id AND cap.course_id=$2 AND cap.active=TRUE
        WHERE ip.status='activo' AND ip.deleted_at IS NULL AND u.active=TRUE AND
          (EXISTS(SELECT 1 FROM course_cycle_instructors ci WHERE ci.cycle_id=$1 AND ci.instructor_id=ip.id AND ci.active=TRUE)
          OR EXISTS(SELECT 1 FROM instructor_group_members gm WHERE gm.group_id=$3 AND gm.instructor_id=ip.id AND gm.active=TRUE AND gm.ended_at IS NULL))
        ORDER BY name`, [cycle.id,cycle.course_id,cycle.group_id])).rows;
      const layout = Cycles.calendarLayout(cycle);
      const slots = [];
      for (const instructor of instructors) {
        const busy = (await db.query(`SELECT date,start_time,end_time FROM (
          SELECT a.schedule_date date,a.start_time,a.end_time FROM course_cycle_schedule_assignments a
            WHERE a.instructor_id=$1 AND a.status='activo' AND a.student_id<>$2
          UNION ALL SELECT b.schedule_date,b.start_time,b.end_time FROM referred_instructor_schedule_blocks b
            WHERE b.instructor_id=$1 AND b.status='activo' AND b.student_id<>$2
          UNION ALL SELECT o.schedule_date,o.start_time,o.end_time FROM instructor_availability_overrides o
            WHERE o.instructor_id=$1 AND o.active=TRUE
          UNION ALL SELECT ps.scheduled_start::date,ps.scheduled_start::time,ps.scheduled_end::time
            FROM practical_sessions ps JOIN enrollments e ON e.id=ps.enrollment_id
            WHERE ps.instructor_id=$1 AND e.student_id<>$2 AND ps.deleted_at IS NULL
              AND ps.appointment_type='PRACTICAL_CLASS' AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
          UNION ALL SELECT d::date,ap.daily_start_time,(ap.daily_start_time+INTERVAL '100 minutes')::time
            FROM additional_driving_practices ap CROSS JOIN LATERAL
              generate_series(ap.start_date,ap.start_date+(ap.number_of_days-1),INTERVAL '1 day') d
            WHERE ap.instructor_id=$1 AND ap.student_id<>$2 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
        ) occupied WHERE date BETWEEN $3::date AND $4::date`, [instructor.id,id,cycle.start_date,cycle.end_date])).rows;
        const theory=(await db.query('SELECT class_date,start_time,end_time,recurring,modality FROM theory_class_schedules WHERE instructor_id=$1 AND active=TRUE',[instructor.id])).rows;
        for (const date of layout.dates) for (const [start,end] of layout.slots) {
          const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();
          const available = !busy.some(b=>iso(b.date)===date && time(b.start_time)<end && time(b.end_time)>start)
            && !theory.some(t=>(iso(t.class_date)===date || (t.recurring && ((t.modality==='presencial_regular' && weekday>=1 && weekday<=5) || (t.modality==='presencial_sabado' && weekday===6)))) && time(t.start_time)<end && time(t.end_time)>start);
          slots.push({date,start,end,instructorId:instructor.id,available});
        }
      }
      result.push({id:cycle.id,code:cycle.code,branchId:cycle.branch_id,courseId:cycle.course_id,
        startDate:iso(cycle.start_date),endDate:iso(cycle.end_date),modality:cycle.modality,
        requiredClasses:cycle.duration_business_days,instructors,dates:layout.dates,slots});
    }
    return result;
  }

  static async validateTargetBranch(branchId, snapshot, actor, access, client = db) {
    if (!uuid(branchId)) throw createError(422,'Sucursal invalida');
    const result = (await client.query(`SELECT b.id FROM branches b WHERE b.id=$1 AND b.active=TRUE AND
      ($2::boolean OR b.city_id=(SELECT city_id FROM branches WHERE id=$3) OR b.id=$4)`,
    [branchId,!!access.global,access.branchId || actor.branch_id,snapshot.student.branch_id])).rows;
    if (!result.length) throw createError(403,'La sucursal seleccionada no pertenece a tu alcance');
  }

  static async prepare(snapshot, payload, actor, access, client = db) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw createError(422,'Datos de edicion invalidos');
    const changes = [];
    const personal = {};
    for (const [key,[column,label]] of Object.entries(fields)) {
      if (payload.personal?.[key] === undefined) continue;
      let value = payload.personal[key];
      if (value!==null && !['string','number'].includes(typeof value)) throw createError(422,`${label} invalido`);
      if (typeof value === 'string') value = value.trim() || null;
      const maxLength={identification:10,firstName:100,lastName:100,email:150,phone:20,bloodType:5,notes:500}[key];
      if (maxLength && String(value || '').length>maxLength) throw createError(422,`${label} supera ${maxLength} caracteres`);
      if (['identification','firstName','lastName'].includes(key) && !value) throw createError(422,`${label} es obligatorio`);
      if (key==='branch_id' && !value) throw createError(422,'La sucursal es obligatoria');
      if (key==='city_id' && !value && snapshot.student.city_id) throw createError(422,'El canton es obligatorio');
      if (key==='birthDate' && value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || iso(value)!==value)) throw createError(422,'Fecha de nacimiento invalida');
      if (key==='email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw createError(422,'Correo invalido');
      if (key==='discountBenefit' && value && !['UNIVERSITY_STUDENT','POLICE'].includes(value)) throw createError(422,'Convenio no valido');
      if (key==='disabilityPercentage' && value!==null) {
        value=Number(value); if (!Number.isInteger(value) || value<1 || value>100) throw createError(422,'Porcentaje de discapacidad invalido');
      }
      if (['city_id','branch_id','pickupBranchId','referredByUserId'].includes(key) && value && !uuid(value)) throw createError(422,`${label} invalido`);
      if (key==='identification' && !same(value,snapshot.student.identification)) {
        if (!/^\d{10}$/.test(String(value))) throw createError(422,'La cedula debe tener diez digitos');
        if ((await client.query('SELECT 1 FROM students WHERE identification=$1 AND id<>$2',[value,snapshot.student.id])).rows.length
          || (await client.query('SELECT 1 FROM users WHERE username=$1 AND student_id IS DISTINCT FROM $2',[value,snapshot.student.id])).rows.length) throw createError(409,'La cedula ya pertenece a otra cuenta o estudiante');
      }
      const before=key==='birthDate' ? iso(snapshot.student[column]) : snapshot.student[column];
      if (!same(before,value)) {
        personal[column]=value;
        let oldLabel=before,newLabel=value;
        if (key==='branch_id' || key==='pickupBranchId') {
          const labels=(await client.query('SELECT id,name FROM branches WHERE id=ANY($1::uuid[])',[[before,value].filter(Boolean)])).rows;
          oldLabel=labels.find(b=>b.id===before)?.name || before; newLabel=labels.find(b=>b.id===value)?.name || value;
        } else if (key==='city_id') {
          const labels=(await client.query('SELECT id,name FROM cities WHERE id=ANY($1::uuid[])',[[before,value].filter(Boolean)])).rows;
          oldLabel=labels.find(b=>b.id===before)?.name || before; newLabel=labels.find(b=>b.id===value)?.name || value;
        } else if (key==='referredByUserId') {
          const labels=(await client.query("SELECT id,TRIM(CONCAT(first_name,' ',last_name)) name FROM users WHERE id=ANY($1::uuid[])",[[before,value].filter(Boolean)])).rows;
          oldLabel=labels.find(b=>b.id===before)?.name || before;newLabel=labels.find(b=>b.id===value)?.name || value;
        } else if (key==='discountBenefit') {
          const labels={UNIVERSITY_STUDENT:'Estudiante universitario',POLICE:'Policia'};
          oldLabel=labels[before] || null;newLabel=labels[value] || null;
        }
        changes.push({field:label,before:oldLabel,after:newLabel});
      }
    }
    const branchId=personal.branch_id || snapshot.student.branch_id;
    await this.validateTargetBranch(branchId,snapshot,actor,access,client);
    if (personal.branch_id || personal.city_id) {
      const location=(await client.query('SELECT city_id FROM branches WHERE id=$1',[branchId])).rows[0];
      if ((personal.city_id || snapshot.student.city_id)!==location?.city_id) throw createError(422,'La sucursal no pertenece al canton seleccionado');
    }
    if (personal.city_id && !(await client.query('SELECT 1 FROM cities WHERE id=$1',[personal.city_id])).rows.length) throw createError(422,'Canton no disponible');
    if (personal.pickup_branch_id && !(await client.query('SELECT 1 FROM branches WHERE id=$1 AND active=TRUE',[personal.pickup_branch_id])).rows.length) throw createError(422,'Lugar de recogida no disponible');
    if (personal.referred_by_user_id && !(await client.query("SELECT 1 FROM users WHERE id=$1 AND active=TRUE AND student_id IS NULL AND branch_id IS NOT NULL",[personal.referred_by_user_id])).rows.length) throw createError(422,'Referido no disponible');
    const enrollment=snapshot.enrollments[0] || null;
    if (snapshot.enrollments.length>1 && (payload.academic || payload.finance || payload.newPayment)) throw createError(409,'Este estudiante tiene varias matriculas activas; selecciona la matricula desde su expediente');
    const academic=payload.academic || null;
    let cycle=null;
    if (academic) {
      if (!has(actor,'SCHEDULE_CHANGE') && !has(actor,'SCHEDULE_ASSIGN')) throw createError(403,'No tienes permiso para cambiar horarios');
      if (!enrollment) throw createError(422,'El estudiante no tiene matricula regular activa');
      if (!uuid(academic.courseId)) throw createError(422,'Curso invalido');
      if (!(await client.query(`SELECT 1 FROM branch_courses WHERE branch_id=$1 AND course_id=$2 AND active=TRUE`,[branchId,academic.courseId])).rows.length) throw createError(422,'Curso no habilitado en esta sucursal');
      if (!same(enrollment.course_id,academic.courseId)) {
        const name=(await client.query('SELECT name FROM courses WHERE id=$1',[academic.courseId])).rows[0]?.name;
        changes.push({field:'Curso',before:enrollment.course_name,after:name});
      }
      const plan=academic.schedulePlan;
      if (!plan?.selections?.length || !uuid(plan.preferredInstructorId)) throw createError(422,'Selecciona un curso, instructor y horario');
      cycle=(await client.query('SELECT * FROM course_cycles WHERE id=$1',[plan.selections[0].cycleId])).rows[0];
      if (!cycle || cycle.course_id!==academic.courseId) throw createError(422,'El horario no corresponde al curso seleccionado');
      const requested=(await client.query('SELECT code,city_id FROM branches WHERE id=$1',[branchId])).rows[0];
      const destination=(await client.query('SELECT code,city_id FROM branches WHERE id=$1',[cycle.branch_id])).rows[0];
      const shared=requested?.city_id===destination?.city_id && requested.code==='SP_IC2' && destination.code==='SP_IC1';
      if (cycle.branch_id!==branchId && !shared) throw createError(422,'El horario no corresponde a la sucursal seleccionada');
      if (snapshot.appointments.some(p=>!['PROGRAMADA','PROXIMA'].includes(p.status))
        || snapshot.assignments.some(a=>iso(a.schedule_date)<iso(new Date()))) throw createError(409,'El curso ya tiene clases realizadas o fechas pasadas; usa el cambio de dias para sus clases pendientes');
      const instructor=(await client.query(`SELECT TRIM(CONCAT(u.first_name,' ',u.last_name)) name FROM instructor_profiles ip
        JOIN users u ON u.id=ip.user_id WHERE ip.id=$1`,[plan.preferredInstructorId])).rows[0];
      const oldInstructorId=snapshot.assignments[0]?.instructor_id || snapshot.appointments[0]?.instructor_id;
      const oldInstructor=oldInstructorId ? (await client.query(`SELECT TRIM(CONCAT(u.first_name,' ',u.last_name)) name
        FROM instructor_profiles ip JOIN users u ON u.id=ip.user_id WHERE ip.id=$1`,[oldInstructorId])).rows[0]?.name : null;
      if (!same(oldInstructorId,plan.preferredInstructorId)) changes.push({field:'Instructor',before:oldInstructor,after:instructor?.name});
      const oldSchedule=snapshot.assignments.map(a=>`${iso(a.schedule_date)} ${time(a.start_time)}-${time(a.end_time)}`).sort();
      if (!oldSchedule.length) oldSchedule.push(...snapshot.appointments.filter(a=>a.appointment_type==='EXAM_ONLY').map(a=>`${iso(a.scheduled_start)} ${new Date(a.scheduled_start).toTimeString().slice(0,5)} (solo examen)`));
      const newSchedule=plan.selections.map(s=>`${s.date} ${String(s.time).replace(/\s/g,'')}${plan.practicalMode==='exam_only' ? ' (solo examen)' : ''}`).sort();
      if (JSON.stringify(oldSchedule)!==JSON.stringify(newSchedule)) changes.push({field:'Fechas y horario',before:oldSchedule.join('\n'),after:newSchedule.join('\n')});
      if (academic.theorySelection!==undefined) {
        const oldTheory=enrollment.theory_modality==='presencial_intensivo' ? time(enrollment.theory_start_time)==='13:00' ? 'presencial_intensivo_13' : 'presencial_intensivo_08' : enrollment.theory_modality || 'por_confirmar';
        const labels={por_confirmar:'Por confirmar',virtual:'Virtual',presencial_regular:'Presencial - lunes a viernes',presencial_intensivo_08:'Intensivo - manana',presencial_intensivo_13:'Intensivo - tarde'};
        if (!labels[academic.theorySelection]) throw createError(422,'Modalidad de teoria invalida');
        if (oldTheory!==academic.theorySelection) changes.push({field:'Teoria',before:labels[oldTheory] || oldTheory,after:labels[academic.theorySelection]});
      }
    } else if (enrollment && personal.branch_id) throw createError(422,'Selecciona el nuevo curso y horario para cambiar la sucursal de una matricula');
    const documents=payload.documents || [];
    if (!Array.isArray(documents) || documents.length>8) throw createError(422,'Documentos invalidos');
    if (documents.reduce((sum,d)=>sum+String(d.fileUrl || '').length,0)>14*1024*1024) throw createError(422,'Los documentos no pueden superar 10 MB en total');
    const documentCodes=new Set();
    for (const document of documents) {
      const codes=document.type==='registro_documentos'
        ? document.includesBloodCard===false ? ['cedula'] : ['cedula','carnet_tipo_sangre']
        : [document.type];
      if (typeof document.fileUrl!=='string' || !/^data:(application\/pdf|image\/(jpeg|png));base64,[A-Za-z0-9+/=\r\n]+$/.test(document.fileUrl)
        || document.fileUrl.length>14*1024*1024) throw createError(422,'Carga un PDF, JPG o PNG de hasta 10 MB');
      if (document.type==='registro_documentos' && !document.fileUrl.startsWith('data:application/pdf;')) throw createError(422,'El documento combinado debe ser PDF');
      for (const code of codes) {
        const existing=snapshot.documents.find(d=>d.type===code);
        if (!has(actor,existing ? 'DOCUMENT_UPDATE' : 'DOCUMENT_CREATE')) throw createError(403,'No tienes permiso para cargar este documento');
        const type=(await client.query('SELECT id,name FROM document_types WHERE code=$1 AND active=TRUE',[code])).rows[0];
        if (!type || documentCodes.has(code)) throw createError(422,'Tipo de documento invalido o duplicado');
        documentCodes.add(code);
        changes.push({field:type.name,before:existing ? 'Documento actual' : 'Sin documento',after:document.name || 'Nuevo documento'});
      }
    }
    if (payload.cedulaIndicatesBachiller) {
      if (documentCodes.has('certificado_bachiller')) throw createError(422,'El certificado ya fue adjuntado');
      const cedula=snapshot.documents.find(d=>d.type==='cedula' && d.file_path);
      if (!cedula && !documentCodes.has('cedula')) throw createError(422,'Carga la cedula antes de confirmar bachiller');
      const existing=snapshot.documents.find(d=>d.type==='certificado_bachiller');
      if (!has(actor,existing ? 'DOCUMENT_UPDATE' : 'DOCUMENT_CREATE')) throw createError(403,'No tienes permiso para confirmar bachiller');
      changes.push({field:'Certificado de estudio',before:existing ? 'Documento actual' : 'Sin documento',after:'La cedula indica bachiller'});
    }
    const payment=snapshot.payments[0];
    const finance=payload.finance || null;
    const newPayment=payload.newPayment ? Object.fromEntries(['amount','method','reference','cardBatch','transferDate'].map(key=>[key,payload.newPayment[key]])) : null;
    const courseChanged=academic && enrollment.course_id!==academic.courseId;
    const benefitChanged=personal.discount_benefit!==undefined;
    let finalAmount=payment ? Number(payment.final_amount) : null;
    if (courseChanged || finance || benefitChanged) {
      if (!has(actor,'PAYMENT_CREATE')) throw createError(403,'El cambio de tarifa requiere permiso de Caja');
      if (!payment) throw createError(422,'No hay cuenta de pago para esta matricula');
      const course=(await client.query('SELECT price,name FROM courses WHERE id=$1',[academic?.courseId || enrollment.course_id])).rows[0];
      const price=Number(course?.price);
      const benefit=benefitChanged ? personal.discount_benefit : snapshot.student.discount_benefit;
      const kind=/clase\s*a|moto/i.test(course.name) ? 'moto' : /clase\s*b|auto/i.test(course.name) && !/tipo\s*f/i.test(course.name) ? 'carro' : null;
      if (benefit && !kind) throw createError(422,'El convenio solo aplica a Moto y Carro');
      const prices={UNIVERSITY_STUDENT:{moto:117,carro:180},POLICE:{moto:110,carro:170}};
      finalAmount=benefit ? prices[benefit][kind] : finance?.finalAmount!==undefined ? Number(finance.finalAmount) : price;
      const paid=Number(payment.final_amount)-Number(payment.balance);
      if (!Number.isFinite(finalAmount) || Math.abs(finalAmount*100-Math.round(finalAmount*100))>0.000001 || finalAmount<paid || finalAmount<0 || finalAmount>price) throw createError(422,'El importe debe tener hasta dos decimales y estar entre lo ya pagado y el precio del curso');
      if (!benefit && kind==='carro' && finalAmount<175) throw createError(422,'El curso de automovil no puede quedar por debajo de $175.00');
      if (snapshot.transfers.reduce((sum,t)=>sum+Number(t.amount),0)>finalAmount-paid) throw createError(422,'El importe no cubre las transferencias pendientes de verificacion');
      if (Number(payment.final_amount)!==finalAmount) changes.push({field:'Importe del curso',before:Number(payment.final_amount).toFixed(2),after:finalAmount.toFixed(2)});
    }
    if (payload.newPayment) {
      if (!has(actor,'PAYMENT_CREATE')) throw createError(403,'No tienes permiso para registrar pagos');
      const amount=Number(payload.newPayment.amount);
      if (!payment || !Number.isFinite(amount) || Math.abs(amount*100-Math.round(amount*100))>0.000001 || amount<=0 || amount>finalAmount-(Number(payment.final_amount)-Number(payment.balance))-snapshot.transfers.reduce((sum,t)=>sum+Number(t.amount),0)) throw createError(422,'Monto de pago invalido o comprometido por transferencias pendientes');
      const configured=(await client.query(`SELECT bpm.requires_reference FROM branch_payment_methods bpm
        JOIN payment_methods pm ON pm.id=bpm.payment_method_id WHERE bpm.branch_id=$1 AND pm.code=$2 AND bpm.active=TRUE AND pm.active=TRUE`,
      [access.branchId || actor.branch_id || snapshot.student.branch_id,payload.newPayment.method])).rows[0];
      if (!configured) throw createError(422,'Metodo de pago no disponible');
      if ((configured.requires_reference || payload.newPayment.method==='transferencia') && !String(payload.newPayment.reference || '').trim()) throw createError(422,'La referencia del pago es obligatoria');
      if (payload.newPayment.method==='tarjeta' && !String(payload.newPayment.cardBatch || '').trim()) throw createError(422,'El lote de tarjeta es obligatorio');
      if (payload.newPayment.method==='transferencia' && (!/^\d{4}-\d{2}-\d{2}$/.test(payload.newPayment.transferDate || '') || !Number.isFinite(Date.parse(payload.newPayment.transferDate)) || iso(payload.newPayment.transferDate)!==payload.newPayment.transferDate)) throw createError(422,'Selecciona una fecha de transferencia valida');
      changes.push({field:'Nuevo abono',before:'Sin nuevo abono',after:`$${Number(payload.newPayment.amount).toFixed(2)} - ${payload.newPayment.method}${payload.newPayment.method==='transferencia' ? ' (por verificar)' : ''}`});
      for (const [key,label] of [['reference','Referencia del abono'],['cardBatch','Lote de tarjeta'],['transferDate','Fecha de transferencia']]) {
        if ((key==='cardBatch' && payload.newPayment.method!=='tarjeta') || (key==='transferDate' && payload.newPayment.method!=='transferencia')) continue;
        if (payload.newPayment[key]) changes.push({field:label,before:null,after:payload.newPayment[key]});
      }
    }
    if (!changes.length) throw createError(422,'No has realizado cambios');
    return {personal,academic,documents,finance,newPayment,finalAmount,changes,enrollment,cycle};
  }

  static async preview(id,payload,actor,access={}) {
    const snapshot=await this.snapshot(id);
    await this.assertScope(snapshot,actor,access);
    if (payload.revision!==snapshot.revision) throw createError(409,'El expediente cambio. Cierra y vuelve a abrir Editar para revisarlo');
    const prepared=await this.prepare(snapshot,payload,actor,access);
    return {changes:prepared.changes,confirmationToken:confirmation({revision:snapshot.revision,payload,actorId:actor.id})};
  }

  static async save(id,data,actor,access={},transactionClient=null) {
    const client=transactionClient || await db.getClient();
    try {
      if (!transactionClient) await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`student-edit:${id}`]);
      const snapshot=await this.snapshot(id,client,true);
      await this.assertScope(snapshot,actor,access,client);
      const {payload,confirmationToken}=data || {};
      if (!payload || payload.revision!==snapshot.revision || confirmationToken!==confirmation({revision:snapshot.revision,payload,actorId:actor.id})) throw createError(409,'Los datos cambiaron o falta confirmar el resumen. Revisa los cambios nuevamente');
      const prepared=await this.prepare(snapshot,payload,actor,access,client);
      const {personal,academic,documents,enrollment,cycle}=prepared;
      const entries=Object.entries(personal);
      if (entries.length) await client.query(`UPDATE students SET ${entries.map(([key],i)=>`${key}=$${i+2}`).join(',')},
        updated_by=$${entries.length+2},updated_at=NOW() WHERE id=$1`,[id,...entries.map(([,value])=>value),actor.id]);
      if (snapshot.account) {
        const student=(await client.query('SELECT * FROM students WHERE id=$1',[id])).rows[0];
        const accountUsername=snapshot.account.username===snapshot.student.identification ? student.identification : snapshot.account.username;
        const newHash=personal.identification && snapshot.account.must_change_password && snapshot.account.username===snapshot.student.identification
          ? await bcrypt.hash(student.identification,12) : null;
        const accountEmail=personal.email===undefined ? snapshot.account.email : student.email || null;
        await client.query(`UPDATE users SET first_name=$2,last_name=$3,email=$4,phone=$5,branch_id=$6,username=$7,
          password_hash=COALESCE($8,password_hash),updated_at=NOW() WHERE id=$1`,
        [snapshot.account.id,student.first_name,student.last_name,accountEmail,student.phone,student.branch_id,accountUsername,newHash]);
        if (newHash) await AccountSessions.revokeAllForUser(snapshot.account.id,'STUDENT_IDENTIFICATION_UPDATED',client);
        if (personal.branch_id) await client.query(`UPDATE user_roles ur SET branch_id=$2 FROM roles r
          WHERE ur.user_id=$1 AND ur.role_id=r.id AND r.code='STUDENT' AND ur.active=TRUE`,[snapshot.account.id,personal.branch_id]);
      }
      for (const document of documents) await client.query(`INSERT INTO student_documents
        (student_id,document_type_id,file_path,observations,uploaded_at)
        SELECT $1,id,$3,$4,NOW() FROM document_types WHERE code=ANY($2::text[]) AND active=TRUE
        ON CONFLICT(student_id,document_type_id) DO UPDATE SET file_path=EXCLUDED.file_path,
          observations=EXCLUDED.observations,uploaded_at=NOW()`,[id,
          document.type==='registro_documentos'
            ? document.includesBloodCard===false ? ['cedula'] : ['cedula','carnet_tipo_sangre']
            : [document.type],document.fileUrl,document.name || null]);
      if (payload.cedulaIndicatesBachiller) {
        const cedula=(await client.query(`SELECT sd.file_path FROM student_documents sd JOIN document_types dt
          ON dt.id=sd.document_type_id WHERE sd.student_id=$1 AND dt.code='cedula'`,[id])).rows[0];
        if (!cedula?.file_path) throw createError(422,'Carga la cedula antes de confirmar bachiller');
        await client.query(`INSERT INTO student_documents (student_id,document_type_id,file_path,observations,uploaded_at)
          SELECT $1,id,$2,'La cedula indica bachiller. No requiere certificado de estudio.',NOW()
          FROM document_types WHERE code='certificado_bachiller' AND active=TRUE
          ON CONFLICT(student_id,document_type_id) DO UPDATE SET file_path=EXCLUDED.file_path,
          observations=EXCLUDED.observations,uploaded_at=NOW()`,[id,cedula.file_path]);
      }
      if (academic) {
        await client.query('UPDATE enrollments SET course_id=$2,branch_id=$3,updated_at=NOW() WHERE id=$1',[enrollment.id,academic.courseId,cycle.branch_id]);
        await client.query("UPDATE course_cycle_schedule_assignments SET status='cancelado',updated_at=NOW() WHERE enrollment_id=$1 AND status='activo'",[enrollment.id]);
        await client.query("UPDATE referred_instructor_schedule_blocks SET status='cancelado',updated_at=NOW() WHERE enrollment_id=$1 AND status='activo'",[enrollment.id]);
        await client.query(`UPDATE practical_sessions SET status='REPROGRAMADA',deleted_at=NOW(),updated_at=NOW(),
          cancellation_reason='Edicion confirmada del expediente' WHERE enrollment_id=$1 AND deleted_at IS NULL AND status IN ('PROGRAMADA','PROXIMA')`,[enrollment.id]);
        const theorySelection=academic.theorySelection===undefined
          ? enrollment.theory_modality==='presencial_intensivo' ? time(enrollment.theory_start_time)==='13:00' ? 'presencial_intensivo_13' : 'presencial_intensivo_08'
            : enrollment.theory_modality || 'por_confirmar'
          : academic.theorySelection;
        const preserveTheory=academic.theorySelection===undefined && enrollment.course_id===academic.courseId && enrollment.branch_id===cycle.branch_id;
        await Cycles.reserveSchedule(actor,{studentId:id,schedulePlan:{...academic.schedulePlan,theorySchedule:preserveTheory ? 'por_confirmar' : theorySelection}},client);
        if (academic.schedulePlan.practicalMode!=='exam_only') {
          const conflicts=(await client.query(`SELECT 1 FROM course_cycle_schedule_assignments requested
            WHERE requested.enrollment_id=$1 AND requested.status='activo' AND (
              EXISTS(SELECT 1 FROM practical_sessions ps JOIN enrollments other ON other.id=ps.enrollment_id
                WHERE ps.instructor_id=requested.instructor_id AND other.student_id<>$2 AND ps.deleted_at IS NULL
                AND ps.appointment_type='PRACTICAL_CLASS' AND ps.status NOT IN ('CANCELADA','REPROGRAMADA')
                AND ps.scheduled_start::date=requested.schedule_date AND ps.scheduled_start::time<requested.end_time AND ps.scheduled_end::time>requested.start_time)
              OR EXISTS(SELECT 1 FROM additional_driving_practices ap WHERE ap.instructor_id=requested.instructor_id
                AND ap.student_id<>$2 AND ap.status IN ('SCHEDULED','IN_PROGRESS')
                AND requested.schedule_date BETWEEN ap.start_date AND ap.start_date+(ap.number_of_days-1)
                AND ap.daily_start_time<requested.end_time AND (ap.daily_start_time+INTERVAL '100 minutes')::time>requested.start_time)
            ) LIMIT 1`,[enrollment.id,id])).rows;
          if (conflicts.length) throw createError(409,'El instructor ya tiene una clase o practica adicional en ese horario');
        }
        if (preserveTheory) await client.query(`UPDATE enrollments SET theory_modality=$2,theory_start_time=$3,theory_end_time=$4 WHERE id=$1`,
          [enrollment.id,enrollment.theory_modality,enrollment.theory_start_time,enrollment.theory_end_time]);
        else if (['por_confirmar','virtual'].includes(theorySelection)) await client.query('UPDATE theory_group_students SET active=FALSE WHERE enrollment_id=$1',[enrollment.id]);
        await Sessions.reconcilePracticalSessions(client,enrollment.id,academic.schedulePlan.preferredInstructorId,actor.id);
      }
      if (prepared.finance || personal.discount_benefit!==undefined || (academic && enrollment.course_id!==academic.courseId)) {
        const payment=snapshot.payments[0];
        const total=Number((await client.query('SELECT price FROM courses WHERE id=$1',[academic?.courseId || enrollment.course_id])).rows[0].price);
        const balance=prepared.finalAmount-(Number(payment.final_amount)-Number(payment.balance));
        await client.query(`UPDATE payments SET total=$2::numeric,discount=$2::numeric-$3::numeric,final_amount=$3::numeric,balance=$4::numeric,
          status=CASE WHEN $4::numeric<=0 THEN 'pagado' WHEN $4::numeric<$3::numeric THEN 'parcial' ELSE 'pendiente' END WHERE id=$1`,
        [payment.id,total,prepared.finalAmount,balance]);
      }
      if (prepared.newPayment?.method==='transferencia') await Cash.createTransfer({...prepared.newPayment,studentId:id},actor,
        {global:!!access.global,branchId:access.branchId || actor.branch_id || snapshot.student.branch_id},access.requestContext,client);
      else if (prepared.newPayment) await Payments.registerPayment({...prepared.newPayment,cedula:personal.identification || snapshot.student.identification,
        collectionBranchId:access.branchId || actor.branch_id || snapshot.student.branch_id,cashierUserId:actor.id,cashierRole:actor.role,globalAccess:!!access.global,requestContext:access.requestContext},client);
      await client.query('SELECT refresh_student_operational_status($1)',[id]);
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[id,
        `Edicion confirmada por ${actor.name || actor.username || actor.id}: ${prepared.changes.map(c=>c.field).join(', ')}`.slice(0,255)]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:personal.branch_id || snapshot.student.branch_id,
        action:'STUDENT_RECORD_EDITED',module:'ESTUDIANTES',entityType:'STUDENT',entityId:id,
        description:'Edicion completa confirmada desde el expediente',metadata:{changes:prepared.changes},
        requestContext:access.requestContext},client);
      if (!transactionClient) await client.query('COMMIT');
      return {id,changes:prepared.changes};
    } catch(error) {
      if (!transactionClient) await client.query('ROLLBACK');
      if (error.code==='23505') throw createError(409,'La cedula, correo o cupo ya esta ocupado. Revisa los cambios');
      throw error;
    } finally { if (!transactionClient) client.release(); }
  }
}

module.exports=StudentRecordEditService;
