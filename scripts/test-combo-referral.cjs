const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'}),root=path.resolve(__dirname,'../frontend');
  await page.clock.setFixedTime(new Date('2026-10-28T15:00:00Z'));
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{await route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{await route.abort();}
  });
  await page.route('**/combo-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/combo-test');
  await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   authService.getCurrentUser=()=>({role:'secretaria_sucursal'});authService.can=()=>true;
   const {default:Students}=await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');
   Students.getInstructors=async()=>[];Students.searchReferralStaff=async()=>[];
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   window.view=new View();document.body.innerHTML=await window.view.renderStudentModal();
   if(!document.getElementById('payment-registration-summary'))document.querySelector('form').insertAdjacentHTML('beforeend','<div id="payment-registration-summary"></div>');
   const course=document.querySelector('[name="course_id"]');
   course.innerHTML='<option value="auto" data-price="190" data-catalog-type="carro">Auto</option><option value="moto" data-price="125" data-catalog-type="moto">Moto</option>';
   document.querySelector('#student-referrer-search').value='combo';
   window.view.scheduleReferralStaffSearch('combo',0);
  });
  await page.waitForFunction(()=>window.view.referralStaffResults?.some(item=>item.discount_benefit==='COMBO'));
  await page.evaluate(()=>window.view.selectReferralStaff('benefit:COMBO'));
  assert.equal(await page.inputValue('#student-discount-benefit'),'COMBO');
  assert.equal(await page.locator('#student-combo-size').isDisabled(),false);
  assert((await page.locator('#payment-registration-summary').textContent()).includes('$180.00'));
  await page.evaluate(()=>{document.querySelector('[name="course_id"]').value='moto';window.view.updateRegistrationPaymentSummary();});
  assert((await page.locator('#payment-registration-summary').textContent()).includes('$115.00'));
  await page.locator('#student-combo-size').evaluate(input=>input.value='1');
  assert.equal(await page.locator('#student-combo-size').evaluate(input=>input.checkValidity()),false);
  await page.evaluate(()=>window.view.clearReferralStaff());
  assert(await page.locator('#student-combo-size').isDisabled());
  assert.equal(await page.inputValue('#student-discount-benefit'),'');
  await page.evaluate(()=>{document.querySelector('#student-referrer-search').value='halloween';window.view.scheduleReferralStaffSearch('halloween',0);});
  await page.waitForFunction(()=>window.view.referralStaffResults?.some(item=>item.discount_benefit==='HALLOWEEN'));
  await page.evaluate(()=>window.view.selectReferralStaff('benefit:HALLOWEEN'));
  assert.equal(await page.inputValue('#student-discount-benefit'),'HALLOWEEN');
  assert((await page.locator('#payment-registration-summary').textContent()).includes('$114.99'));
  await page.evaluate(()=>{document.querySelector('[name="course_id"]').value='auto';window.view.updateRegistrationPaymentSummary();});
  assert((await page.locator('#payment-registration-summary').textContent()).includes('$164.99'));
  assert(await page.locator('#student-combo-size').isDisabled());
  await page.clock.setFixedTime(new Date('2026-11-01T05:00:00Z'));
  await page.evaluate(()=>{document.querySelector('#student-referrer-search').value='halloween';window.view.scheduleReferralStaffSearch('halloween',0);});
  await page.waitForFunction(()=>!window.view.referralStaffResults?.some(item=>item.discount_benefit==='HALLOWEEN'));
  const payload=await page.evaluate(async()=>{
   const {default:Students}=await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');
   const {default:api}=await import('/src/js/core/api/apiService.js');
   let received;api.createStudent=async data=>{received=data;return {success:true,data:{id:'test'}};};
   Students.recordHistory=()=>{};
   await Students.createStudent({identification:'0123456789',firstName:'Prueba',lastName:'Combo',discountBenefit:'COMBO',comboSize:3});
   return received;
  });
  assert.equal(payload.discountBenefit,'COMBO');assert.equal(payload.comboSize,3);
  console.log('PASS: buscar Combo, precios auto/moto, minimo dos y quitar promocion. API simulada.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
