const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'../frontend'),page=await browser.newPage({serviceWorkers:'block'});
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{await route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{await route.abort();}
  });
  await page.route('**/atm-test',route=>route.fulfill({contentType:'text/html',body:'<form id="atm-office-form"><select name="branchId"><option value="branch">Sucursal</option></select><div id="fields"></div><button type="submit">Generar Word</button></form>'}));
  await page.goto('http://localhost:8080/atm-test');
  for(const css of ['base/globals','components/components','pages/atm-authorizations'])await page.addStyleTag({content:await fs.readFile(path.join(root,`src/assets/css/${css}.css`),'utf8')});
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/admin/AtmAuthorizationView.js');
   const {default:Admin}=await import('/src/js/services/AdminService.js');
   Admin.permitCourseOptions=async filters=>{window.lastFilters=filters;return {data:{studentCount:filters.courseType==='AUTO'?0:2}};};
   window.atmView=new View();document.querySelector('#fields').innerHTML=window.atmView.permitFields();
   window.atmView.bindPermitCourseSelection();await window.atmView.loadPermitCourses();
  });
  assert.equal(await page.locator('#atm-permit-cycle').count(),0);
  assert(!(await page.locator('#atm-permit-course-start').getAttribute('readonly')));
  await page.fill('#atm-permit-course-start','2026-10-01');await page.locator('#atm-permit-course-start').dispatchEvent('change');
  await page.fill('#atm-permit-course-end','2026-10-20');await page.locator('#atm-permit-course-end').dispatchEvent('change');
  await page.waitForFunction(()=>document.querySelector('#atm-permit-student-count').value==='2');
  assert(await page.locator('[type="submit"]').isEnabled());
  assert.deepEqual(await page.evaluate(()=>window.lastFilters),{branchId:'branch',courseType:'MOTO',courseStart:'2026-10-01',courseEnd:'2026-10-20'});
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:950});
   assert(await page.locator('#atm-permit-course-end').isVisible());
   await page.screenshot({path:`.tmp/atm-permit-dates-${width}.png`});
  }
  await page.selectOption('#atm-permit-course-type','AUTO');
  await page.waitForFunction(()=>document.querySelector('#atm-permit-student-count').value==='0');
  assert(await page.locator('[type="submit"]').isDisabled());
  assert(await page.locator('#atm-download-permit-excel').isDisabled());
  console.log('PASS: filtros de matricula, sin ciclos, contador dinamico y cero resultados bloquea generacion. API simulada.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
