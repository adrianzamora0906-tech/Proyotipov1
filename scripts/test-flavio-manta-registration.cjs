const assert=require('node:assert/strict');
const db=require('../backend/config/database');
const jwt=require('../backend/node_modules/jsonwebtoken');
const Auth=require('../backend/services/AuthorizationService');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
async function main(){
  const user=(await db.query('SELECT id,username,first_name,last_name,role,branch_id FROM users WHERE id=$1',['e838645a-123c-4615-b72f-dfdd6c03b6da'])).rows[0];
  const auth=await Auth.getUserAuthorizationContext(user.id);
  assert(auth.permissions.includes('STUDENT_CREATE'));
  const token=jwt.sign({id:user.id,role:user.role,branch_id:user.branch_id},process.env.JWT_SECRET,{expiresIn:'3m'});
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
    await context.addInitScript(session=>{sessionStorage.setItem('erp_session',JSON.stringify(session));window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};},{...user,name:'Anthony Adrian Zamora',roles:auth.roles,permissions:auth.permissions,scope:auth.scope,apiToken:token,avatar:'AZ'});
    await context.route('**/api/auth/authorization*',async route=>{const response=await route.fetch();const body=await response.json();body.data.mustChangePassword=false;await route.fulfill({response,json:body});});
    const page=await context.newPage();page.on('pageerror',error=>console.log('BROWSER ERROR',error.message));
    await page.goto('http://localhost:8080/students/new');
    await page.waitForFunction(()=>document.getElementById('student-modal-form')?.dataset.initializing==='false');
    await page.locator('#change-registration-branch').click();
    const branch=page.locator('#student-modal-form [name="branch"]');
    await branch.selectOption({label:'Manta 2000'});
    await page.waitForFunction(()=>document.getElementById('modal-course-select')?.inert===false);
    const courseId='5f9bb8ee-30c8-4b88-9904-5bfbd3ed567b';
    await page.locator(`#modal-course-select option[value="${courseId}"]`).waitFor({state:'attached'});
    await page.locator('#modal-course-select').selectOption(courseId);
    await page.locator('.enrollment-calendar:visible .course-instructor-chip').filter({hasText:'Benito Alonzo'}).first().waitFor({timeout:12000}).catch(async error=>{
      console.log('DEBUG',await page.locator('#student-modal-form').innerText());
      await page.screenshot({path:'.tmp/flavio-manta-registration-error.png',fullPage:true});throw error;
    });
    assert.equal(await branch.evaluate(el=>el.selectedOptions[0].dataset.branchId),'1d38db7a-1196-4db8-a69c-48657c00d2bc');
    assert.equal(await page.locator('#registration-session-branch-name').innerText(),'Manta 2000');
    await page.screenshot({path:'.tmp/flavio-manta-registration.png',fullPage:true});
    console.log('PASS: secretaria de Flavio selecciona Manta 2000 y ve curso/horario de Benito; resumen correcto. Sin crear alumnos ni pagos.');
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
