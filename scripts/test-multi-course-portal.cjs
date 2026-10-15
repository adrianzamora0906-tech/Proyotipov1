const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.route('**/portal-multi-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/portal-multi-test');
  const result=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');authService.getCurrentUser=()=>({name:'Alumno',permissions:[]});
   const {default:Service}=await import('/src/js/services/StudentPortalService.js');
   Service.summary=async id=>({data:{student:{name:'Alumno Prueba',branch:'Sucursal',status:'activo'},
    enrollments:[{id:'auto',course_name:'Clase B - Automovil',created_at:'2026-10-15'},{id:'moto',course_name:'Clase A - Moto',created_at:'2026-10-15'}],
    enrollment:{id:id || 'auto',course_name:id==='moto'?'Clase A - Moto':'Clase B - Automovil'},
    payment:{balance:id==='moto'?125:90},documents:[],classes:[],metrics:{totalClasses:0,attended:0,pending:0,performance:null,documentsComplete:0,documentsTotal:0}}});
   const {default:Portal}=await import('/src/js/views/student-portal/StudentPortalView.js');
   const portal=new Portal();document.body.innerHTML=await portal.render();await portal.mount();
   const header=document.querySelector('.student-portal__header'),nav=document.querySelector('.student-portal__nav');
   const select=document.getElementById('student-enrollment-select');select.value='moto';select.dispatchEvent(new Event('change',{bubbles:true}));
   await new Promise(resolve=>setTimeout(resolve,30));
   return {selected:document.getElementById('student-enrollment-select').value==='moto',
    data:portal.data.enrollment.id==='moto' && portal.data.payment.balance===125,
    heading:document.querySelector('.student-welcome p').textContent.includes('Clase A - Moto'),
    stable:header===document.querySelector('.student-portal__header') && nav===document.querySelector('.student-portal__nav')};
  });
  for(const [name,value] of Object.entries(result))assert(value,name);
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   await page.screenshot({path:`.tmp/multi-course-portal-${width}.png`,fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  console.log('PASS: selector de curso actualiza saldo y mantiene cabecera/navegacion, en movil y escritorio.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
