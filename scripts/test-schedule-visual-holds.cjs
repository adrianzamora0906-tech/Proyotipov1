const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/visual-holds-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/visual-holds-test');
  const result=await page.evaluate(async()=>{
   const {realtimeClient}=await import('/src/js/core/realtime/RealtimeClient.js');
   const sent=[];realtimeClient.sendSelectionHold=slots=>{sent.push(slots);return true;};
   await import('/src/js/core/realtime/ScheduleSelectionHolds.js');
   const slot={instructorId:'3502fb7e-eb33-4338-9375-bc5701009367',cycleId:'646b0818-29bb-496c-a7f9-06fd85b6c9ee',date:'2026-10-19',start:'08:00',end:'09:40'};
   document.body.innerHTML=`<div id="student-modal-overlay" aria-hidden="false"><div class="enrollment-calendar"><button class="active" data-course-instructor-id="${slot.instructorId}"></button><button class="schedule-option" data-schedule='${JSON.stringify({cycleId:slot.cycleId,date:slot.date,time:'08:00 - 09:40'})}'><span class="schedule-option-capacity">1 cupo disponible</span></button></div></div>`;
   const cell=document.querySelector('.schedule-option');
   const emit=holds=>window.dispatchEvent(new CustomEvent('erp:schedule-holds',{detail:{type:'schedule-holds',holds}}));
   emit([{mine:false,slots:[slot]}]);const blocked=cell.getAttribute('aria-disabled')==='true' && cell.dataset.selectionHeld==='true' && cell.textContent.includes('otro usuario');
   emit([{mine:true,slots:[slot]}]);const own=!cell.disabled;
   emit([]);const released=!cell.disabled && cell.textContent==='1 cupo disponible';
   const {holdScheduleSelection}=await import('/src/js/core/realtime/ScheduleSelectionHolds.js');
   holdScheduleSelection([{cycleId:slot.cycleId,date:slot.date,time:'08:00 - 09:40'}],slot.instructorId);
   document.getElementById('student-modal-overlay').setAttribute('aria-hidden','true');
   await new Promise(resolve=>setTimeout(resolve,250));
   return {blocked,own,released,last:sent.at(-1)};
  });
  assert(result.blocked);assert(result.own);assert(result.released);assert.deepEqual(result.last,[]);
  console.log('PASS: otro dispositivo bloqueado, propietario habilitado, liberacion y cierre.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
