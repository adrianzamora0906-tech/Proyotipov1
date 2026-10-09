const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Accounts = require('../backend/services/StudentAccountService');
const Sessions = require('../backend/services/CycleInstructorAssignmentService');
const Payments = require('../backend/services/PaymentService');
const Audit = require('../backend/services/AuditService');

const marker = 'THREE_WEEKEND_ROSTERS_20261010_CONFIRMED';
const dates10 = ['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18'];
const dates17 = ['2026-10-17', '2026-10-18', '2026-10-24', '2026-10-25'];
const motoDates = ['2026-10-10', '2026-10-11', '2026-10-17'];
const groups = {
  elias: { code: 'SP_IC1_49_26', instructor: '410c1883-8c7c-462d-bf7e-49baf9e5ce27', dates: dates10 },
  rolando: { code: 'SP_IC1_55_26', instructor: '3502fb7e-eb33-4338-9375-bc5701009367', dates: dates17 },
  antonio: { code: 'SP_IM1_38_26', instructor: 'd5adaafe-3b3e-4f53-991c-7f2a77b46186', dates: motoDates },
};
const roster = [
  { id: '1311960957', group: 'elias', start: '07:00', end: '10:10', declared: '$165 transferencia; verificar diferencia con transferencia pendiente de $100' },
  { id: '1315969095', group: 'elias', start: '10:30', end: '13:50' },
  { id: '1317646972', group: 'elias', start: '14:30', end: '17:50', declared: '$165 tarjeta; pendiente referencia y lote' },
  { id: '1316897667', group: 'rolando', start: '07:00', end: '10:10', changeCourse: true, cash: 100 },
  { id: '1354200667', group: 'rolando', start: '10:30', end: '13:50', note: 'FALTA TIPO DE SANGRE' },
  { id: '1316965159', group: 'rolando', start: '14:30', end: '17:50', dates: ['2026-10-18', '2026-10-25'], first: 'JORGE MATEO', last: 'CHIRIBOGA SOLORZANO', phone: '0969801713', note: 'DOMINGO 18 Y 25' },
  { id: '1752255230', group: 'antonio', start: '06:00', end: '08:30', cash: 100, note: 'SABE CONDUCIR' },
  { id: '1315509115', group: 'antonio', start: '09:00', end: '11:30', declared: '$100 transferencia; pendiente referencia' },
  { id: '2350538563', group: 'antonio', start: '12:00', end: '14:30', first: 'DEIVI ISMAEL', last: 'VELEZ MERO', phone: '0969814747', address: 'MANTA', email: 'velezdeivi7@gmail.com', note: 'PRUEBA', declared: '$100 tarjeta; pendiente referencia y lote' },
  { id: '1308735602', group: 'antonio', start: '15:00', end: '17:30', first: 'ERICK JONATHAN', last: 'FIGUEROA PICO', phone: '0992938208', address: 'Barrio Jocay', cash: 70 },
  { id: '1312314352', group: 'antonio', start: '18:00', end: '20:30', note: 'PRUEBA A LAS 8:30, segun hoja; fecha no especificada' },
  { id: '1316751864', group: 'antonio', start: '12:30', end: '12:50', first: 'STALIN JOSHUA', last: 'ERAZO MARIN', phone: '0990752327', address: 'JARAMIJO', exam: true, dates: ['2026-10-10'], declared: '$125 transferencia; pendiente referencia', note: 'Solo examen el 10 de octubre de 2026 a las 12:30, confirmado por usuario' },
];

function validCedula(id) {
  if (!/^\d{10}$/.test(id)) return false;
  const digits = [...id].map(Number);
  const sum = digits.slice(0, 9).reduce((n, digit, index) => n + (index % 2 ? digit : digit * 2 > 9 ? digit * 2 - 9 : digit * 2), 0);
  return (10 - sum % 10) % 10 === digits[9];
}

