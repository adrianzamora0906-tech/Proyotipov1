const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const jwt = require('../backend/node_modules/jsonwebtoken');
const Authorization = require('../backend/services/AuthorizationService');
const {chromium} = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
async function main() {
  const user=(await db.query('SELECT id,username,first_name,last_name,role,branch_id FROM users WHERE id=$1 AND active=TRUE',['5e6fb736-9259-4e9b-ba77-fd4cef720d4e'])).rows[0];
  const authorization=await Authorization.getUserAuthorizationContext(user.id);
  const token=jwt.sign({id:user.id,role:user.role,branch_id:user.branch_id},process.env.JWT_SECRET,{expiresIn:'5m'});
  const session={...user,name:`${user.first_name} ${user.last_name}`,roles:authorization.roles,permissions:authorization.permissions,scope:authorization.scope,apiToken:token,avatar:'AS'};
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    for(const width of [390,1280]) {
      const context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'});
      await context.addInitScript(value=>{sessionStorage.setItem('erp_session',JSON.stringify(value));window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};},session);
      await context.route('**/api/auth/authorization*',async route=>{const response=await route.fetch();const body=await response.json();body.data.mustChangePassword=false;await route.fulfill({response,json:body});});
      // Read a deterministic existing attendance subset; do not create audit events.
      await context.route('**/api/admin/audit?*',async route=>{const url=new URL(route.request().url());url.searchParams.set('action','ATTENDANCE_QR_ENTRY_CONFIRMED');const response=await route.fetch({url:url.href});await route.fulfill({response});});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto('http://localhost:8080/admin-system/audit');
      await page.getByRole('heading',{name:/Auditor/}).waitFor();
      await page.locator('.list-item').first().waitFor();
      const text=await page.locator('.context-workspace').innerText();
      assert.ok(text.includes('Entrada confirmada'));
      assert.ok(text.includes('Alumno:'));
      assert.ok(text.includes('Instructor:'));
      assert.ok(text.includes('Responsable:'));
      await page.evaluate(()=>{window.auditRoot=document.querySelector('.context-workspace');window.auditHeader=document.querySelector('.topbar');window.auditRow=document.querySelector('.list-item');window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['activity']}}));});
      await page.waitForFunction(()=>document.querySelector('.list-item')!==window.auditRow);
      assert.equal(await page.evaluate(()=>document.querySelector('.context-workspace')===window.auditRoot),true);
      assert.equal(await page.evaluate(()=>document.querySelector('.topbar')===window.auditHeader),true);
      assert.deepEqual(errors,[]);
      await page.screenshot({path:`.tmp/attendance-audit-${width}.png`,fullPage:true});
      console.log(`Auditoria ${width}px: asistencia, alumno, instructor y responsable visibles.`);
      await context.close();
    }
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
