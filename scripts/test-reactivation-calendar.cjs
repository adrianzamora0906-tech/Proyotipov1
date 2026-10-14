const assert=require('node:assert/strict');
const db=require('../backend/config/database');
const jwt=require('../backend/node_modules/jsonwebtoken');
const Auth=require('../backend/services/AuthorizationService');
const Edit=require('../backend/services/StudentRecordEditService');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
async function main(){
  const student=(await db.query("SELECT id,status FROM students WHERE first_name ILIKE '%TATIANA%' AND last_name ILIKE '%LOPEZ%DELGADO%' LIMIT 1")).rows[0];
  assert(student,'Estudiante no encontrada');
  const user=(await db.query('SELECT id,username,first_name,last_name,role,branch_id FROM users WHERE id=$1',['e838645a-123c-4615-b72f-dfdd6c03b6da'])).rows[0];
  const auth=await Auth.getUserAuthorizationContext(user.id);
  user.permissions=auth.permissions;
  const data=await Edit.context(student.id,user,{branchId:user.branch_id});
  const destination=(await db.query("SELECT id,city_id FROM branches WHERE code='SP_MC' AND active=TRUE")).rows[0];
  const destinationOptions=await Edit.options(student.id,user,{branchId:user.branch_id},{branch_id:destination.id,course_id:data.enrollments[0].course_id,modality:'normal'});
  assert(destinationOptions.length>0,'Debe consultar horarios al cambiar de canton');
  const deniedActor={role:'instructor',roles:['INSTRUCTOR'],permissions:['STUDENT_CREATE','STUDENT_UPDATE']};
  assert.equal(Edit.canTransferSuspendedStudent({student:{status:'inhabilitado'}},deniedActor),false);
  assert.equal(Edit.canTransferSuspendedStudent({student:{status:'activo'}},user),false);
  console.log('PASS: otro canton permitido para secretaria con permisos; instructor no obtiene acceso global.');
  console.log('Contexto local:',JSON.stringify({status:student.status,enrollments:data.enrollments.length}));
  const token=jwt.sign({id:user.id,role:user.role,branch_id:user.branch_id},process.env.JWT_SECRET,{expiresIn:'3m'});
  const liveResponse=await fetch(`http://localhost:5000/api/students/${student.id}/edit-context`,{headers:{Authorization:`Bearer ${token}`}});
  const live=await liveResponse.json();
  console.log('Contexto del servidor activo:',JSON.stringify({status:liveResponse.status,enrollments:live.data?.enrollments?.length}));
  assert.equal(liveResponse.status,200);
  assert.equal(live.data.enrollments.length,data.enrollments.length);
  const targetResponse=await fetch(`http://localhost:5000/api/students/${student.id}/edit-options?branch_id=${destination.id}&course_id=${data.enrollments[0].course_id}&modality=normal`,{headers:{Authorization:`Bearer ${token}`}});
  assert.equal(targetResponse.status,200,'Servidor activo debe permitir consultar el canton destino');
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await context.addInitScript(session=>{sessionStorage.setItem('erp_session',JSON.stringify(session));window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};},{...user,name:'Anthony Adrian Zamora',roles:auth.roles,permissions:auth.permissions,scope:auth.scope,apiToken:token,avatar:'AZ'});
    await context.route('**/api/auth/authorization*',async route=>{const response=await route.fetch();const body=await response.json();body.data.mustChangePassword=false;await route.fulfill({response,json:body});});
    const page=await context.newPage();page.on('pageerror',error=>console.log('BROWSER ERROR',error.message));
    await page.goto(`http://localhost:8080/students/new?edit=${student.id}`);
    await page.waitForTimeout(5000);
    console.log('UI',await page.locator('#student-modal-form').evaluate(form=>({workflowHidden:form.querySelector('.schedule-workflow')?.hidden,course:form.elements.course_id?.value,courseType:form.elements.course_id?.selectedOptions[0]?.dataset.courseType,calendars:form.querySelectorAll('.enrollment-calendar').length,visibleCalendars:[...form.querySelectorAll('.enrollment-calendar')].filter(el=>el.style.display!=='none').length})));
    await page.screenshot({path:'.tmp/reactivation-calendar.png',fullPage:true});
    await page.locator('.schedule-workflow:visible').waitFor({timeout:5000});
    await page.locator('.enrollment-calendar:visible').first().waitFor({timeout:5000});
    console.log('PASS: calendario de habilitacion visible sin modificar estudiante.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
