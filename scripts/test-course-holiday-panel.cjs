const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent('<style>*{box-sizing:border-box}body{margin:0;font-family:Arial}input,select,button{padding:10px}h1{font-size:24px}h2{font-size:18px}</style><main id="app"></main>');
  const source=fs.readFileSync('frontend/src/js/helpers/CourseHolidayPanel.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default class CourseHolidayPanel','window.Panel=class CourseHolidayPanel');
  await page.addScriptTag({content:`const permissionService={can:()=>true};window.confirms=0;const apiClient={get:async()=>({data:{holidays:[{id:'holiday',name:'Feriado de prueba',holiday_date:'2026-11-03',end_date:'2026-11-05',days:3,active:true}],branches:[{id:'branch',name:'Flavio Reyes'}]}}),post:async(url,payload)=>{window.lastPayload=payload;if(url.endsWith('/confirm')){window.confirms++;return {data:{classesMoved:1}};}return {data:{courses:[{code:'MOTO',oldStart:'2026-11-02',oldEnd:'2026-11-06',start:'2026-11-02',end:'2026-11-11'}],moves:[{name:'Estudiante de prueba',oldDate:'2026-11-03',date:'2026-11-06',start_time:'08:00:00',end_time:'09:40:00'}],practiceChanges:[{name:'Practica de prueba',oldDates:['2026-11-03','2026-11-04','2026-11-05'],dates:['2026-11-06','2026-11-09','2026-11-10']}],theoryGroups:[{id:'theory',branch:'Sucursal',modality:'presencial_regular',start:'2026-11-02',startTime:'18:00',endTime:'20:00',continuing:false,newStart:payload.theoryReschedules?.theory||null}],theoryMoves:[],conflicts:[],canApply:true,token:'preview'}};}};${source}`});
  await page.evaluate(async()=>{const panel=new window.Panel();document.getElementById('app').innerHTML=await panel.render();panel.mount();});
  await page.locator('[name=name]').fill('Feriado de prueba');await page.locator('[name=date]').fill('2026-11-03');await page.locator('[name=endDate]').fill('2026-11-05');
  assert.equal(await page.locator('#holiday-duration').innerText(),'Duracion: 3 dias');
  await page.getByRole('button',{name:'Vista previa',exact:true}).click();
  await page.locator('#holiday-confirm').waitFor();assert.equal(await page.evaluate(()=>window.confirms),0);
  assert.equal(await page.evaluate(()=>window.lastPayload.endDate),'2026-11-05');
  assert((await page.locator('#holiday-preview').innerText()).includes('2026-11-10'));
  assert((await page.locator('#holiday-preview').innerText()).includes('Practica de prueba'));
  assert((await page.locator('#holiday-list').innerText()).includes('3 dias'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.tmp/course-holidays-'+width+'.png',fullPage:true});
  await page.locator('[name=endDate]').fill('2026-11-06');assert(await page.locator('#holiday-preview').isHidden());
  assert.equal(await page.evaluate(()=>window.confirms),0);
  await page.getByRole('button',{name:'Vista previa',exact:true}).click();await page.locator('#holiday-confirm').waitFor();
  await page.locator('[data-theory-date]').fill('2026-11-09');
  assert(await page.locator('#holiday-confirm').isDisabled());
  await page.getByRole('button',{name:'Validar nuevas fechas',exact:true}).click();
  await page.waitForFunction(()=>window.lastPayload.theoryReschedules?.theory==='2026-11-09');
  assert.equal(await page.locator('[data-theory-date]').inputValue(),'2026-11-09');
  await page.locator('#holiday-confirm').click();await page.waitForFunction(()=>document.getElementById('holiday-status').textContent.includes('Feriado guardado'));
  assert.equal(await page.evaluate(()=>window.confirms),1);await page.close();
 }console.log('Panel de feriados: vista previa y confirmacion verificadas en 390 y 1280 px.');}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
