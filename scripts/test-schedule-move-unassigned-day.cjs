const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Cycles = require('../backend/services/CourseCycleService');
const Records = require('../backend/services/StudentRecordEditService');

async function main() {
  const studentId = '0a97d8ae-e4b2-47c6-b1a4-c78b2160dc22';
  const actor = (await db.query("SELECT id,role FROM users WHERE username='admin'")).rows[0];
  const before = await Records.snapshot(studentId);
  const cycle = await Cycles.getStudentScheduleChangeOptions(actor, studentId);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Guayaquil' }).format(new Date());
  const source = cycle.currentAssignments.find(item => item.date >= today);
  const destination = cycle.slots.flatMap(slot => Object.entries(slot.occupancyByDate).map(([date, occupancy]) => ({
    date, time: `${slot.startTime} - ${slot.endTime}`, available: occupancy.available,
  }))).find(item => item.date >= today && item.available > 0 && !cycle.currentAssignments.some(a => a.date === item.date));
  assert(source && destination, 'A future class and an unassigned free day are required');
  const originalGetClient = db.getClient;
  let checked = false;
  db.getClient = async () => {
    const client = await originalGetClient();
    const query = client.query.bind(client);
    // Exercise the real service but roll back instead of committing live data.
    return {
      release: () => client.release(),
      query: async (sql, params) => {
        if (sql === 'COMMIT') {
          const after = await Records.snapshot(studentId, client);
          assert.equal(after.assignments.length, before.assignments.length);
          assert(!after.assignments.some(a => a.id === source.id));
          assert(after.assignments.some(a => new Date(a.schedule_date).toISOString().slice(0, 10) === destination.date));
          for (const assignment of before.assignments.filter(a => a.id !== source.id)) {
            assert.deepEqual(after.assignments.find(a => a.id === assignment.id), assignment);
          }
          assert.equal(after.appointments.length, before.appointments.length);
          assert.deepEqual(after.payments, before.payments);
          checked = true;
          return query('ROLLBACK');
        }
        return query(sql, params);
      },
    };
  };
  try {
    await Cycles.changeStudentScheduleDays(actor, { studentId, cycleId: cycle.id,
      changes: [{ date: destination.date, time: destination.time, assignmentId: source.id }],
      observation: 'Prueba de traslado a dia libre: rollback',
    });
    assert(checked);
    assert.equal((await Records.snapshot(studentId)).revision, before.revision);
    console.log('PASS move one class to an unassigned day; other seven classes and payments preserved; all writes rolled back');
  } finally {
    db.getClient = originalGetClient;
    await db.pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
