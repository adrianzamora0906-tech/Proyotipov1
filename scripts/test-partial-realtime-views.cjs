const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
async function main(){
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('**/partial-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
    await page.goto('http://localhost:8080/partial-test');
    const result=await page.evaluate(async()=>{
      const {authService}=await import('/src/js/core/auth/AuthService.js');
      authService.getCurrentUser=()=>({name:'Prueba',username:'test',permissions:[]});authService.can=()=>false;
      const {default:Layout}=await import('/src/js/layouts/SidebarLayout.js');
      Layout.render=async content=>`<header id="stable-header">Cabecera</header>${content}`;Layout.attachEventListeners=()=>{};
      const {default:Portal,practicalClassRange}=await import('/src/js/views/student-portal/StudentPortalView.js');
      const {default:PortalService}=await import('/src/js/services/StudentPortalService.js');
      let attended=0;
      PortalService.summary=async()=>({data:{student:{name:'Alumno Prueba',branch:'Sucursal',status:'activo'},enrollment:null,payment:{balance:0},documents:[],classes:[],metrics:{totalClasses:8,attended,pending:8-attended,performance:null,documentsComplete:0,documentsTotal:3}}});
      const portal=new Portal();document.body.innerHTML=await portal.render();await portal.mount();
      portal.selectTab('classes');
      const root=document.querySelector('.student-portal'),navigation=document.querySelector('.student-portal__nav');
      attended=2;await portal.refreshRealtime();
      const portalStable=document.querySelector('.student-portal')===root && document.querySelector('.student-portal__nav')===navigation
        && !document.querySelector('[data-student-panel="classes"]').hidden
        && document.querySelector('.student-metrics strong').textContent==='2';
      const practice={scheduled_start:'2030-10-16T21:00:00Z',scheduled_end:'2030-10-16T22:40:00Z',status:'PROGRAMADA',instructor_name:'Instructor Prueba'};
      const formatted=practicalClassRange(practice);
      if(formatted!=='16:00 - 17:40')throw new Error(`Hora incorrecta: ${formatted}`);
      if(practicalClassRange({})!=='Por asignar')throw new Error('Sin horario debe mostrar Por asignar');
      portal.data.classes=[practice];
      let markup=portal.renderPortal();
      if(!markup.includes('Horario de prácticas')||!markup.includes('16:00 - 17:40')||markup.includes('Horario rotativo:'))throw new Error('Horario fijo no visible');
      portal.data.classes.push({...practice,scheduled_start:'2030-10-17T13:00:00Z',scheduled_end:'2030-10-17T14:40:00Z'});
      markup=portal.renderPortal();
      if(!markup.includes('Horario rotativo: 16:00 - 17:40 / 08:00 - 09:40'))throw new Error('Horario rotativo no visible');
      window.portalTest=portal;
      const {default:Agenda}=await import('/src/js/views/instructor/InstructorAgendaView.js');
      const {default:AgendaService}=await import('/src/js/services/instructorAgendaService.js');
      const {default:StudentService}=await import('/src/js/services/instructorStudentService.js');
      let sessions=[];AgendaService.getAgenda=async()=>({data:sessions});StudentService.getStudents=async()=>({data:[]});
      history.replaceState({},'', '/instructor/agenda');
      const agenda=new Agenda();document.body.innerHTML=await agenda.render();await agenda.mount();
      const header=document.getElementById('stable-header'),filter=document.getElementById('agenda-filter-form');
      sessions=[{id:'test-session',studentName:'Alumno Prueba',course:'Carro',status:'EN_CURSO',sessionNumber:1,scheduledStart:'2026-10-14T13:00:00Z',scheduledEnd:'2026-10-14T14:40:00Z'}];
      await agenda.refreshRealtime();
      const agendaStable=document.getElementById('stable-header')===header && document.getElementById('agenda-filter-form')===filter
        && document.querySelector('.agenda-result-count').textContent==='1 clase'
        && document.querySelector('.agenda-list-card__body').textContent.includes('Alumno Prueba');
      return {portalStable,agendaStable};
    });
    assert.equal(result.portalStable,true);assert.equal(result.agendaStable,true);
    console.log('PASS portal keeps tab/navigation and updates metrics; agenda keeps header/filters and updates classes.');
    console.log('PASS practical hours: fixed, rotating and unassigned; Ecuador timezone.');
    for(const width of [390,1280]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(async()=>{document.body.innerHTML=window.portalTest.renderPortal();await window.portalTest.mount();});
      await page.waitForTimeout(250);
      assert.equal(await page.locator('.student-next-class .student-practical-time').innerText(),'16:00 - 17:40');
      await page.screenshot({path:`.tmp/student-practical-summary-${width}.png`,fullPage:true});
      await page.locator('[data-student-tab="classes"]:visible').first().click();
      assert.equal(await page.locator('.student-class-list .student-practical-time:visible').count(),2);
      await page.screenshot({path:`.tmp/student-practical-classes-${width}.png`,fullPage:true});
    }
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
