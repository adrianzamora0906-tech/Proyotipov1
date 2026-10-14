const assert = require('node:assert/strict');
const { test } = require('node:test');
const databasePath = require.resolve('../backend/config/database');
require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: {} };
const Suspension = require('../backend/services/StudentSuspensionService');
function clientFor(snapshot) {
  const calls = [];
  return { calls, async query(sql, values) {
    calls.push({sql, values});
    return { rows: sql.startsWith('SELECT snapshot') && snapshot ? [{snapshot}] : [] };
  } };
}
test('habilita la matricula original y acceso sin recuperar el horario anterior', async () => {
  const client = clientFor({status:'pendiente_pago',records:{enrollments:[{id:'enrollment',status:'activo'}],
    users:[{id:'account',active:true}],practical_sessions:[{id:'old-session'}]}});
  await Suspension.enableWithNewSchedule(client,'student','enrollment',{id:'operator',role:'secretaria_sucursal'});
  assert(client.calls.some(call=>call.sql.startsWith('UPDATE enrollments')));
  assert(client.calls.some(call=>call.sql.startsWith('UPDATE users') && call.values[1]===true));
  assert(client.calls.some(call=>call.sql.includes('STUDENT_ENABLED')));
  assert(client.calls.some(call=>call.sql.startsWith('DELETE FROM student_suspensions')));
  assert(!client.calls.some(call=>/UPDATE (practical_sessions|course_cycle_schedule_assignments|student_schedules)/.test(call.sql)));
  assert(!client.calls.some(call=>call.sql==='COMMIT'));
});
test('rechaza una habilitacion sin suspension', async () => {
  const client=clientFor(null);
  await assert.rejects(Suspension.enableWithNewSchedule(client,'s','e',{id:'u'}), /reversible/);
  assert.equal(client.calls.length,1);
});
test('no habilita matriculas que estaban cerradas antes de la suspension', async () => {
  const client=clientFor({records:{enrollments:[{id:'e',status:'cerrado'}]}});
  await assert.rejects(Suspension.enableWithNewSchedule(client,'s','e',{id:'u'}), /no estaba activa/);
  assert.equal(client.calls.length,1);
});
