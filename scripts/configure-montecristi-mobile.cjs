const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../backend/config/database');
const Audit = require('../backend/services/AuditService');
const Authorization = require('../backend/services/AuthorizationService');
const AutomaticCycles = require('../backend/services/AutomaticCycleService');

async function configure() {
  const client = await db.getClient();
  let branchId;
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('configure-montecristi-mobile'))");
    const actor = (await client.query("SELECT id,role FROM users WHERE username='admin.system' AND active=TRUE")).rows[0];
    const user = (await client.query(`SELECT id,role,branch_id,first_name,last_name FROM users
      WHERE id=$1 AND active=TRUE FOR UPDATE`, ['a95f78be-fff6-4af7-bd7b-1b3904854afb'])).rows[0];
    if (!actor || !user || user.role !== 'instructor' || user.first_name !== 'Jose Orlando' || user.last_name !== 'Hidalgo Meza') {
      throw new Error('No se pudo verificar al instructor o al administrador');
    }
    const migrationName = '109_branch_pickup_optional.sql';
    const sql = fs.readFileSync(path.join(__dirname, '../backend/migrations/enterprise', migrationName), 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['sportmancar_schema_migrations']);
    await client.query(sql);
    await client.query(`INSERT INTO schema_migrations(migration_name,checksum) VALUES($1,$2)
      ON CONFLICT(migration_name) DO NOTHING`, [migrationName, checksum]);
    const city = (await client.query("SELECT id FROM cities WHERE LOWER(name)='montecristi' AND LOWER(province) LIKE 'manab%' LIMIT 1")).rows[0];
    if (!city) throw new Error('Montecristi no existe en el catalogo de cantones');
    let branch = (await client.query("SELECT * FROM branches WHERE code='SP_MC' FOR UPDATE")).rows[0];
    if (branch && String(branch.city_id) !== String(city.id)) throw new Error('El codigo SP_MC pertenece a otro canton');
    const createdBranch = !branch;
    if (!branch) branch = (await client.query(`INSERT INTO branches(code,name,province,city,city_id,active,pickup_enabled)
      VALUES('SP_MC','Sportmancar Montecristi','Manabí','Montecristi',$1,TRUE,FALSE) RETURNING *`, [city.id])).rows[0];
    branchId = branch.id;
    await client.query('UPDATE branches SET pickup_enabled=FALSE,updated_at=NOW() WHERE id=$1', [branchId]);
    const source = (await client.query(`SELECT p.* FROM branch_course_programs p JOIN courses c ON c.id=p.course_id
      WHERE p.branch_id=$1 AND p.vehicle_type='carro' AND c.active=TRUE AND c.price=190`, ['20857100-415d-4072-94cb-7ad8635d9dc3'])).rows;
    if (source.length !== 1) throw new Error('No se pudo verificar el programa de carro de $190');
    const base = source[0];
    await client.query(`UPDATE users SET branch_id=$2,city='Montecristi',updated_at=NOW() WHERE id=$1`, [user.id, branchId]);
    await client.query(`UPDATE user_roles SET branch_id=$2 WHERE user_id=$1 AND active=TRUE
      AND role_id IN (SELECT id FROM roles WHERE scope_type='BRANCH')`, [user.id, branchId]);
    const instructor = (await client.query(`INSERT INTO instructor_profiles(user_id,instructor_type,practice_area,weekend_practice_area,status,notes)
      VALUES($1,'practico','carro','carro','activo','Operacion movil Montecristi, solo carro, sin oficina ni recogida')
      ON CONFLICT(user_id) DO UPDATE SET practice_area='carro',weekend_practice_area='carro',status='activo',deleted_at=NULL,updated_at=NOW()
      RETURNING id`, [user.id])).rows[0];
    await client.query(`INSERT INTO instructor_course_capabilities(instructor_id,course_id,active) VALUES($1,$2,TRUE)
      ON CONFLICT(instructor_id,course_id) DO UPDATE SET active=TRUE`, [instructor.id, base.course_id]);
    await client.query(`INSERT INTO branch_courses(branch_id,course_id,active,created_by) VALUES($1,$2,TRUE,$3)
      ON CONFLICT(branch_id,course_id) DO UPDATE SET active=TRUE`, [branchId, base.course_id, actor.id]);
    const program = (await client.query(`INSERT INTO branch_course_programs(branch_id,course_id,vehicle_type,
      duration_days,normal_duration_days,intensive_duration_days,session_minutes,capacity_per_instructor,
      normal_enabled,intensive_enabled,assignment_mode,automatic_cycles,normal_start_days,intensive_start_days,updated_by)
      VALUES($1,$2,'carro',$3,$4,$5,$6,1,$7,$8,'groups',TRUE,$9,$10,$11)
      ON CONFLICT(branch_id,course_id) DO UPDATE SET updated_by=EXCLUDED.updated_by RETURNING id`,
      [branchId,base.course_id,base.duration_days,base.normal_duration_days,base.intensive_duration_days,
        base.session_minutes,true,false,base.normal_start_days,base.intensive_start_days,actor.id])).rows[0];
    await client.query(`INSERT INTO branch_course_schedule_templates(program_id,modality,day_of_week,start_time,end_time,active)
      SELECT $1,t.modality,t.day_of_week,t.start_time,t.end_time,TRUE FROM branch_course_schedule_templates t
      WHERE t.program_id=$2 AND t.active=TRUE AND NOT EXISTS(SELECT 1 FROM branch_course_schedule_templates own
        WHERE own.program_id=$1 AND own.modality=t.modality AND own.day_of_week=t.day_of_week
          AND own.start_time=t.start_time AND own.end_time=t.end_time)`, [program.id,base.id]);
    const group = (await client.query(`INSERT INTO instructor_groups(branch_id,code,name,course_vehicle_type,max_instructors,program_id,next_start_date)
      VALUES($1,'CARRO-G1','Orlando - Montecristi','carro',1,$2,'2026-10-16'::date)
      ON CONFLICT(branch_id,code) DO UPDATE SET active=TRUE RETURNING id`, [branchId,program.id])).rows[0];
    await client.query(`INSERT INTO instructor_group_members(group_id,instructor_id,position_order,active) VALUES($1,$2,1,TRUE)
      ON CONFLICT(group_id,instructor_id) DO UPDATE SET active=TRUE,ended_at=NULL`, [group.id,instructor.id]);
    await client.query(`INSERT INTO instructor_availability(instructor_id,weekday,start_time,end_time,active)
      SELECT DISTINCT $1::uuid,day_of_week,start_time,end_time,TRUE
      FROM branch_course_schedule_templates WHERE program_id=$2 AND active=TRUE AND modality='normal' AND day_of_week BETWEEN 1 AND 5
      ON CONFLICT(instructor_id,weekday,start_time,end_time) DO UPDATE SET active=TRUE,updated_at=NOW()`, [instructor.id,program.id]);
    await client.query(`UPDATE branch_course_intensive_rotation SET active=FALSE
      WHERE program_id=$1 AND instructor_id=$2`, [program.id,instructor.id]);
    await client.query(`INSERT INTO branch_payment_methods(branch_id,payment_method_id,active,requires_reference,updated_by)
      SELECT $1,payment_method_id,active,requires_reference,$3 FROM branch_payment_methods WHERE branch_id=$2
      ON CONFLICT(branch_id,payment_method_id) DO NOTHING`, [branchId,base.branch_id,actor.id]);
    const codes = ['STUDENT_CREATE','STUDENT_UPDATE','PAYMENT_VIEW','PAYMENT_CREATE','RECEIPT_VIEW','RECEIPT_GENERATE','SCHEDULE_CHANGE'];
    for (const code of codes) {
      const permission = (await client.query('SELECT id FROM permissions WHERE code=$1 AND active=TRUE', [code])).rows[0];
      if (!permission) throw new Error(`Permiso no encontrado: ${code}`);
      await client.query(`INSERT INTO user_permissions(user_id,permission_id,effect,branch_id,reason,granted_by)
        SELECT $1,$2,'ALLOW',$3,'Operacion movil Montecristi autorizada por el usuario',$4
        WHERE NOT EXISTS(SELECT 1 FROM user_permissions WHERE user_id=$1 AND permission_id=$2 AND branch_id=$3 AND revoked_at IS NULL AND effect='ALLOW')`,
      [user.id,permission.id,branchId,actor.id]);
    }
    await client.query(`UPDATE user_sessions SET revoked_at=NOW(),revocation_reason='Cambio autorizado de sucursal y permisos'
      WHERE user_id=$1 AND revoked_at IS NULL`, [user.id]);
    const authorization = await Authorization.getUserAuthorizationContext(user.id,branchId,client);
    if (!authorization || authorization.global || !codes.every(code=>authorization.permissions.includes(code))) throw new Error('Los permisos efectivos no coinciden');
    await Audit.log({userId:actor.id,role:actor.role,branchId,action:createdBranch?'BRANCH_CREATED':'BRANCH_UPDATED',module:'SUCURSALES',entityType:'BRANCH',entityId:branchId,
      description:'Operacion movil Montecristi configurada para Orlando',metadata:{instructorId:instructor.id,userId:user.id,courseId:base.course_id,pickupEnabled:false}},client);
    await Audit.log({userId:actor.id,role:actor.role,branchId,action:'USER_PERMISSIONS_UPDATED',module:'PERMISOS',entityType:'USER',entityId:user.id,
      description:'Orlando puede registrar y cobrar exclusivamente en Montecristi',oldValues:{branchId:user.branch_id},newValues:{branchId,permissions:authorization.permissions}},client);
    await client.query('COMMIT');
    console.log(JSON.stringify({branch:branch.name,branchId,instructorId:instructor.id,permissions:authorization.permissions,price:190,pickupEnabled:false}));
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  await AutomaticCycles.ensureForBranch(branchId, '5e6fb736-9259-4e9b-ba77-fd4cef720d4e', {vehicleType:'carro'});
}
configure().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
