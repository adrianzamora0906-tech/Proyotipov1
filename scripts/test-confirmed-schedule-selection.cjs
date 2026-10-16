const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/confirmed-selection-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/confirmed-selection-test');
  const result=await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const {realtimeClient}=await import('/src/js/core/realtime/RealtimeClient.js');
   document.body.innerHTML=`<div id="student-modal-overlay" aria-hidden="false"><button id="student-modal-next">Siguiente</button><div id="schedule-error"></div><div class="enrollment-calendar"><button class="active" data-course-instructor-id="3502fb7e-eb33-4338-9375-bc5701009367"></button><button class="schedule-option" data-time="08:00 - 09:40" data-date="2026-10-19"><span class="schedule-option-status">Disponible</span></button></div></div>`;
   const view=Object.create(View.prototype),cell=document.querySelector('.schedule-option');
   view.isRotationEnabled=()=>false;view.extendFixedScheduleCalendar=async()=>{};
   let stores=0;
   view.storeSchedulePlan=(calendar,preview)=>{
    if(!preview){stores++;return;}
    return [{cycleId:'646b0818-29bb-496c-a7f9-06fd85b6c9ee',date:'2026-10-19',time:'08:00 - 09:40'}];
   };
   let answer,requestCount=0;
   realtimeClient.sendSelectionHold=(slots,requestId)=>{
    if(requestId){requestCount++;answer=accepted=>window.dispatchEvent(new CustomEvent('erp:schedule-holds',{detail:{type:'schedule-hold-result',accepted,requestId}}));}
    return true;
   };
   const first=view.handleScheduleCellClick(cell);
   const pending=!cell.classList.contains('selected') && cell.textContent.includes('Comprobando') && document.getElementById('student-modal-next').disabled;
   await view.handleScheduleCellClick(cell);
   const noDoubleRequest=requestCount===1;
   answer(true);await first;
   const confirmed=cell.classList.contains('selected') && stores===1;
   cell.classList.remove('selected');stores=0;
   const second=view.handleScheduleCellClick(cell);answer(false);await second;
   const refused=!cell.classList.contains('selected') && stores===0 && document.getElementById('schedule-error').textContent.includes('Otro usuario');
   const third=view.handleScheduleCellClick(cell);const lateAnswer=answer;await third;
   lateAnswer(true);await Promise.resolve();
   const timeout=!cell.classList.contains('selected') && stores===0 && document.getElementById('schedule-error').textContent.includes('un segundo');
   realtimeClient.sendSelectionHold=()=>false;
   await view.handleScheduleCellClick(cell);
   const offline=!cell.classList.contains('selected') && document.getElementById('schedule-error').textContent.includes('Sin conexion');
   return {pending,noDoubleRequest,confirmed,refused,timeout,offline};
  });
  for(const [name,value] of Object.entries(result))assert(value,name);
  console.log('PASS: sin seleccion anticipada, confirmacion, rechazo, doble clic, timeout y desconexion.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
