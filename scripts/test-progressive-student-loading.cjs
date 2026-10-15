const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'});
  await page.route('**/progressive-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/progressive-test');
  const result=await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/students/StudentsView.js');
   const {default:Api}=await import('/src/js/core/api/apiService.js');
   const {default:Profile}=await import('/src/js/views/student-profile/StudentProfileView.js');
   const {default:Students}=await import('/src/js/services/StudentService.js');
   const {authService}=await import('/src/js/core/auth/AuthService.js');
   const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');
   authService.getCurrentUser=()=>({role:'instructor',permissions:[]});
   authService.can=()=>false;
   Layout.render=async content=>content;Layout.attachEventListeners=()=>{};
   let listCalls=0;
   Students.getAllStudents=async()=>{listCalls++;return [];};
   Students.getActiveReservations=async()=>{listCalls++;return [];};
   Students.getBranches=async()=>[];
   const registration=new View();
   registration.getDisabledStudents=async()=>{listCalls++;return [];};
   window.history.replaceState(null,'','/students/new');
   await registration.render();
   const view=Object.create(View.prototype);
   view.modalLocationCatalog={branches:[{id:'monte',code:'SP_MC'}]};
   const requests=[];
   Api.getCourseEnrollmentOptions=async filters=>{requests.push(filters);return {success:true,data:[]};};
   let finishTheory,theoryCalls=0;
   Api.getTheoryEnrollmentOptions=()=>{theoryCalls++;return new Promise(resolve=>{finishTheory=resolve;});};
   document.body.innerHTML='<div class="theory-schedule-selector"><input type="radio" name="theorySchedule" value="virtual" checked></div>';
   const pending=view.loadModalTheoryGroups('monte');
   await view.getSchedulesForModal('monte');
   const schedulesReadyBeforeTheory=view.modalTheoryLoading && requests.length===1;
   finishTheory({success:true,data:[]});await pending;
   const preserved=document.querySelector('[name="theorySchedule"]:checked')?.value==='virtual';
   await view.loadModalTheoryGroups('monte');
   const deduplicated=theoryCalls===1;
   document.body.innerHTML='<div class="tab-pane" data-tab="history"><div class="card-body"></div></div>';
   let historyCalls=0,finishHistory;
   Students.getStudentHistory=()=>{historyCalls++;return new Promise(resolve=>{finishHistory=resolve;});};
   const profile=Object.create(Profile.prototype);profile.props={studentId:'student'};
   const first=profile.loadHistoryTab();const second=profile.loadHistoryTab();
   finishHistory([{timestamp:'2026-10-15T10:00:00Z',action:'Cambio de horario <script>'}]);
   await Promise.all([first,second]);await profile.loadHistoryTab();
   return {listCalls,schedulesReadyBeforeTheory,preserved,deduplicated,historyCalls,
    historyText:document.querySelector('.timeline-content').textContent,
    injected:Boolean(document.querySelector('.timeline-content script'))};
  });
  assert(result.schedulesReadyBeforeTheory);assert(result.preserved);assert(result.deduplicated);
  assert.equal(result.listCalls,0);
  assert.equal(result.historyCalls,1);assert.equal(result.historyText,'Cambio de horario <script>');assert(!result.injected);
  console.log('PASS: horarios antes de teorias, seleccion preservada, consultas deduplicadas e historial bajo demanda.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
