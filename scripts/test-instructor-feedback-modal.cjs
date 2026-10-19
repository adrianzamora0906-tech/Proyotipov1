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
  await page.route('**/feedback-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/feedback-test');
  for(const file of ['base/globals','components/components','base/responsive'])await page.addStyleTag({content:await fs.readFile(path.join(root,`src/assets/css/${file}.css`),'utf8')});
  await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');authService.getCurrentUser=()=>({userId:'user',role:'estudiante'});
   const {apiClient}=await import('/src/js/core/api/ApiClient.js');
   window.pendingFeedback=[{id:'change',participant:'student',student_name:'Estudiante Prueba'}];
   apiClient.get=async()=>({success:true,data:window.pendingFeedback});
   apiClient.post=async(url,payload)=>{if(window.failSubmit)throw new Error('Sin conexion');window.sent=payload;window.pendingFeedback=[];return {success:true};};
   window.feedback=(await import('/src/js/services/InstructorChangeFeedback.js')).instructorChangeFeedback;window.feedback.start();
  });
  await page.locator('#feedback-comment').waitFor();
  assert((await page.locator('#feedback-modal-title').textContent()).includes('Cambio de instructor'));
  await page.click('[data-later]');
  await page.evaluate(()=>window.feedback.refresh());
  assert.equal(await page.locator('#instructor-feedback-modal').count(),0);
  await page.click('#instructor-feedback-reminder');
  await page.fill('#feedback-comment','Solicite el cambio por incompatibilidad de horarios.');
  await page.evaluate(()=>{window.failSubmit=true;});
  await page.click('[type="submit"]');
  await page.waitForFunction(()=>document.querySelector('[data-error]')?.textContent==='Sin conexion');
  assert((await page.inputValue('#feedback-comment')).includes('incompatibilidad'));
  await page.evaluate(()=>{window.failSubmit=false;});
  await page.click('[type="submit"]');
  await page.waitForFunction(()=>window.sent&&!document.getElementById('instructor-feedback-modal'));
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(()=>window.feedback.show({id:'teacher-change',participant:'instructor',student_name:'<img src=x onerror=alert(1)>'}));
   assert.equal(await page.locator('#instructor-feedback-modal img').count(),0);
   assert((await page.locator('#feedback-modal-title').textContent()).includes('Seguimiento'));
   assert(await page.locator('#instructor-feedback-modal .modal').evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth;}));
   await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.finished)));
   await page.screenshot({path:`.tmp/instructor-feedback-${width}.png`});
   await page.click('[data-later]');
  }
  console.log('PASS: ambos modales, aplazar, recordatorio, error conserva texto, envio y ajuste 390/1280px. Sin datos reales.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
