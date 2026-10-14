const assert = require('assert/strict');
const db = require('../backend/config/database');
const jwt = require('../backend/node_modules/jsonwebtoken');
const Authorization = require('../backend/services/AuthorizationService');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

async function test() {
  const user = (await db.query(`SELECT u.id,u.username,u.first_name,u.last_name,u.role,u.branch_id,b.name branch
    FROM users u JOIN branches b ON b.id=u.branch_id WHERE u.id=$1`, ['a95f78be-fff6-4af7-bd7b-1b3904854afb'])).rows[0];
  const auth = await Authorization.getUserAuthorizationContext(user.id);
  assert.equal(auth.global,false);
  for (const denied of ['BRANCH_MANAGE','PERMISSION_MANAGE','PAYMENT_VOID','TRANSFER_APPROVE','TRANSFER_VERIFY']) assert.ok(!auth.permissions.includes(denied));
  const token = jwt.sign({id:user.id,role:user.role,branch_id:user.branch_id},process.env.JWT_SECRET,{expiresIn:'5m'});
  const session = {userId:user.id,username:user.username,name:`${user.first_name} ${user.last_name}`,role:user.role,
    branch_id:user.branch_id,branch:user.branch,roles:auth.roles,permissions:auth.permissions,scope:auth.scope,practiceArea:'carro',apiToken:token,avatar:'JH'};
  const api = async (endpoint,body) => {
    const response = await fetch(`http://localhost:5000/api${endpoint}`, {headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
      ...(body ? {method:'POST',body:JSON.stringify(body)} : {})});
    return {status:response.status,body:await response.json()};
  };
  assert.equal((await api('/instructor/dashboard')).status,200);
  const branches = await api('/students/branches/all');
  assert.equal(branches.body.data.find(branch=>branch.id===user.branch_id).pickup_enabled,false);
  const options = await api(`/course-cycles/enrollment-options?branch_id=${user.branch_id}&vehicle_type=carro&modality=normal`);
  assert.equal(options.status,200);
  assert.equal((await api('/students?scope=all&branch_id=20857100-415d-4072-94cb-7ad8635d9dc3')).body.data.length,0);
  const forbiddenStudent = 'cb17c452-98e3-4ae8-97d4-a4d159668e05';
  assert.equal((await api(`/students/${forbiddenStudent}`)).status,404);
  assert.equal((await api(`/students/${forbiddenStudent}/payments`)).status,404);
  assert.equal((await api('/receipts')).body.data.length,0);
  assert.equal((await api('/payments/register',{cedula:'1314246206',amount:1,method:'efectivo'})).status,403);
  assert.equal((await api('/students',{identification:'1314246206',firstName:'No crear',lastName:'Prueba',branch_id:'20857100-415d-4072-94cb-7ad8635d9dc3'})).status,403);
  console.log('API: agenda, curso, sin recogida y aislamiento por sucursal verificados; sin crear alumnos ni pagos.');
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    for (const width of [390,1280]) {
      const context = await browser.newContext({viewport:{width,height:844},serviceWorkers:'block'});
      // Simulate the state after the required password change without changing the real account.
      await context.route('**/api/auth/authorization*',async route=>{
        const response=await route.fetch();const body=await response.json();
        body.data.mustChangePassword=false;await route.fulfill({response,json:body});
      });
      await context.addInitScript(session=>{sessionStorage.setItem('erp_session',JSON.stringify(session));window.__SPORTMANCAR_CONFIG__={API_BASE_URL:'http://localhost:5000/api'};},session);
      const page = await context.newPage();
      page.on('pageerror',error=>console.log('Error navegador: '+error.message));
      await page.goto('http://localhost:8080/instructor');
      await page.locator('.mobile-operation-actions a[href="/students/new"]').waitFor({timeout:12000}).catch(async error=>{
        console.log('Pantalla: '+(await page.locator('body').innerText()).slice(0,1200));
        await page.screenshot({path:'.tmp/montecristi-error.png'});throw error;
      });
      await page.waitForTimeout(500);
      await page.evaluate(()=>{window.instructorRoot=document.querySelector('.instructor-page.dashboard');window.instructorHeader=document.querySelector('.topbar');});
      const refreshResponse=page.waitForResponse(response=>response.url().includes('/instructor/dashboard')&&response.status()===200,{timeout:5000});
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['schedules']}})));
      await refreshResponse;
      assert.equal(await page.evaluate(()=>document.querySelector('.instructor-page.dashboard')===window.instructorRoot),true);
      assert.equal(await page.evaluate(()=>document.querySelector('.topbar')===window.instructorHeader),true);
      assert.equal(await page.locator('.sidebar-nav a').count(),6); // five actions plus profile
      if(width===390) {
        const bounds=await page.locator('.sidebar-nav').boundingBox();assert.ok(bounds.width<=390);
        assert.equal(await page.locator('.sidebar-nav svg:visible').count(),5);
      }
      await page.screenshot({path:`.tmp/montecristi-home-${width}.png`,fullPage:true});
      await page.locator('.mobile-operation-actions a[href="/students/new"]').click();
      await page.locator('#modal-course-select option[data-course-type="carro"]').waitFor({state:'attached'});
      await page.waitForTimeout(600);
      assert.equal(await page.locator('.student-modal-step-tab[data-step="4"]').count(),1,'El registro debe incluir el paso Pago');
      assert.equal(await page.locator('#student-pickup-branch-field').isVisible(),false);
      assert.equal(await page.locator('#student-pickup-branch').isDisabled(),true);
      assert.equal(await page.locator('#change-registration-branch').isVisible(),false);
      await page.locator('#modal-course-select').selectOption('5f4cc86d-faa0-4261-812b-86fe1ef48d41');
      await page.locator('#student-schedule-calendar').getByText('Jose Orlando Hidalgo Meza',{exact:false}).first().waitFor();
      await page.screenshot({path:`.tmp/montecristi-register-${width}.png`,fullPage:true});
      if(width===390) {
        const calendar = page.locator('.enrollment-calendar:visible').first();
        await calendar.scrollIntoViewIfNeeded();
        assert.equal(await calendar.locator('.enrollment-calendar-grid').isVisible(),false);
        await calendar.locator('.mobile-time-option').first().click();
        assert.equal(await calendar.locator('.mobile-time-option[aria-pressed="true"]').count(),1);
        assert.ok(await calendar.locator('.schedule-option.selected').count() > 0);
        await page.screenshot({path:'.tmp/montecristi-compact-mobile.png'});
        await calendar.locator('[data-instructor-availability-toggle]').click();
        await page.waitForTimeout(600);
        const fullCalendar = page.locator('.enrollment-calendar:visible').first();
        assert.equal(await fullCalendar.locator('.enrollment-calendar-heading[data-day-index]:visible').count(),2);
        const slot = fullCalendar.locator('.schedule-option:visible').first();
        assert.ok((await slot.boundingBox()).height >= 60);
        await slot.click();
        assert.ok(await fullCalendar.locator('.schedule-option.selected').count() > 0);
        await fullCalendar.locator('.calendar-window-btn[data-direction="1"]').click();
        assert.equal(await fullCalendar.getAttribute('data-day-window-start'),'2');
        await fullCalendar.locator('.calendar-window-btn[data-direction="-1"]').click();
        assert.equal(await fullCalendar.getAttribute('data-day-window-start'),'0');
        await page.screenshot({path:'.tmp/montecristi-calendar-mobile.png'});
        const paymentTab=await page.locator('.student-modal-step-tab[data-step="4"]').boundingBox();
        assert.ok(paymentTab.x+paymentTab.width<=390,'Los cuatro pasos deben caber en el telefono');
        let captureTokenRequests=0;
        await context.route('**/api/documents/mobile-upload-token',route=>{captureTokenRequests++;return route.abort();});
        const pagesBefore=context.pages().length;
        const scheduleBefore=await page.locator('[name="schedulePlan"]').inputValue();
        await page.locator('#mobile-registration-package-capture').evaluate(button => button.click());
        const capture = page.locator('.mobile-registration-capture-overlay');
        await capture.locator('[data-gallery-file="front"]').waitFor();
        assert.equal(await capture.locator('[capture]').count(),0);
        assert.equal(await capture.locator('.mobile-capture-qr').count(),0);
        assert.ok(!(await capture.innerText()).includes('Escanea'));
        await capture.locator('[data-gallery-save]').click();
        assert.ok((await capture.locator('[data-gallery-error]').innerText()).includes('frente y reverso'));
        const photo=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=380;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,600,380);ctx.fillStyle='black';ctx.fillText('DOCUMENTO DE PRUEBA',50,50);return canvas.toDataURL('image/png').split(',')[1];});
        for(const key of ['front','back','blood']) await capture.locator(`[data-gallery-file="${key}"]`).setInputFiles({name:`${key}.png`,mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
        await page.screenshot({path:'.tmp/montecristi-documents-mobile.png'});
        await capture.locator('[data-gallery-save]').click();
        await capture.waitFor({state:'detached'});
        const dataUrl=await page.locator('[name="registrationDocumentsMobileFileUrl"]').inputValue();
        assert.ok(dataUrl.startsWith('data:application/pdf;base64,'));
        const {PDFDocument}=require('../backend/node_modules/pdf-lib');
        const pdf=await PDFDocument.load(Buffer.from(dataUrl.split(',')[1],'base64'));
        assert.equal(pdf.getPageCount(),1);
        assert.equal(pdf.getPage(0).getWidth(),595);
        assert.equal(await page.locator('[name="registrationDocumentsMobileIncludesBloodCard"]').inputValue(),'true');
        assert.equal(await page.locator('[name="schedulePlan"]').inputValue(),scheduleBefore);
        assert.equal(context.pages().length,pagesBefore);
        assert.equal(captureTokenRequests,0,'La galeria no depende de un token ni receptor QR');
      }
      await page.goto('http://localhost:8080/cash');
      await page.locator('.cash-open-charge').first().waitFor();
      await page.screenshot({path:`.tmp/montecristi-cash-${width}.png`,fullPage:true});
      console.log(`Interfaz ${width}px: registro accesible, curso carro y horario de Orlando, recogida oculta.`);
      await context.close();
    }
  } finally {await browser.close();}
}
test().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.pool.end());
