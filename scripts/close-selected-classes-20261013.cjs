const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Audit = require('../backend/services/AuditService');
const ids = ['68670251-ec91-49e2-b75c-70f7c1fa28fb','010ac841-6474-4a3d-9c77-5b922877e408','dfc61a1e-4af8-482b-bc3f-db664ca98c75'];
const keepId = 'eccc3f98-eee5-42e8-9936-60da35f8b938';
async function main() {
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const actor = (await client.query('SELECT id,role FROM users WHERE id=$1 AND active=TRUE', ['5e6fb736-9259-4e9b-ba77-fd4cef720d4e'])).rows[0];
    assert(actor, 'Administrador no disponible');
    const rows = (await client.query('SELECT * FROM practical_sessions WHERE id=ANY($1::uuid[]) AND deleted_at IS NULL FOR UPDATE', [[...ids,keepId]])).rows;
    assert.equal(rows.length,4);
    assert.equal(rows.find(row=>row.id===keepId).status,'EN_CURSO');
    const note = 'Cierre administrativo solicitado por el usuario el 13/10/2026. No corresponde a una salida registrada por el instructor. Evaluacion pendiente si no fue registrada.';
    for (const session of rows.filter(row=>ids.includes(row.id))) {
      assert.equal(session.status,'EN_CURSO');
      const updated = (await client.query(`UPDATE practical_sessions SET status='COMPLETADA',actual_end=COALESCE(actual_end,NOW()),
        observations=CONCAT_WS(E'\n',NULLIF(observations,''),$2::text),updated_at=NOW() WHERE id=$1 RETURNING status,actual_end`, [session.id,note])).rows[0];
      await client.query('INSERT INTO history(student_id,action) SELECT student_id,$2 FROM enrollments WHERE id=$1', [session.enrollment_id,note]);
      await Audit.log({userId:actor.id,role:actor.role,branchId:session.branch_id,action:'SESSION_ADMIN_FORCE_COMPLETE',module:'CLASES',entityType:'PRACTICAL_SESSION',entityId:session.id,
        description:note,oldValues:{status:session.status,actualEnd:session.actual_end},newValues:updated,
        metadata:{instructorId:session.instructor_id,administrative:true,studentExitVerified:false}},client);
    }
    const kept = (await client.query('SELECT status,actual_end FROM practical_sessions WHERE id=$1',[keepId])).rows[0];
    assert.equal(kept.status,'EN_CURSO');
    assert.equal(kept.actual_end,rows.find(row=>row.id===keepId).actual_end);
    await client.query('COMMIT');
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally {client.release();}
  console.log(JSON.stringify((await db.query(`SELECT ps.id,ps.status,TRIM(CONCAT(u.first_name,' ',u.last_name)) instructor
    FROM practical_sessions ps JOIN instructor_profiles ip ON ip.id=ps.instructor_id JOIN users u ON u.id=ip.user_id
    WHERE ps.id=ANY($1::uuid[]) ORDER BY u.first_name`, [[...ids,keepId]])).rows));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
