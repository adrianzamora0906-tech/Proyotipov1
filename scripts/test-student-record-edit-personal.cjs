const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const db = require('../backend/config/database');
const Service = require('../backend/services/StudentRecordEditService');

async function main() {
  const actor = (await db.query("SELECT id,role,branch_id,username FROM users WHERE username='admin'")).rows[0];
  actor.permissions = ['STUDENT_UPDATE'];
  const access = { global: true, branchId: actor.branch_id };
  const target = (await db.query(`SELECT s.id FROM students s JOIN users u ON u.student_id=s.id
    WHERE EXISTS(SELECT 1 FROM course_cycle_schedule_assignments a WHERE a.student_id=s.id AND a.status='activo')
    ORDER BY s.id LIMIT 1`)).rows[0];
  assert(target, 'A student with an account and schedule is required');
  const before = await Service.snapshot(target.id);
  const client = await db.getClient();
  try {
    // Save real edits inside transactions that are always rolled back.
    for (const email of [before.student.email, `edit-${crypto.randomUUID()}@example.com`]) {
      const payload = { revision: before.revision, personal: {
        identification: before.student.identification, email,
        birthDate: '2000-05-05', notes: `Personal edit regression ${crypto.randomUUID()}`,
      } };
      const preview = await Service.preview(target.id, payload, actor, access);
      assert(!preview.changes.some(change => /horario|instructor|curso/i.test(change.field)));
      await client.query('BEGIN');
      try {
        await Service.save(target.id, { payload, confirmationToken: preview.confirmationToken }, actor, access, client);
        const after = await Service.snapshot(target.id, client);
        assert.equal(after.student.identification, before.student.identification);
        assert.equal(after.account.id, before.account.id);
        assert.equal(after.account.email, email === before.student.email ? before.account.email : email);
        assert.deepEqual(after.enrollments, before.enrollments);
        assert.deepEqual(after.assignments, before.assignments);
        assert.deepEqual(after.appointments, before.appointments);
        assert.deepEqual(after.payments, before.payments);
        console.log(`PASS personal edit with ${email === before.student.email ? 'own' : 'new'} email preserves enrollment and occupied schedule`);
      } finally {
        await client.query('ROLLBACK');
      }
    }
    const other = (await db.query('SELECT email FROM users WHERE id<>$1 AND email IS NOT NULL AND email<>$2 LIMIT 1',
      [before.account.id, before.student.email || ''])).rows[0];
    assert(other, 'Another account email is required');
    await assert.rejects(Service.preview(target.id, { revision: before.revision, personal: { email: other.email } }, actor, access),
      /El correo ya pertenece a otra cuenta/);
    assert.equal((await Service.snapshot(target.id)).revision, before.revision);
    console.log('PASS another account email is rejected before confirmation; all writes rolled back');
  } finally {
    client.release();
    await db.pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
