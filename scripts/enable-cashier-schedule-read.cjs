const fs=require('node:fs');
const path=require('node:path');
const db=require('../backend/config/database');
const Audit=require('../backend/services/AuditService');
const Auth=require('../backend/services/AuthorizationService');
async function main(){
  const client=await db.getClient();
  try{
    await client.query('BEGIN');
    const role=(await client.query("SELECT id FROM roles WHERE code='CASHIER' AND active=TRUE FOR UPDATE")).rows[0];
    if(!role) throw new Error('Rol Caja no disponible');
    const sql=fs.readFileSync(path.join(__dirname,'../backend/migrations/enterprise/110_cashier_schedule_read.sql'),'utf8');
    const result=await client.query(sql);
    if(result.rowCount) await Audit.log({action:'ROLE_PERMISSION_GRANTED',module:'SEGURIDAD',entityType:'ROLE',entityId:role.id,
      description:'Consulta de horarios habilitada para Caja por solicitud explicita del usuario',
      metadata:{roleCode:'CASHIER',permission:'SCHEDULE_VIEW',source:'administrative_maintenance',writePermissionsUnchanged:true}},client);
    const verified=(await client.query(`SELECT p.code FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=$1 AND p.code IN ('SCHEDULE_VIEW','SCHEDULE_CHANGE','INSTRUCTOR_ASSIGN')`,[role.id])).rows;
    if(!verified.some(p=>p.code==='SCHEDULE_VIEW'))throw new Error('No se habilito lectura');
    if(verified.some(p=>p.code!=='SCHEDULE_VIEW'))throw new Error('El rol base contiene permisos de escritura inesperados');
    await client.query('COMMIT');
    console.log('Permiso base Caja: SCHEDULE_VIEW; sin permisos base de edicion.');
    const user=(await db.query("SELECT id FROM users WHERE username='caja.sucursalcent' AND active=TRUE")).rows[0];
    if(user){const auth=await Auth.getUserAuthorizationContext(user.id);console.log(JSON.stringify({view:auth.permissions.includes('SCHEDULE_VIEW'),edit:auth.permissions.includes('SCHEDULE_CHANGE'),assign:auth.permissions.includes('INSTRUCTOR_ASSIGN')}));}
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
