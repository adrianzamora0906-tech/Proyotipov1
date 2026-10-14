const assert=require('node:assert/strict');
const db=require('../backend/config/database');
const Cycles=require('../backend/services/CourseCycleService');
const branchId='20857100-415d-4072-94cb-7ad8635d9dc3';
const nelsonCycle='88ea3b1d-71ec-405f-85dc-37563d1e21d9';
const darioCycle='b37e8d75-695e-4822-ac50-2e5a793eabd6';
async function main(){
  const actor=(await db.query('SELECT id,role,branch_id FROM users WHERE id=$1 AND active=TRUE',['5e6fb736-9259-4e9b-ba77-fd4cef720d4e'])).rows[0];
  assert(actor);
  const snapshot=async()=>({
    assignments:(await db.query('SELECT * FROM course_cycle_schedule_assignments WHERE cycle_id=$1 ORDER BY id',[darioCycle])).rows,
    reservations:(await db.query('SELECT * FROM course_cycle_seat_reservations WHERE cycle_id=$1 ORDER BY id',[nelsonCycle])).rows,
  });
  const before=await snapshot();
  const reservation=before.reservations.find(row=>row.status==='activo'&&new Date(row.expires_at)>new Date());
  assert(reservation,'No hay reserva activa para probar la proteccion');
  const filters={branch_id:branchId,vehicle_type:'moto',modality:'intensivo',include_occupied:true};
  const available=await Cycles.getEnrollmentOptions(actor,filters);
  assert(!available.some(cycle=>cycle.id===nelsonCycle),'Nelson no debe ofrecer cupos nuevos para distribucion retirada');
  assert(available.some(cycle=>cycle.id===darioCycle),'Dario debe seguir disponible');
  const activation=await Cycles.getEnrollmentOptions(actor,{...filters,reservation_id:reservation.id,instructor_id:reservation.instructor_id});
  assert(activation.some(cycle=>cycle.id===nelsonCycle),'La reserva existente debe poder activarse');
  assert.deepEqual(await snapshot(),before,'No se deben modificar alumnos ni reservas');
  console.log('PASS: oferta nueva sin Nelson, Dario disponible, reserva de Michael conservada y activable; alumnos intactos.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
