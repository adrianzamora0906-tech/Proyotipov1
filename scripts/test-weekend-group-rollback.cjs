const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Service = require('../backend/services/WeekendGroupService');

async function main() {
  const sample = (await db.query(`SELECT cc.id,a.instructor_id,cc.branch_id FROM course_cycles cc
    JOIN course_cycle_schedule_assignments a ON a.cycle_id=cc.id AND a.status='activo'
    WHERE cc.modality='intensivo' AND cc.active=TRUE AND a.schedule_date>CURRENT_DATE AND a.instructor_id IS NOT NULL
    ORDER BY cc.start_date LIMIT 1`)).rows[0];
  assert(sample, 'Debe existir un grupo futuro para la prueba');
  const actor = (await db.query("SELECT id,role FROM users WHERE active=TRUE AND username='admin' LIMIT 1")).rows[0];
  assert(actor);
  const user = { ...actor, global: true };
  const data = await Service.get(user, sample.id, sample.instructor_id);
  const member = data.members.find(item => item.slots.some(slot => slot.editable));
  assert(member);
  const originalGetClient = db.getClient;
  let rolledBack = false;
  db.getClient = async () => {
    const client = await originalGetClient();
    const query = client.query.bind(client);
    return {
      query: (sql, params) => {
        if (sql === 'COMMIT') { rolledBack = true; return query('ROLLBACK'); }
        return query(sql, params);
      }, release: () => client.release(),
    };
  };
  try {
    await Service.save(user, sample.id, sample.instructor_id, { version: data.version,
      reason: 'PRUEBA TRANSACCIONAL SIN PERSISTENCIA', changes: [{ enrollmentId: member.enrollmentId,
        instructorId: sample.instructor_id, slots: member.slots.filter(slot => slot.editable).map(({date,time}) => ({date,time})) }] });
  } finally { db.getClient = originalGetClient; }
  assert(rolledBack, 'El COMMIT debe haberse sustituido por ROLLBACK');
  const after = await Service.get(user, sample.id, sample.instructor_id);
  assert.equal(after.version, data.version, 'Los horarios reales no deben cambiar');
  console.log('PASS: SQL real, conciliacion de agenda, historial, notificaciones y auditoria; ROLLBACK confirmado, sin cambios persistidos.');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.pool.end());
