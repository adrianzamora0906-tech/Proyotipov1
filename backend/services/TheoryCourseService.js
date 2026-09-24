const db = require('../config/database');
const { createError } = require('../middleware/errorHandler');

const CAPACITY = 30;
const REGULAR_CADENCE_ANCHOR = '2026-09-21';
const INTENSIVE_MORNING_CADENCE_ANCHOR = '2026-09-26';
const INTENSIVE_AFTERNOON_CADENCE_ANCHOR = '2026-10-03';
const selections = {
  presencial_regular: { modality:'presencial_regular', startTime:'18:00', endTime:'20:00', durationDays:5 },
  presencial_intensivo: { modality:'presencial_intensivo', startTime:'08:00', endTime:'12:30', durationDays:2 },
  presencial_intensivo_08: { modality:'presencial_intensivo', startTime:'08:00', endTime:'12:30', durationDays:2 },
  presencial_intensivo_13: { modality:'presencial_intensivo', startTime:'13:00', endTime:'17:30', durationDays:2 },
};

function iso(value){return new Date(value).toISOString().slice(0,10);}
function addDays(value,days){const date=new Date(`${iso(value)}T12:00:00`);date.setDate(date.getDate()+days);return iso(date);}
function nextWeekday(value,weekday){const date=new Date(`${iso(value)}T12:00:00`);do{date.setDate(date.getDate()+1);}while(date.getDay()!==weekday);return iso(date);}
function currentOrNextWeekday(value,weekday){const date=new Date(`${iso(value)}T12:00:00`);if(date.getDay()===weekday)return iso(date);return nextWeekday(value,weekday);}
function currentWeekMonday(value){const date=new Date(`${iso(value)}T12:00:00`);const day=date.getDay();if(day===0)return nextWeekday(value,1);if(day===6)return nextWeekday(value,1);date.setDate(date.getDate()-(day-1));return iso(date);}
function currentOrNextRegularMonday(value){
  const monday=currentWeekMonday(value);
  const elapsedDays=Math.round((new Date(`${monday}T12:00:00`)-new Date(`${REGULAR_CADENCE_ANCHOR}T12:00:00`))/86400000);
  const remainder=((elapsedDays%14)+14)%14;
  return remainder===0?monday:addDays(monday,14-remainder);
}
function currentOrNextIntensiveSaturday(value,anchor){
  const current=iso(value);
  if(current<=anchor)return anchor;
  const elapsedDays=Math.floor((new Date(`${current}T12:00:00`)-new Date(`${anchor}T12:00:00`))/86400000);
  const periods=Math.ceil(elapsedDays/14);
  return addDays(anchor,periods*14);
}
function classDates(group){if(group.modality==='presencial_regular')return [0,1,2,3,4].map(offset=>addDays(group.start_date,offset));return [iso(group.start_date),addDays(group.start_date,7)];}

async function resolveEnrollmentBranchId(branchId){
  if(!branchId)return null;
  const result=await db.query(`SELECT COALESCE(reference.id,current.id) branch_id
    FROM branches current LEFT JOIN branches reference
      ON current.code='SP_IC2' AND reference.code='SP_IC1'
      AND reference.city_id=current.city_id AND reference.active=TRUE
    WHERE current.id=$1 LIMIT 1`,[branchId]);
  return result.rows[0]?.branch_id||branchId;
}

class TheoryCourseService {
  static normalizeSelection(value){const option=selections[value];if(!option)throw createError(422,'Selecciona un turno de teoría válido');return option;}

  static async findInstructor(client,branchId,option){
    const scheduleModality=option.modality==='presencial_intensivo'?'presencial_sabado':'presencial_regular';
    const result=await client.query(`SELECT ts.instructor_id FROM theory_class_schedules ts JOIN instructor_profiles ip ON ip.id=ts.instructor_id JOIN users u ON u.id=ip.user_id WHERE ts.branch_id=$1 AND ts.modality=$2 AND ts.start_time=$3::time AND ts.end_time=$4::time AND ts.active=TRUE AND u.active=TRUE AND ip.deleted_at IS NULL ORDER BY ts.updated_at DESC LIMIT 1`,[branchId,scheduleModality,option.startTime,option.endTime]);
    if(!result.rows[0])throw createError(409,`No existe profesor configurado para teoría de ${option.startTime} a ${option.endTime}`);
    return result.rows[0].instructor_id;
  }