async function run(client) {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [marker]);
  const actor = (await client.query("SELECT id,role FROM users WHERE username='admin' AND active=TRUE")).rows[0];
  assert(actor, 'Usuario responsable no disponible');
  for (const group of Object.values(groups)) {
    const cycle = (await client.query(`SELECT cc.*,c.price,b.city_id FROM course_cycles cc
      JOIN courses c ON c.id=cc.course_id JOIN branches b ON b.id=cc.branch_id
      WHERE cc.code=$1 AND cc.active=TRUE AND cc.deleted_at IS NULL FOR UPDATE OF cc`, [group.code])).rows[0];
    assert(cycle, `Curso no disponible ${group.code}`);
    group.cycle = cycle;
    assert((await client.query(`SELECT 1 FROM course_cycle_instructors ci
      JOIN instructor_profiles ip ON ip.id=ci.instructor_id JOIN users u ON u.id=ip.user_id
      WHERE ci.cycle_id=$1 AND ci.instructor_id=$2 AND ci.active=TRUE
      AND ip.status='activo' AND ip.deleted_at IS NULL AND u.active=TRUE`, [cycle.id, group.instructor])).rows.length, 'Instructor no habilitado');
  }
  const changed = [];
  if (process.argv.includes('--replace-cristhian')) {
    assert(!process.argv.includes('--defer-erick'), 'El reemplazo requiere asignar a Erick');
    const reservationId = 'd62dfd1e-ec0f-4813-bad7-4d8dc4d9c59e';
    const reservation = (await client.query('SELECT * FROM course_cycle_seat_reservations WHERE id=$1 FOR UPDATE', [reservationId])).rows[0];
    assert(reservation && reservation.referred_identification === '2450130154'
      && reservation.cycle_id === groups.antonio.cycle.id
      && reservation.instructor_id === groups.antonio.instructor
      && reservation.reserved_start_time === '15:00:00'
      && reservation.reserved_end_time === '17:30:00', 'La reserva no coincide con el reemplazo autorizado');
    if (reservation.status === 'activo') {
      assert(!reservation.enrollment_id && !reservation.student_id, 'La reserva ya tiene matricula vinculada');
      await client.query(`UPDATE course_cycle_seat_reservations SET status='cancelado',cancelled_by=$2,
        notes=CONCAT_WS(E'\n',NULLIF(notes,''),'Reemplazo por Erick Jonathan Figueroa Pico 1308735602 solicitado por usuario'),
        updated_at=NOW() WHERE id=$1`, [reservationId,actor.id]);
      await client.query(`UPDATE instructor_availability_overrides SET active=FALSE,updated_by=$2,updated_at=NOW()
        WHERE active=TRUE AND reason LIKE $1`, [`RESERVA_CURSO:${reservationId}:%`,actor.id]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:reservation.branch_id,
        action:'TEMPORARY_ENROLLMENT_CANCELLED',module:'HORARIOS',entityType:'COURSE_CYCLE_SEAT_RESERVATION',entityId:reservationId,
        description:'Reserva reemplazada por Erick Jonathan conforme a hoja y confirmacion del usuario',
        oldValues:{status:reservation.status,identification:reservation.referred_identification},
        newValues:{status:'cancelado'},metadata:{marker,replacementIdentification:'1308735602',cycleId:reservation.cycle_id}},client);
    } else assert(reservation.status === 'cancelado', 'La reserva cambio de estado');
  }
  for (const item of roster) {
    if (process.argv.includes('--defer-erick') && item.id === '1308735602') continue;
    const group = groups[item.group];
    const cycle = group.cycle;
    const itemMarker = `${marker}:${item.id}`;
    const dates = item.dates || group.dates;
    if ((await client.query('SELECT 1 FROM history WHERE action=$1', [itemMarker])).rows.length) continue;
    let student = (await client.query('SELECT * FROM students WHERE identification=$1 FOR UPDATE', [item.id])).rows[0];
    if (!student) {
      assert(item.first && item.last && validCedula(item.id), `Identidad incompleta: ${item.id}`);
      student = (await client.query(`INSERT INTO students
        (identification,first_name,last_name,phone,address,email,blood_type,branch_id,city_id,status,created_by,registration_type)
        VALUES($1,$2,$3,$4,$5,$6,'N/D',$7,$8,'pendiente_pago',$9,'REGULAR') RETURNING *`,
      [item.id, item.first, item.last, item.phone, item.address, item.email || null, cycle.branch_id, cycle.city_id, actor.id])).rows[0];
    }
    assert(student.status !== 'inhabilitado', 'Estudiante inhabilitado');
    const enrollments = (await client.query("SELECT * FROM enrollments WHERE student_id=$1 AND status='activo' FOR UPDATE", [student.id])).rows;
    assert(enrollments.length <= 1, `Multiples matriculas: ${item.id}`);
    let enrollment = enrollments[0];
    if (!enrollment) enrollment = (await client.query(`INSERT INTO enrollments
      (student_id,branch_id,course_id,status,created_by) VALUES($1,$2,$3,'activo',$4) RETURNING *`,
    [student.id, cycle.branch_id, cycle.course_id, actor.id])).rows[0];
    assert(enrollment.branch_id === cycle.branch_id, 'Matricula en otra sucursal');
    const before = { enrollment, student: { status: student.status, notes: student.notes } };
    if (enrollment.course_id !== cycle.course_id) {
      assert(item.changeCourse, 'Cambio de curso no autorizado');
      assert(!(await client.query(`SELECT 1 FROM payment_details d JOIN payments p ON p.id=d.payment_id
        WHERE p.enrollment_id=$1 AND d.status='ACTIVE'`, [enrollment.id])).rows.length, 'Cambio de curso con pagos existentes');
      await client.query('UPDATE enrollments SET course_id=$2,updated_at=NOW() WHERE id=$1', [enrollment.id, cycle.course_id]);
      await client.query(`UPDATE payments SET total=$2,discount=0,final_amount=$2,balance=$2,status='pendiente'
        WHERE enrollment_id=$1 AND status<>'anulado'`, [enrollment.id, cycle.price]);
    }
    const current = (await client.query(`SELECT id,cycle_id,instructor_id,schedule_date::text,start_time::text,end_time::text
      FROM course_cycle_schedule_assignments WHERE enrollment_id=$1 AND status='activo' ORDER BY schedule_date,start_time FOR UPDATE`, [enrollment.id])).rows;
    before.assignments = current;
    const expected = dates.map(date => `${cycle.id}|${group.instructor}|${date}|${item.start}:00|${item.end}:00`).sort();
    const actual = current.map(a => `${a.cycle_id}|${a.instructor_id}|${a.schedule_date}|${a.start_time}|${a.end_time}`).sort();
    const scheduleChanged = !item.exam && JSON.stringify(expected) !== JSON.stringify(actual);
    if (scheduleChanged || item.exam) {
      assert(!(await client.query(`SELECT 1 FROM practical_sessions WHERE enrollment_id=$1 AND deleted_at IS NULL
        AND status NOT IN ('PROGRAMADA','PROXIMA','CANCELADA','REPROGRAMADA')`, [enrollment.id])).rows.length, 'Clases ya iniciadas');
      for (const date of dates) {
        const lockKey = item.exam ? `exam-only:${group.instructor}:${date}:${item.start}`
          : `instructor-slot:${group.instructor}:${date}:${item.start}:00:${item.end}:00`;
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [lockKey]);
        if (item.exam) {
          const count = (await client.query(`SELECT COUNT(*)::int n FROM practical_sessions WHERE instructor_id=$1
            AND appointment_type='EXAM_ONLY' AND deleted_at IS NULL AND status NOT IN ('CANCELADA','REPROGRAMADA')
            AND scheduled_start::date=$2::date AND scheduled_start::time=$3::time`, [group.instructor, date, item.start])).rows[0].n;
          assert(count < 2 && !current.length, 'Cupo de examen no disponible');
        } else {
          const conflicts = await client.query(`SELECT 1 FROM (
            SELECT schedule_date,start_time,end_time FROM course_cycle_schedule_assignments
              WHERE instructor_id=$1 AND status='activo' AND enrollment_id<>$5
            UNION ALL SELECT schedule_date,start_time,end_time FROM referred_instructor_schedule_blocks
              WHERE instructor_id=$1 AND status='activo' AND enrollment_id<>$5
            UNION ALL SELECT schedule_date,start_time,end_time FROM instructor_availability_overrides
              WHERE instructor_id=$1 AND active=TRUE
            UNION ALL SELECT scheduled_start::date,scheduled_start::time,scheduled_end::time FROM practical_sessions
              WHERE instructor_id=$1 AND enrollment_id<>$5 AND deleted_at IS NULL
                AND appointment_type='PRACTICAL_CLASS' AND status NOT IN ('CANCELADA','REPROGRAMADA')
            UNION ALL SELECT $2::date,start_time,end_time FROM theory_class_schedules
              WHERE instructor_id=$1 AND active=TRUE AND (class_date=$2::date OR (recurring=TRUE AND
                ((modality='presencial_regular' AND EXTRACT(DOW FROM $2::date) BETWEEN 1 AND 5)
                OR (modality='presencial_sabado' AND EXTRACT(DOW FROM $2::date)=6))))
          ) busy WHERE schedule_date=$2::date AND start_time<$4::time AND end_time>$3::time LIMIT 1`,
          [group.instructor,date,item.start,item.end,enrollment.id]);
          assert(!conflicts.rows.length, `Conflicto ${item.id}: ${date} ${item.start}`);
        }
      }
      await client.query("UPDATE course_cycle_schedule_assignments SET status='cancelado',updated_at=NOW() WHERE enrollment_id=$1 AND status='activo'", [enrollment.id]);
      await client.query("UPDATE referred_instructor_schedule_blocks SET status='cancelado',updated_at=NOW() WHERE enrollment_id=$1 AND status='activo'", [enrollment.id]);
      await client.query('UPDATE enrollment_instructor_assignments SET active=FALSE,updated_at=NOW() WHERE enrollment_id=$1 AND active=TRUE', [enrollment.id]);
      await client.query(`INSERT INTO enrollment_instructor_assignments
        (enrollment_id,instructor_id,assigned_by,start_date,end_date,active,observations)
        VALUES($1,$2,$3,$4::date,$5::date,TRUE,$6)`, [enrollment.id,group.instructor,actor.id,dates[0],dates.at(-1),itemMarker]);
      if (item.exam) {
        await client.query(`INSERT INTO practical_sessions(enrollment_id,instructor_id,branch_id,scheduled_start,
          scheduled_end,session_number,status,observations,appointment_type,created_by)
          VALUES($1,$2,$3,$4::date+$5::time,$4::date+$6::time,1,'PROGRAMADA',$7,'EXAM_ONLY',$8)`,
        [enrollment.id,group.instructor,cycle.branch_id,dates[0],item.start,item.end,item.note,actor.id]);
      } else {
        for (const date of dates) {
          const params = [cycle.id,enrollment.id,student.id,date,item.start,item.end,group.instructor,actor.id];
          await client.query(`INSERT INTO course_cycle_schedule_assignments
            (cycle_id,enrollment_id,student_id,schedule_date,start_time,end_time,instructor_id,status,created_by)
            VALUES($1,$2,$3,$4::date,$5::time,$6::time,$7,'activo',$8)`,params);
          await client.query(`INSERT INTO referred_instructor_schedule_blocks
            (cycle_id,enrollment_id,student_id,schedule_date,start_time,end_time,instructor_id,status,created_by)
            VALUES($1,$2,$3,$4::date,$5::time,$6::time,$7,'activo',$8)`,params);
        }
        await Sessions.reconcilePracticalSessions(client,enrollment.id,group.instructor,actor.id);
      }
      await client.query(`UPDATE enrollments SET practical_start_date=$2::date,practical_end_date=$3::date,
        updated_at=NOW() WHERE id=$1`,[enrollment.id,dates[0],dates.at(-1)]);
    }
    if (!(await client.query("SELECT 1 FROM payments WHERE enrollment_id=$1 AND status<>'anulado'", [enrollment.id])).rows.length) {
      await client.query(`INSERT INTO payments(enrollment_id,total,discount,final_amount,balance,status)
        VALUES($1,$2,0,$2,$2,'pendiente')`, [enrollment.id,cycle.price]);
    }
    const account = await Accounts.createForStudent(student.id,client);
    if (item.cash) {
      await Payments.registerPayment({ cedula:item.id,amount:item.cash,method:'efectivo',
        collectionBranchId:cycle.branch_id,cashierUserId:actor.id,cashierRole:actor.role,
        concept:`${itemMarker}: abono en efectivo segun hoja confirmada por usuario` },client);
    }
    const note = [item.note,item.declared ? `Abono declarado en hoja: ${item.declared}.` : null].filter(Boolean).join(' ');
    if (note) await client.query(`UPDATE students SET notes=CONCAT_WS(E'\n',NULLIF(notes,''),$2::text),updated_at=NOW() WHERE id=$1`, [student.id,note]);
    await client.query(`UPDATE students s SET status=CASE WHEN p.balance<=0 THEN 'pago_confirmado'
      WHEN p.balance<p.final_amount THEN 'pago_parcial' ELSE 'horario_seleccionado' END,updated_at=NOW()
      FROM payments p WHERE s.id=$1 AND p.enrollment_id=$2 AND p.status<>'anulado'`, [student.id,enrollment.id]);
    await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[student.id,itemMarker]);
    await client.query('INSERT INTO history(student_id,action) VALUES($1,$2)',[student.id,
      `${item.exam ? 'Solo examen' : 'Horario verificado'}: ${group.code}, ${dates.join(', ')}, ${item.start}-${item.end}. Ajuste solicitado segun hoja. ${note}`]);
    await Audit.log({userId:actor.id,role:actor.role,branchId:cycle.branch_id,action:'ROSTER_RECONCILED',module:'ESTUDIANTES',
      entityType:'ENROLLMENT',entityId:enrollment.id,description:'Tres cursos de fin de semana ajustados a hojas confirmadas',
      oldValues:before,newValues:{cycle:group.code,instructorId:group.instructor,dates,start:item.start,end:item.end,examOnly:!!item.exam},
      metadata:{marker,identification:item.id,cash:item.cash||null,declaredPayment:item.declared||null,accountCreated:account.created}},client);
    const saved = (await client.query(`SELECT schedule_date::text,start_time::text,end_time::text,instructor_id
      FROM course_cycle_schedule_assignments WHERE enrollment_id=$1 AND status='activo' ORDER BY schedule_date`,[enrollment.id])).rows;
    assert.equal(saved.length,item.exam ? 0 : dates.length);
    assert(saved.every(a=>a.instructor_id===group.instructor && a.start_time===`${item.start}:00` && a.end_time===`${item.end}:00`));
    changed.push({identification:item.id,course:group.code,classes:saved.length,examOnly:!!item.exam,accountCreated:account.created});
  }
  if (process.argv.includes('--apply')) { await client.query('COMMIT'); console.log('COMMITTED',JSON.stringify(changed)); }
  else { await client.query('ROLLBACK'); console.log('DRY_RUN_OK',JSON.stringify(changed)); }
}

(async()=>{const client=await db.getClient();try{await run(client);}catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}})()
  .catch(e=>{console.error(e.stack);process.exitCode=1;}).finally(()=>db.pool.end());
