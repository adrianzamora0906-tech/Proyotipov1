const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'}),root=path.resolve(__dirname,'../frontend');
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}
  });
  await page.route('**/pending-edit-test',route=>route.fulfill({contentType:'text/html',body:'<div id="profile-action-modal" class="active"></div>'}));
  await page.goto('http://localhost:8080/pending-edit-test');
  for(const file of ['base/globals','components/components','pages/students','pages/student-profile','pages/schedule','base/responsive'])await page.addStyleTag({content:await fs.readFile(path.join(root,`src/assets/css/${file}.css`),'utf8')});
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/student-profile/StudentProfileView.js');
   const {default:api}=await import('/src/js/core/api/apiService.js');
   api.getStudentScheduleChangeOptions=async(id,instructor)=>({success:true,data:{id:'cycle',vehicleType:'moto',startDate:'2099-06-01',endDate:'2099-06-05',selectedInstructorId:instructor||'old',instructor:{id:instructor||'old',name:'Instructor'},instructors:[{id:'old',name:'Anterior'},{id:'new',name:'Nuevo'}],currentAssignments:[{id:'pending',date:'2099-06-01',startTime:'08:00',endTime:'09:40',instructorId:'old',canMove:true},{id:'completed',date:'2099-06-02',startTime:'08:00',endTime:'09:40',instructorId:'old',canMove:false}],slots:[{startTime:'08:00',endTime:'09:40',occupancyByDate:{'2099-06-01':{available:1},'2099-06-02':{available:1}}}]}});
   api.changeStudentScheduleDay=async payload=>{window.savedChange=payload;return {success:true};};
   const view=new View();view.closeProfileModal=()=>{};window.pendingView=view;
   await view.openCourseCycleScheduleModal('student',document.getElementById('profile-action-modal'));
   const original=api.getStudentScheduleChangeOptions;
   api.getStudentScheduleChangeOptions=async(...args)=>{const r=await original(...args);r.data.slots.push({startTime:'10:00',endTime:'11:40',occupancyByDate:{'2099-06-01':{available:0},'2099-06-02':{available:0}}});return r;};
  });
  assert.equal(await page.locator('.profile-current-practices').count(),1);
  await page.fill('#profile-schedule-observation','Cambio solicitado por estudiante');
  await page.selectOption('#pending-class-instructor','new');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('[data-date="2099-06-01"]').dataset.schedule).changingInstructor);
  assert.equal(await page.locator('.profile-pending-calendar article').count(),1);
  assert(!(await page.locator('.profile-current-practices').textContent()).includes('02/06/2099'));
  assert.equal(await page.inputValue('#profile-schedule-observation'),'Cambio solicitado por estudiante');
  assert.equal(await page.locator('[data-time="10:00 - 11:40"]').count(),2);
  assert(await page.locator('[data-time="10:00 - 11:40"]').first().isDisabled());
  assert((await page.locator('[data-time="10:00 - 11:40"]').first().textContent()).includes('Ocupado / bloqueado'));
  await page.click('[data-date="2099-06-01"][data-time="08:00 - 09:40"]');
  await page.click('[data-date="2099-06-02"][data-time="08:00 - 09:40"]');
  assert.equal(await page.locator('.schedule-option.selected').count(),1);
  assert((await page.locator('#profile-schedule-error').textContent()).includes('Solo faltan 1'));
  await page.fill('#profile-schedule-observation','Cambio solicitado por estudiante');
  await page.click('#confirm-profile-schedule');
  await page.waitForFunction(()=>window.savedChange);
  const saved=await page.evaluate(()=>window.savedChange);
  assert.equal(saved.instructorId,'new');assert.equal(saved.changes.length,1);assert.equal(saved.changes[0].assignmentId,'pending');
  assert.equal(saved.replaceAllPending,true);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:1000});
   await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{}))));
   await page.screenshot({path:`.tmp/pending-class-two-sections-${width}.png`});
  }
  await page.evaluate(async()=>{
   const {default:api}=await import('/src/js/core/api/apiService.js');
   const original=api.getStudentScheduleChangeOptions;
   api.getStudentScheduleChangeOptions=async(...args)=>{const r=await original(...args);r.data.currentAssignments.push({id:'second-pending',date:'2099-06-02',startTime:'12:00',endTime:'13:40',instructorId:'old',canMove:true});return r;};
   window.savedChange=null;
   await window.pendingView.openCourseCycleScheduleModal('student',document.getElementById('profile-action-modal'),'new');
  });
  await page.click('[data-date="2099-06-01"][data-time="08:00 - 09:40"]');
  await page.click('#confirm-profile-schedule');
  assert((await page.locator('#profile-schedule-error').textContent()).includes('exactamente 2'));
  assert.equal(await page.evaluate(()=>window.savedChange),null);
  await page.click('[data-date="2099-06-02"][data-time="08:00 - 09:40"]');
  await page.click('#confirm-profile-schedule');
  await page.waitForFunction(()=>window.savedChange);
  const batch=await page.evaluate(()=>window.savedChange);
  assert.deepEqual(batch.changes.map(c=>c.assignmentId),['pending','second-pending']);
  console.log('PASS: solo pendientes, cantidad exacta, traslado completo de dos clases y cupos bloqueados. API simulada.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
