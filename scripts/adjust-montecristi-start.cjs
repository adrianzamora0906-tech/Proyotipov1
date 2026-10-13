const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Audit = require('../backend/services/AuditService');
const Automatic = require('../backend/services/AutomaticCycleService');
const branchId = '14b27e10-7aa3-4f96-9f71-ece9d0b49318';
const actorId = '5e6fb736-9259-4e9b-ba77-fd4cef720d4e';

async function main() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const program = (await client.query('SELECT * FROM branch_course_programs WHERE branch_id=$1 FOR UPDATE', [branchId])).rows[0];
    assert(program && program.vehicle_type === 'carro');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`automatic-course-program:${program.id}`]);
    const cycles = (await client.query('SELECT * FROM course_cycles WHERE branch_id=$1 AND active=TRUE AND deleted_at IS NULL FOR UPDATE', [branchId])).rows;
    assert.equal(cycles.filter(c => c.modality === 'normal').length, 1);
    for (const table of ['course_cycle_schedule_assignments', 'course_cycle_seat_reservations', 'referred_instructor_schedule_blocks']) {
      const count = (await client.query(`SELECT count(*)::int count FROM ${table} WHERE cycle_id=ANY($1::uuid[])`, [cycles.map(c => c.id)])).rows[0].count;
      assert.equal(count, 0, `Hay registros en ${table}; no se modifican fechas`);
    }
    const normal = cycles.find(c => c.modality === 'normal');
    assert.equal(normal.duration_business_days, 8);
    const templates = (await client.query("SELECT DISTINCT day_of_week FROM branch_course_schedule_templates WHERE program_id=$1 AND modality='normal' AND active=TRUE", [program.id])).rows;
    const days = new Set(templates.map(t => Number(t.day_of_week)));
    assert.deepEqual([...days].sort(), [1, 2, 3, 4, 5]);
    await client.query('UPDATE branch_course_programs SET normal_enabled=TRUE,intensive_enabled=FALSE,updated_at=NOW(),updated_by=$2 WHERE id=$1', [program.id, actorId]);
    await client.query("UPDATE course_cycles SET start_date='2026-10-16',end_date='2026-10-27',updated_at=NOW() WHERE id=$1", [normal.id]);
    await client.query("UPDATE instructor_groups SET next_start_date='2026-10-28',updated_at=NOW() WHERE id=$1", [normal.group_id]);
    await client.query("UPDATE course_cycles SET active=FALSE,updated_at=NOW() WHERE branch_id=$1 AND modality='intensivo'", [branchId]);
    await client.query('UPDATE branch_course_intensive_rotation SET active=FALSE WHERE program_id=$1', [program.id]);
    await client.query('UPDATE intensive_instructor_rotation_assignments SET active=FALSE WHERE cycle_id=ANY($1::uuid[])', [cycles.filter(c => c.modality === 'intensivo').map(c => c.id)]);
    await Audit.log({userId:actorId,role:'admin_sistema',branchId,action:'COURSE_CYCLE_UPDATED',module:'HORARIOS',entityType:'COURSE_CYCLE',entityId:normal.id,
      description:'Orlando: solo curso normal desde el 16 de octubre, sin fines de semana, solicitado por el usuario',
      oldValues:{cycles, intensiveEnabled:program.intensive_enabled},newValues:{startDate:'2026-10-16',endDate:'2026-10-27',intensiveEnabled:false}}, client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
  await Automatic.ensureForBranch(branchId, actorId);
  const result = (await db.query('SELECT code,modality,start_date::text,end_date::text,active FROM course_cycles WHERE branch_id=$1 ORDER BY code', [branchId])).rows;
  assert.equal(result.filter(c => c.active).length, 1);
  assert.equal(result.find(c => c.active).start_date, '2026-10-16');
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.pool.end());
