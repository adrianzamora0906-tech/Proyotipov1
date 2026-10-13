const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const AutoClose = require('../backend/services/PracticalSessionAutoCloseService');

async function main() {
  const client = await db.getClient();
  const originalGetClient = db.getClient;
  try {
    await client.query('BEGIN');
    // Temporary tables shadow production tables; all writes are rolled back.
    for (const table of ['practical_sessions', 'history', 'audit_logs']) {
      await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING DEFAULTS) ON COMMIT DROP`);
    }
    const sample = (await client.query(`SELECT * FROM public.practical_sessions
      WHERE deleted_at IS NULL AND instructor_id IS NOT NULL AND enrollment_id IS NOT NULL LIMIT 2`)).rows;
    assert.equal(sample.length, 2);
    for (const row of sample) {
      await client.query('INSERT INTO practical_sessions SELECT * FROM public.practical_sessions WHERE id=$1', [row.id]);
    }
    const oldId = sample[0].id, nextId = sample[1].id, instructorId = sample[0].instructor_id;
    await client.query(`UPDATE practical_sessions SET instructor_id=$1,status='PROGRAMADA',deleted_at=NULL`, [instructorId]);
    await client.query(`UPDATE practical_sessions SET status='EN_CURSO',actual_start=NOW()-INTERVAL '2 hours',
      actual_end=NULL,attendance_status=NULL,scheduled_start=NOW()-INTERVAL '2 hours',scheduled_end=NOW()-INTERVAL '20 minutes'
      WHERE id=$1`, [oldId]);
    const next = { id: nextId, instructor_id: instructorId, scheduled_start: new Date() };
    const result = await AutoClose.closePreviousForStart(client, next, null);
    assert.deepEqual(result.sessionIds, [oldId]);
    let closed = (await client.query('SELECT * FROM practical_sessions WHERE id=$1', [oldId])).rows[0];
    assert.equal(closed.status, 'COMPLETADA');
    assert.equal(closed.attendance_status, null);
    assert.equal(+closed.actual_end, +closed.scheduled_end);
    assert.equal((await AutoClose.closePreviousForStart(client, next, null)).closedCount, 0);
    const audit = (await client.query("SELECT * FROM audit_logs WHERE action='SESSION_AUTO_CLOSE_NEXT_START'")).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].metadata.nextSessionId, nextId);
    assert.equal((await client.query('SELECT COUNT(*)::int count FROM history')).rows[0].count, 1);
    await client.query(`UPDATE practical_sessions SET status='EN_CURSO',scheduled_end=NOW()+INTERVAL '10 minutes' WHERE id=$1`, [oldId]);
    assert.equal((await AutoClose.closePreviousForStart(client, next, null)).closedCount, 0);
    // A rejected new start must roll back the previous closure with it.
    await client.query(`UPDATE practical_sessions SET scheduled_end=NOW()-INTERVAL '20 minutes',actual_end=NULL WHERE id=$1`, [oldId]);
    await client.query('SAVEPOINT failed_start');
    await AutoClose.closePreviousForStart(client, next, null);
    await client.query('ROLLBACK TO SAVEPOINT failed_start');
    assert.equal((await client.query('SELECT status FROM practical_sessions WHERE id=$1', [oldId])).rows[0].status, 'EN_CURSO');
    const wrapper = { release() {}, query(sql, params) {
      if (sql === 'BEGIN') return client.query('SAVEPOINT worker');
      if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT worker');
      if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT worker');
      return client.query(sql, params);
    } };
    db.getClient = async () => wrapper;
    assert.equal((await AutoClose.closeExpiredSessions()).closedCount, 0);
    await client.query(`UPDATE practical_sessions SET scheduled_end=NOW()-INTERVAL '30 minutes',actual_end=NOW()-INTERVAL '35 minutes' WHERE id=$1`, [oldId]);
    const actualEnd = (await client.query('SELECT actual_end FROM practical_sessions WHERE id=$1', [oldId])).rows[0].actual_end;
    assert.equal((await AutoClose.closeExpiredSessions()).closedCount, 1);
    closed = (await client.query('SELECT * FROM practical_sessions WHERE id=$1', [oldId])).rows[0];
    assert.equal(+closed.actual_end, +actualEnd);
    assert.equal(closed.attendance_status, null);
    assert.equal((await AutoClose.closeExpiredSessions()).closedCount, 0);
    assert.equal((await client.query("SELECT COUNT(*)::int count FROM audit_logs WHERE action='SESSION_AUTO_CLOSE_TIMEOUT'")).rows[0].count, 1);
    console.log('PASS: next-start closure at 20 minutes, overlapping protection, rollback, 30-minute timeout, recorded exit preservation, unchanged attendance and idempotent audit/history');
  } finally {
    db.getClient = originalGetClient;
    await client.query('ROLLBACK');
    client.release();
  }
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; }).finally(() => db.pool.end());