  static initialStart(option,fromDate=new Date()) {
    if(option.modality==='presencial_regular')return currentOrNextRegularMonday(fromDate);
    const anchor=option.startTime==='13:00'
      ? INTENSIVE_AFTERNOON_CADENCE_ANCHOR
      : INTENSIVE_MORNING_CADENCE_ANCHOR;
    return currentOrNextIntensiveSaturday(fromDate,anchor);
  }
  static endDate(option,start){return addDays(start,option.modality==='presencial_regular'?4:7);}

  static async getOrCreateGroup(client,{branchId,courseId,selection,actorId,allowFull=false}){
    const option=this.normalizeSelection(selection);
    const instructorId=await this.findInstructor(client,branchId,option);
    let start=this.initialStart(option);
    for(let guard=0;guard<60;guard++){
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`theory:${branchId}:${selection}:${start}`]);
      let group=(await client.query(`SELECT g.*,(SELECT COUNT(*)::int FROM theory_group_students gs WHERE gs.group_id=g.id AND gs.active=TRUE) occupied FROM theory_course_groups g WHERE g.branch_id=$1 AND g.modality=$2 AND g.start_date=$3::date AND g.start_time=$4::time AND g.end_time=$5::time AND g.status<>'cancelado' FOR UPDATE`,[branchId,option.modality,start,option.startTime,option.endTime])).rows[0];
      if(!group){group=(await client.query(`INSERT INTO theory_course_groups(branch_id,course_id,instructor_id,modality,start_date,end_date,start_time,end_time,capacity,created_by) VALUES($1,$2,$3,$4,$5::date,$6::date,$7::time,$8::time,$9,$10) RETURNING *,0::int occupied`,[branchId,courseId||null,instructorId,option.modality,start,this.endDate(option,start),option.startTime,option.endTime,CAPACITY,actorId||null])).rows[0];}
      if(allowFull||Number(group.occupied)<Number(group.capacity))return group;
      // La teoria regular abre un grupo cada dos lunes; el lunes intermedio queda libre.
      start=addDays(start,14);
    }
    throw createError(409,'No se encontró un próximo grupo teórico disponible');
  }

  static async assignEnrollment(client,{enrollmentId,studentId,branchId,courseId,selection,actorId}){
    if(selection==='virtual')return null;
    const group=await this.getOrCreateGroup(client,{branchId,courseId,selection,actorId});
    const count=await client.query(`SELECT COUNT(*)::int occupied FROM theory_group_students WHERE group_id=$1 AND active=TRUE`,[group.id]);
    if(Number(count.rows[0].occupied)>=Number(group.capacity))throw createError(409,'El grupo teórico llegó a 30 estudiantes');
    await client.query(`INSERT INTO theory_group_students(group_id,enrollment_id,student_id,assigned_by) VALUES($1,$2,$3,$4) ON CONFLICT(enrollment_id) DO UPDATE SET group_id=EXCLUDED.group_id,student_id=EXCLUDED.student_id,assigned_by=EXCLUDED.assigned_by,assigned_at=NOW(),active=TRUE`,[group.id,enrollmentId,studentId,actorId]);
    return group;
  }

  static async changeStudentTheory(user,studentId,data={}){
    const selection=String(data.selection||'');
    const pending=selection==='por_confirmar';
    const virtual=selection==='virtual';
    const option=pending||virtual?null:this.normalizeSelection(selection);
    const client=await db.getClient();
    try{
      await client.query('BEGIN');
      const enrollment=(await client.query(`SELECT e.id,e.student_id,e.branch_id,e.course_id,e.theory_modality,
        TO_CHAR(e.theory_start_time,'HH24:MI') theory_start_time,TO_CHAR(e.theory_end_time,'HH24:MI') theory_end_time
        FROM enrollments e JOIN branches target ON target.id=e.branch_id
        LEFT JOIN branches actor_branch ON actor_branch.id=$2
        WHERE e.student_id=$1 AND e.status='activo'
          AND ($2::uuid IS NULL OR target.city_id=actor_branch.city_id)
        ORDER BY e.enrollment_date DESC LIMIT 1 FOR UPDATE OF e`,[studentId,user.branch_id||null])).rows[0];
      if(!enrollment)throw createError(404,'Matrícula activa no encontrada para cambiar la teoría');
      const previous=(await client.query(`SELECT tgs.group_id,g.modality,g.start_date,g.end_date,g.start_time,g.end_time
        FROM theory_group_students tgs JOIN theory_course_groups g ON g.id=tgs.group_id
        WHERE tgs.enrollment_id=$1 AND tgs.active=TRUE LIMIT 1`,[enrollment.id])).rows[0]||null;
      let group=null;
      if(pending||virtual){
        await client.query('UPDATE theory_group_students SET active=FALSE WHERE enrollment_id=$1 AND active=TRUE',[enrollment.id]);
      }else{
        group=await this.assignEnrollment(client,{enrollmentId:enrollment.id,studentId:enrollment.student_id,
          branchId:enrollment.branch_id,courseId:enrollment.course_id,selection,actorId:user.id});
      }
      const modality=pending?null:virtual?'virtual':option.modality;
      await client.query(`UPDATE enrollments SET theory_modality=$2,theory_start_time=$3::time,
        theory_end_time=$4::time,updated_at=NOW() WHERE id=$1`,
      [enrollment.id,modality,option?.startTime||null,option?.endTime||null]);
      await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[
        enrollment.student_id,`Horario de teoría cambiado a ${selection}`]);
      await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata)
        VALUES($1,$2,$3,'THEORY_SCHEDULE_CHANGED','enrollments',$4,$5::jsonb)`,
      [user.id,user.role,enrollment.branch_id,enrollment.id,JSON.stringify({previous,selection,groupId:group?.id||null})]);
      await client.query('COMMIT');
      return {selection,modality,group};
    }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
  }

  static async options(user,filters={}){
    const requestedBranchId=filters.branch_id||user.branch_id;if(!requestedBranchId)throw createError(422,'Sucursal requerida');
    // Shopin comparte la oferta teórica y sus cupos con Flavio Reyes.
    const branchId=await resolveEnrollmentBranchId(requestedBranchId);
    const client=await db.getClient();try{
      const rows=[];
      for(const key of ['presencial_regular','presencial_intensivo_08','presencial_intensivo_13']){
        const option=selections[key];
        try{const group=await this.getOrCreateGroup(client,{branchId,courseId:filters.course_id||null,selection:key,actorId:user.id,allowFull:true});const occupied=Number(group.occupied||0),full=occupied>=Number(group.capacity);const next=full?await this.getOrCreateGroup(client,{branchId,courseId:filters.course_id||null,selection:key,actorId:user.id}):group;const nextOccupied=Number(next.occupied||0),nextCapacity=Number(next.capacity);rows.push({value:key,modality:option.modality,startDate:iso(group.start_date),endDate:iso(group.end_date),nextAvailableStartDate:iso(next.start_date),nextAvailableEndDate:iso(next.end_date),startTime:option.startTime,endTime:option.endTime,capacity:Number(group.capacity),occupied,available:Math.max(Number(group.capacity)-occupied,0),full,nextAvailableCapacity:nextCapacity,nextAvailableOccupied:nextOccupied,nextAvailable:Math.max(nextCapacity-nextOccupied,0)});}catch(error){rows.push({value:key,modality:option.modality,startTime:option.startTime,endTime:option.endTime,unavailable:true,message:error.message});}
      }
      return rows;
    }finally{client.release();}
  }

  static async instructorGroups(user){
    const instructor=await this.instructorContext(user);
    const result=await db.query(`SELECT g.*,b.name branch_name,(SELECT COUNT(*)::int FROM theory_group_students gs WHERE gs.group_id=g.id AND gs.active=TRUE) students FROM theory_course_groups g JOIN branches b ON b.id=g.branch_id WHERE g.instructor_id=$1 AND g.status<>'cancelado' ORDER BY g.start_date DESC,g.start_time`,[instructor.id]);
    return result.rows.map(g=>({...g,start_date:iso(g.start_date),end_date:iso(g.end_date),classDates:classDates(g)}));
  }

  static async instructorDashboard(user){
    const instructor=await this.instructorContext(user);
    const [students,attendance]=await Promise.all([
      db.query(`SELECT COUNT(DISTINCT gs.student_id)::int total FROM theory_group_students gs
        JOIN theory_course_groups g ON g.id=gs.group_id WHERE g.instructor_id=$1 AND g.status<>'cancelado' AND gs.active=TRUE`,[instructor.id]),
      db.query(`SELECT a.class_date,g.id group_id,g.modality,g.start_time,g.end_time,
        COUNT(*)::int records,COUNT(*) FILTER(WHERE a.status='presente')::int present,
        COUNT(*) FILTER(WHERE a.status='ausente')::int absent,
        COUNT(*) FILTER(WHERE a.status='justificado')::int justified
        FROM theory_attendance a JOIN theory_course_groups g ON g.id=a.group_id
        WHERE g.instructor_id=$1 AND g.status<>'cancelado'
        GROUP BY a.class_date,g.id,g.modality,g.start_time,g.end_time ORDER BY a.class_date DESC,g.start_time DESC LIMIT 40`,[instructor.id]),
    ]);
    const groups=await this.instructorGroups(user);
    const today=iso(new Date());
    const upcoming=groups.flatMap(group=>group.classDates.filter(date=>date>=today).map(date=>({date,groupId:group.id,modality:group.modality,startTime:String(group.start_time).slice(0,5),endTime:String(group.end_time).slice(0,5),students:Number(group.students||0)}))).sort((a,b)=>`${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`))[0]||null;
    return {summary:{groups:groups.filter(group=>group.end_date>=today).length,students:Number(students.rows[0]?.total||0),attendanceDays:attendance.rows.length,present:attendance.rows.reduce((sum,row)=>sum+Number(row.present||0),0)},upcoming,history:attendance.rows.map(row=>({...row,class_date:iso(row.class_date),start_time:String(row.start_time).slice(0,5),end_time:String(row.end_time).slice(0,5)}))};
  }

  static async instructorContext(user){
    if(user.role!=='instructor')throw createError(403,'Acceso permitido solo para instructores');
    const row=(await db.query(`SELECT ip.id FROM instructor_profiles ip WHERE ip.user_id=$1 AND ip.deleted_at IS NULL`,[user.id])).rows[0];if(!row)throw createError(403,'Perfil de instructor no configurado');return row;
  }

  static async roster(user,groupId){
    const instructor=await this.instructorContext(user);
    const group=(await db.query(`SELECT g.* FROM theory_course_groups g WHERE g.id=$1 AND g.instructor_id=$2 AND g.status<>'cancelado'`,[groupId,instructor.id])).rows[0];if(!group)throw createError(404,'Grupo teórico no encontrado');
    const students=await db.query(`SELECT s.id student_id,s.identification,TRIM(CONCAT(s.first_name,' ',s.last_name)) student,COALESCE(json_object_agg(a.class_date,a.status) FILTER(WHERE a.id IS NOT NULL),'{}') attendance FROM theory_group_students gs JOIN students s ON s.id=gs.student_id LEFT JOIN theory_attendance a ON a.group_id=gs.group_id AND a.student_id=s.id WHERE gs.group_id=$1 AND gs.active=TRUE GROUP BY s.id ORDER BY s.last_name,s.first_name`,[groupId]);
    return {group:{...group,start_date:iso(group.start_date),end_date:iso(group.end_date),classDates:classDates(group)},students:students.rows};
  }

  static async saveAttendance(user,groupId,data){
    const client=await db.getClient();try{await client.query('BEGIN');const instructor=await this.instructorContext(user);const group=(await client.query(`SELECT * FROM theory_course_groups WHERE id=$1 AND instructor_id=$2 FOR UPDATE`,[groupId,instructor.id])).rows[0];if(!group)throw createError(404,'Grupo teórico no encontrado');const date=iso(data.classDate);if(!classDates(group).includes(date))throw createError(422,'La fecha no pertenece a este curso teórico');const records=Array.isArray(data.records)?data.records:[];for(const record of records){if(!['presente','ausente','justificado'].includes(record.status))throw createError(422,'Estado de asistencia inválido');const belongs=await client.query(`SELECT 1 FROM theory_group_students WHERE group_id=$1 AND student_id=$2 AND active=TRUE`,[groupId,record.studentId]);if(!belongs.rowCount)throw createError(422,'El estudiante no pertenece al grupo');await client.query(`INSERT INTO theory_attendance(group_id,student_id,class_date,status,observation,recorded_by) VALUES($1,$2,$3::date,$4,$5,$6) ON CONFLICT(group_id,student_id,class_date) DO UPDATE SET status=EXCLUDED.status,observation=EXCLUDED.observation,recorded_by=EXCLUDED.recorded_by,recorded_at=NOW(),updated_at=NOW()`,[groupId,record.studentId,date,record.status,String(record.observation||'').trim()||null,user.id]);}await client.query(`INSERT INTO audit_logs(user_id,role,branch_id,action,entity,entity_id,metadata) VALUES($1,$2,$3,'UPDATE','THEORY_ATTENDANCE',$4,$5)`,[user.id,user.role,user.branch_id||null,groupId,{classDate:date,records:records.length}]);await client.query('COMMIT');return this.roster(user,groupId);}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}
}

module.exports=TheoryCourseService;
