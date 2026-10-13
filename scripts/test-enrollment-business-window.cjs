const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const { deadlineSql } = require('../backend/services/EnrollmentWindow');

async function main() {
  const starts = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08',
    '2026-10-09', '2026-10-10', '2026-10-11', '2026-12-31'];
  const expected = ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-12',
    '2026-10-13', '2026-10-13', '2026-10-13', '2027-01-04'];
  const result = await db.query(`SELECT cc.start_date::text AS start,
    ${deadlineSql}::text AS deadline,
    (${deadlineSql} <= ${deadlineSql}) AS inclusive,
    (${deadlineSql} + 1 <= ${deadlineSql}) AS next_day_allowed
    FROM unnest($1::date[]) AS cc(start_date) ORDER BY cc.start_date`, [starts]);
  result.rows.forEach((row, index) => {
    assert.equal(row.start, starts[index]);
    assert.equal(row.deadline, expected[index]);
    assert.equal(row.inclusive, true);
    assert.equal(row.next_day_allowed, false);
  });
  console.log('PASS: seven start weekdays, inclusive deadline and year boundary');
}

main().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.pool.end());
