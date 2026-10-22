const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const source=fs.readFileSync('frontend/src/js/views/manager/ManagerReportsView.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default class ManagerReportsView','window.ManagerReportsView = class ManagerReportsView');
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial}.modal-overlay{display:none}.btn{padding:10px}button{cursor:pointer}</style><div id="app"></div>');
   await page.addScriptTag({content:`const Component=class {};const SidebarLayout={render:x=>x};const AdminService={};const ManagerService={};const authService={getCurrentUser:()=>({roles:['ADMIN_SYSTEM'],scope:'GLOBAL'})};${source}`});
   await page.evaluate(async()=>{
    const v=window.view=new window.ManagerReportsView();document.getElementById('app').innerHTML=await v.render();
    v.result={summary:{sales:56,enrollments:65,today_enrollments:4,cycles:15,instructors:11,services:38},rows:[{identification:'0000000001',name:'Alumno de prueba',course:'Clase B - Automovil',branch:'Flavio Reyes',academic_branch:'Manta 2000',registered_by:'usuario',enrollment_date:'2026-10-21',status:'activo'}]};
    v.filters.type='sales';v.load=async()=>v.paint();v.scheduleFilterLoad=()=>v.load();await v.mount();v.paint();
   });
   assert.equal(await page.locator('#report-title').innerText(),'Ventas');
   assert((await page.locator('#report-table-head').innerText()).includes('Sucursal de venta'));
   assert((await page.locator('#report-table-head').innerText()).includes('Sucursal de formacion'));
   await page.screenshot({path:`.tmp/sales-report-${width}.png`,fullPage:true});
   assert.equal(await page.locator('[data-report-type="enrollments"]').count(),0);
   await page.locator('[data-report-type="cycles"]').click();
   assert.equal(await page.locator('#report-title').innerText(),'Cursos y ciclos');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Desbordamiento de pagina');
   await page.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
