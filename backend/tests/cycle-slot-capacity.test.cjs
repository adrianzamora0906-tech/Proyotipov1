const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

// Ejecutar con RUN_DB_READONLY_TESTS=1: solo SELECT, sin crear datos reales.
const enabled = process.env.RUN_DB_READONLY_TESTS === '1';
const db = enabled ? require('../config/database') : null;
after(async () => { if (db) await db.pool.end(); });
const source = fs.readFileSync(path.join(__dirname, '../services/CourseCycleService.js'), 'utf8');
const sql = source.match(/const occupiedResult = await client\.query\(`(\s*SELECT COALESCE\(SUM\(CASE WHEN instructor_id[\s\S]*?)`, \[cycleId, startTime, endTime, selection\.date,/)[1];
const fixtureSql = `WITH fixture AS (
  SELECT * FROM jsonb_to_recordset($6::jsonb) AS f(
    enrollment_id text, instructor_id text, cycle_id text, schedule_date date,
    start_time time, end_time time, status text, source text)
), course_cycle_schedule_assignments AS (SELECT * FROM fixture WHERE source='assignment'),
referred_instructor_schedule_blocks AS (SELECT * FROM fixture WHERE source='block'),
course_cycle_instructors AS (
  SELECT 'cycle'::text cycle_id, unnest(ARRAY['a','b','c']) instructor_id, TRUE active
), course_cycles AS (SELECT 'cycle'::text id, 'group'::text group_id),
instructor_group_members AS (
  SELECT 'group'::text group_id, NULL::text instructor_id, FALSE active, NULL::timestamp ended_at
) `;
function row(enrollment, instructor, source = 'assignment', extra = {}) {
  return { enrollment_id: enrollment, instructor_id: instructor, source,
    cycle_id: 'cycle', schedule_date: '2026-10-14', start_time: '08:00',
    end_time: '09:40', status: 'activo', ...extra };
}
const cases = [
  ['libera el tercer cupo cuando otro instructor tiene dos matriculas',
    [row('one','a'), row('two','b'), row('three','b','block')], 1, 2],
  ['no cuenta dos veces asignacion y bloqueo de la misma matricula',
    [row('one','a'), row('one','a','block')], 1, 1],
  ['tres instructores ocupados siguen llenando los tres cupos',
    [row('one','a'), row('two','b'), row('three','c')], 1, 3],
  ['respeta capacidad mayor a uno por instructor',
    [row('one','a'), row('two','a'), row('three','a')], 2, 2],
  ['mantiene cada cupo pendiente de instructor',
    [row('one',null), row('two',null), row('three','a')], 1, 3],
  ['ignora cancelados y otra fecha',
    [row('one','a','assignment',{status:'cancelado'}),
     row('two','b','block',{schedule_date:'2026-10-15'})], 1, 0],
];
for (const [name, rows, capacity, expected] of cases) {
  test(name, { skip: !enabled }, async () => {
    const result = await db.query(fixtureSql + sql,
      ['cycle','08:00','09:40','2026-10-14',capacity,JSON.stringify(rows)]);
    assert.equal(result.rows[0].occupied, expected);
  });
}
