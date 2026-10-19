const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/exam-double-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/exam-double-test');
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const {realtimeClient}=await import('/src/js/core/realtime/RealtimeClient.js');
   const {holdScheduleSelection}=await import('/src/js/core/realtime/ScheduleSelectionHolds.js');
   document.body.innerHTML=`<div id="student-modal-overlay" aria-hidden="false"><input id="selected-practical-mode" value="classes"><div id="schedule-error"></div><div class="enrollment-calendar"><button class="active" data-course-instructor-id="3502fb7e-eb33-4338-9375-bc5701009367">Instructor</button><button id="slot" class="schedule-option" data-date="2026-10-19" data-time="08:00 - 09:40"><span class="schedule-option-status">Disponible</span><span class="schedule-option-capacity">1 cupo disponible</span></button></div></div>`;
   const view=Object.create(View.prototype),cell=document.getElementById('slot');window.requests=[];
   view.isRotationEnabled=()=>false;view.extendFixedScheduleCalendar=async()=>{};
   view.setPracticalMode=mode=>{
    document.getElementById('selected-practical-mode').value=mode;
    cell.classList.remove('selected');holdScheduleSelection([],null);
   };
   const plan=[{cycleId:'646b0818-29bb-496c-a7f9-06fd85b6c9ee',date:'2026-10-19',time:'08:00 - 09:40'}];
   view.storeSchedulePlan=(calendar,preview)=>{if(preview)return plan;holdScheduleSelection(plan,view.getCalendarInstructorButton(calendar).dataset.courseInstructorId);};
   realtimeClient.sendSelectionHold=(slots,requestId)=>{
    if(requestId){window.requests.push(slots);setTimeout(()=>window.dispatchEvent(new CustomEvent('erp:schedule-holds',{detail:{type:'schedule-hold-result',accepted:true,requestId}})),20);}
    return true;
   };
   view.bindScheduleOptionInteraction(cell);
   window.dispatchEvent(new CustomEvent('erp:schedule-holds',{detail:{type:'schedule-holds',holds:[{mine:false,slots:[{...plan[0],instructorId:'3502fb7e-eb33-4338-9375-bc5701009367',start:'08:00',end:'09:40',mode:'classes'}]}]}}));
  });
  await page.locator('#slot').dblclick({force:true});
  await page.waitForTimeout(650);
  const result=await page.evaluate(()=>({requests:window.requests,selected:document.getElementById('slot').classList.contains('selected'),mode:document.getElementById('selected-practical-mode').value}));
  assert.equal(result.requests.length,1);assert.equal(result.requests[0].length,1);
  assert.equal(result.requests[0][0].mode,'exam_only');assert.equal(result.mode,'exam_only');assert(result.selected);
  console.log('PASS: doble clic sobre retencion de clase confirma solo un examen, sin retener fila de clases.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
