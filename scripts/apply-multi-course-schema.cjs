const fs=require('node:fs');
const path=require('node:path');
const db=require('../backend/config/database');
const Audit=require('../backend/services/AuditService');
(async()=>{
  const client=await db.getClient();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('migration:111_multi_course_enrollment'))");
    await client.query(fs.readFileSync(path.join(__dirname,'../backend/migrations/enterprise/111_multi_course_enrollment.sql'),'utf8'));
    const pending=(await client.query(`SELECT COUNT(*)::int count FROM transfer_payment_verifications
      WHERE service_transaction_id IS NULL AND enrollment_id IS NULL AND status IN ('PENDING','AWAITING_APPROVAL')`)).rows[0];
    await Audit.log({action:'SCHEMA_MIGRATION_APPLIED',module:'SISTEMA',entityType:'SYSTEM',
      description:'111: vinculo de transferencias a matricula para cursos independientes',metadata:{migration:111,unlinkedPending:pending.count}},client);
    await client.query('COMMIT');
    console.log(`Migracion 111 aplicada. Transferencias pendientes sin matricula inequivoca: ${pending.count}.`);
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
