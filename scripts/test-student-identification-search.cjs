const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const source=fs.readFileSync('frontend/src/js/views/students/StudentsView.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default StudentsView;','window.StudentsView=StudentsView;');
 for(const width of [390,1280])for(const status of ['active','reservado']){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.route('http://fixture/**',route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));
  await page.goto(`http://fixture/students?search=1316965159&status=${status}`);
  await page.addScriptTag({content:`
   const student={id:'disabled-id',cedula:'1316965159',firstName:'JORGE MATEO',lastName:'CHIRIBOGA SOLORZANO',status:'inhabilitado',registrationType:'REGULAR',branch:'Flavio',branchId:'branch',createdAt:'2026-10-09'};
   const Component=class {};const SidebarLayout={render:x=>x,attachEventListeners(){}};
   const authService={getCurrentUser:()=>({roles:['BRANCH_ADMIN'],branch_id:'branch',branch:'Flavio'})};
   const StudentService={getAllStudents:async()=>[student],getBranches:async()=>[{id:'branch',name:'Flavio',city_id:'city',city:'Manta',province:'Manabi'}],getActiveReservations:async()=>[],normalizeStudent:x=>x};
   const ApiService={getStudents:async()=>({success:true,data:[student]})};
   const StringHelper={normalizeCedula:x=>x};const DateHelper={format:x=>x||''};
   ${source}
  `});
  await page.evaluate(async()=>{const v=window.view=new StudentsView();v.renderStudentModal=async()=>'';document.getElementById('app').innerHTML=await v.render();});
  assert.equal(await page.locator('[data-student-id="disabled-id"]').count(),1);
  assert((await page.locator('[data-student-id="disabled-id"]').innerText()).includes('Inhabilitado'));
  assert.equal(await page.locator('#create-first-student').count(),0);
  assert.equal(await page.locator('#student-filter-form [name="status"]').inputValue(),'');
  const params=await page.evaluate(()=>view.getStudentListParams({search:'1316965159',status:'reservado',studentScope:'all'}));
  assert.equal(params.status,undefined);assert.equal(params.registration_type,undefined);assert.equal(params.scope,'all');
  await page.screenshot({path:`.tmp/student-identification-${width}-${status}.png`,fullPage:true});
  await page.close();
 }
 console.log('Cedula exacta: expediente inhabilitado visible con filtros activo/reservado, desktop y movil.');
}finally{await browser.close();}})().catch(e=>{console.error(e.message);process.exitCode=1});
