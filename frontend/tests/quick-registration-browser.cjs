// Solo servidor sintetico en puerto aleatorio. No importa backend ni configuracion PostgreSQL.
const http=require('node:http');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {chromium}=require(path.resolve(root,'../../../frontend-react/node_modules/playwright'));
const courseId='10000000-0000-4000-8000-000000000003',instructorId='10000000-0000-4000-8000-000000000004',cycleId='10000000-0000-4000-8000-000000000005',studentId='10000000-0000-4000-8000-000000000007';
let writes=0;let identityExists=false;
const identity={id:studentId,firstName:'ESTUDIANTE',lastName:'SINTETICO',identification:'1710034065',phone:'0999999999',email:'synthetic@example.invalid',status:'pendiente_pago'};
const option={key:`${cycleId}:08:00`,cycleId,code:'CICLO SINTETICO',startDate:'2026-11-30',endDate:'2026-12-01',time:'08:00',endTime:'09:40',dates:['2026-11-30','2026-12-01']};
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=data=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({success:true,data}));};
  if(url.pathname.startsWith('/api/')){
    if(url.pathname.endsWith('/catalog'))return json({promotionActive:true,courses:[{id:courseId,name:'Clase B Automovil',amount:156}]});
    if(url.pathname.endsWith('/instructors'))return json([{id:instructorId,name:'INSTRUCTOR SINTETICO'}]);
    if(url.pathname.endsWith('/options'))return json([option]);
    if(url.pathname.endsWith('/students'))return json(identityExists?[identity]:[]);
    if(url.pathname.endsWith(`/students/${studentId}`))return json({...identity,enrollments:[{course:'Clase B',status:'activo'}],schedule:[{schedule_date:'2026-11-30',start_time:'08:00',end_time:'09:40',instructor:'INSTRUCTOR SINTETICO'}]});
    if(url.pathname.endsWith('/enrollments')&&req.method==='POST'){writes++;req.resume();return setTimeout(()=>json({status:'completed',studentId}),120);}
    if(url.pathname.includes('/enrollments/'))return json({status:'completed',studentId});
    res.statusCode=500;return res.end('Unexpected synthetic API request');
  }
  if(url.pathname==='/'){
    res.setHeader('Content-Type','text/html');return res.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/src/assets/css/pages/quick-registration.css"><link rel="stylesheet" href="/src/assets/css/components/components.css"></head><body><div id="app"></div><script>window.__SPORTMANCAR_CONFIG__={API_BASE_URL:location.origin+'/api'};sessionStorage.setItem('erp_session',JSON.stringify({name:'OPERADOR SINTETICO',branch:'Flavio Reyes',role:'secretaria',roles:['QUICK_REGISTRATION_OPERATOR'],apiToken:'synthetic',mustChangePassword:false}));</script><script type="module">import View from '/src/js/views/students/QuickRegistrationView.js';const view=new View(location.search.includes('profile')?{studentId:'${studentId}'}:{});document.getElementById('app').innerHTML=await view.render();await view.mount();window.fixtureReady=true;</script></body></html>`);
  }
  const filename=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!filename.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{res.setHeader('Content-Type',filename.endsWith('.css')?'text/css':'text/javascript');res.end(fs.readFileSync(filename));}catch{res.statusCode=404;res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',error=>errors.push(error.message));
    const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);await page.waitForFunction(()=>window.fixtureReady);
    await page.locator('[name=identification]').fill(identity.identification);await page.locator('[name=firstName]').fill(identity.firstName);await page.locator('[name=lastName]').fill(identity.lastName);
    await page.locator('[name=courseId]').selectOption(courseId);await page.locator('#qr-instructor').fill('SINTETICO');await page.getByRole('button',{name:'INSTRUCTOR SINTETICO',exact:true}).click();
    await page.locator('[name=startDate]').selectOption('2026-11-30');await page.locator('[name=optionKey]').selectOption(option.key);await page.getByRole('button',{name:'Revisar inscripción'}).click();await page.locator('#qr-summary').waitFor({state:'visible'});
    assert.match(await page.locator('#qr-summary-content').innerText(),/156.00/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.locator('#qr-confirm').evaluate(button=>{button.click();button.click();});await page.locator('#qr-next').waitFor();assert.equal(writes,1);
    identityExists=true;await page.goto(url);await page.waitForFunction(()=>window.fixtureReady);await page.locator('[name=identification]').fill(identity.identification);await page.locator('[name=identification]').blur();await page.waitForFunction(()=>document.querySelector('[name=firstName]').readOnly);assert.equal(await page.locator('[name=firstName]').inputValue(),identity.firstName);
    await page.goto(url+'/?profile');await page.waitForFunction(()=>window.fixtureReady);assert.match(await page.locator('.student-profile').innerText(),/INSTRUCTOR SINTETICO/);assert.equal(await page.locator('.student-profile input,.student-profile button').count(),0);assert.deepEqual(errors,[]);
    console.log('PASS: formulario movil, autocompletado, resumen, doble clic, identidad existente y perfil de consulta (datos sinteticos).');
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
