const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const root=path.resolve(__dirname,'../frontend');
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900},serviceWorkers:'block'});
  await page.route('http://localhost:8080/**',async route=>{
   const pathname=new URL(route.request().url()).pathname;
   if(pathname==='/nationality-test')return route.fulfill({contentType:'text/html',body:'<body></body>'});
   const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return route.abort();
   try{await route.fulfill({contentType:file.endsWith('.css')?'text/css':'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}
  });
  await page.goto('http://localhost:8080/nationality-test');
  for(const css of ['base/globals.css','components/components.css','pages/students.css','base/responsive.css']){
   await page.addStyleTag({url:`http://localhost:8080/src/assets/css/${css}`});
  }
  const count=await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');authService.getCurrentUser=()=>({role:'secretaria_sucursal'});authService.can=()=>false;
   const {default:View}=await import('/src/js/views/students/StudentsView.js');const v=new View();v.getSchedulesForModal=async()=>[];
   const html=await v.renderStudentModal();document.body.innerHTML=html;
   const form=document.querySelector('form');
   const {bindStudentIdentityFields,NATIONALITIES}=await import('/src/js/helpers/StudentIdentityFields.js');bindStudentIdentityFields(form);
   document.querySelectorAll('.student-modal-step').forEach(e=>{e.hidden=false;e.style.display='block';});
   document.querySelector('#student-modal-overlay').classList.add('active');
   return NATIONALITIES.length;
  });
  assert(count>=190,`Catalogo incompleto: ${count}`);
  assert.equal(await page.inputValue('[name="nationality"]'),'ECUATORIANA');
  assert(await page.evaluate(()=>document.querySelector('[name="nationality"]').closest('.form-row')===document.querySelector('[name="birthDate"]').closest('.form-row')));
  if(width===1280){
   const national=await page.locator('[name="nationality"]').boundingBox(),birth=await page.locator('[name="birthDate"]').boundingBox();
   assert(Math.abs(national.y-birth.y)<2,'Nacionalidad y nacimiento deben compartir fila');
   assert(birth.x>=national.x+national.width,'Las columnas no deben solaparse');
  }
  await page.locator('#student-nationality-row').screenshot({path:`.tmp/student-nationality-layout-${width}.png`});
  await page.locator('[name="nationality"]').fill('españ');
  assert.equal(await page.inputValue('[name="nationality"]'),'ESPAÑ');
  assert.deepEqual(await page.locator('#student-nationality-options option').evaluateAll(options=>options.map(x=>x.value)),['ESPAÑOLA']);
  await page.locator('#student-nationality-row').screenshot({path:`.tmp/student-nationality-${width}.png`});
  await page.locator('[name="firstName"]').fill('maría josé');assert.equal(await page.inputValue('[name="firstName"]'),'MARÍA JOSÉ');
  await page.locator('[name="email"]').fill('Mixed@Example.com');assert.equal(await page.inputValue('[name="email"]'),'Mixed@Example.com');
  const data=await page.evaluate(async()=>{
   const {default:Service}=await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');const {default:api}=await import('/src/js/core/api/apiService.js');
   let received;api.createStudent=async payload=>{received=payload;return {success:true,data:{id:'fixture'}}};Service.recordHistory=()=>{};
   await Service.createStudent({cedula:'0956627897',firstName:'MARIA',lastName:'PRUEBA',nationality:'ESPAÑOLA'});return received;
  });assert.equal(data.nationality,'ESPAÑOLA');
  await page.close();
 }
 console.log('PASS: catalogo, busqueda parcial, mayusculas, correo intacto y payload de nacionalidad. API simulada.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
