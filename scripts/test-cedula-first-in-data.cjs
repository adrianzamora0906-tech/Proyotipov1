const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/cedula-in-data-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/cedula-in-data-test');
  const result=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   authService.getCurrentUser=()=>({role:'secretaria_sucursal',permissions:[]});authService.can=()=>false;
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const view=new View();document.body.innerHTML=await view.renderStudentModal();
   view.prepareScheduleFirstLayout();view.goToModalStep(1);
   const scheduleFirst=view.getCurrentModalStep()===1;
   view.goToModalStep(2);
   const data=document.querySelector('.student-modal-step[data-step="2"]');
   const fields=[...data.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea')];
   const first=fields[0]?.name==='cedula';
   const count=document.querySelectorAll('[name="cedula"]').length===1;
   const noExtraStep=!document.querySelector('.student-modal-step[data-step="0"]');
   const tabs=[...document.querySelectorAll('.student-modal-step-tab')].map(el=>el.dataset.step).join(',')==='1,2,3';
   const cedula=document.querySelector('[name="cedula"]');cedula.value='1234567890';
   view.goToPreviousModalStep();view.goToModalStep(2);
   return {scheduleFirst,first,count,noExtraStep,tabs,preserved:cedula.value==='1234567890'};
  });
  for(const [name,value] of Object.entries(result))assert(value,name);
  console.log('PASS: Horario primero; cedula primer campo en Datos, sin paso adicional ni duplicados.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
