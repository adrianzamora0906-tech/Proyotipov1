const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  const root=path.resolve(__dirname,'../frontend');
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}
  });
  await page.route('**/practice-birth-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/practice-birth-test');
  const result=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   authService.getCurrentUser=()=>({role:'secretaria_sucursal'});authService.can=()=>false;
   const {default:Students}=await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');
   Students.getInstructors=async()=>[];
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const view=new View();document.body.innerHTML=await view.renderStudentModal();
   view.prepareScheduleFirstLayout();
   const input=document.querySelector('[name="birthDate"]');input.value='2000-05-05';
   await view.setRegistrationMode('additional-practice');
   const removed=input.disabled&&!input.required&&input.closest('.form-row').hidden&&!new FormData(document.querySelector('form')).has('birthDate');
   view.additionalPracticeResolved=true;
   let checked=false;
   Students.checkAdditionalPracticeAvailability=async()=>{checked=true;return {success:false};};
   view.showModalAlert=()=>{};view.goToModalStep=()=>{};view.checkAdditionalPracticeAvailability=async()=>{};
   const data=new FormData();
   data.set('additionalPracticeInstructor','test');data.set('additionalPracticeStartDate','2026-10-19');
   data.set('additionalPracticeTime','08:00');data.set('additionalPracticeDays','3');
   await view.handleAdditionalPracticeSubmit(document.querySelector('form'),data,null);
   const optionalDocument=checked;
   checked=false;data.set('additionalPracticeDocumentsFile',new File(['invalid'],'file.txt',{type:'text/plain'}));
   await view.handleAdditionalPracticeSubmit(document.querySelector('form'),data,null);
   const invalidDocumentBlocked=!checked;
   await view.setRegistrationMode('regular');
   return {removed,optionalDocument,invalidDocumentBlocked,restored:!input.disabled&&input.required&&!input.closest('.form-row').hidden&&input.value==='2000-05-05'};
  });
  assert(result.removed);assert(result.restored);
  assert(result.optionalDocument);assert(result.invalidDocumentBlocked);
  console.log('PASS: practicas sin nacimiento; curso normal conserva campo, validacion y valor.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
