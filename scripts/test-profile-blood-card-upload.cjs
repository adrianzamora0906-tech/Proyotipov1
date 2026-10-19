const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({serviceWorkers:'block'}),root=path.resolve(__dirname,'../frontend');
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}
  });
  await page.route('**/blood-test',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));
  await page.goto('http://localhost:8080/blood-test');
  const result=await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/student-profile/StudentProfileView.js');
   const view=new View();
   document.body.innerHTML=view.renderCedulaPdfUpload([]);
   const initial=!!document.querySelector('#cedula-pdf-file')&&!!document.querySelector('#cedula-pdf-includes-blood-card')&&!document.querySelector('[data-document-type="carnet_tipo_sangre"]');
   document.body.innerHTML=view.renderCedulaPdfUpload([{type:'cedula',file_url:'data:application/pdf;base64,dGVzdA=='}]);
   const append=!!document.querySelector('.append-blood-card-input');
   document.body.innerHTML=view.renderCedulaPdfUpload([{type:'carnet_tipo_sangre',file_url:'test'}]);
   const noDuplicate=!!document.querySelector('#cedula-pdf-file')&&!document.querySelector('[data-document-type="carnet_tipo_sangre"]');
   return {initial,append,noDuplicate};
  });
  assert(result.initial);assert(result.append);assert(result.noDuplicate);
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/student-profile/StudentProfileView.js');
   const {default:api}=await import('/src/js/core/api/apiService.js');
   api.createDocument=async(id,payload)=>{window.savedDocument=payload;return {success:true};};
   const view=new View();view.readFileAsDataUrl=async()=> 'data:application/pdf;base64,dGVzdA==';
   document.body.innerHTML=view.renderCedulaPdfUpload([]);view.setupCedulaPdfUpload('test-student');
  });
  await page.locator('#cedula-pdf-file').setInputFiles({name:'cedula-carnet.pdf',mimeType:'application/pdf',buffer:Buffer.from('test')});
  await page.check('#cedula-pdf-includes-blood-card');
  assert.equal(await page.locator('[data-document-type="carnet_tipo_sangre"]').count(),0);
  await page.click('#upload-cedula-pdf');
  await page.waitForFunction(()=>window.savedDocument?.type==='registro_documentos');
  assert.equal(await page.evaluate(()=>window.savedDocument.includesBloodCard),true);
  await page.uncheck('#cedula-pdf-includes-blood-card');
  assert.equal(await page.locator('[data-document-type="carnet_tipo_sangre"]').count(),0);
  await page.click('#upload-cedula-pdf');
  await page.waitForFunction(()=>window.savedDocument?.type==='cedula');
  assert.equal(await page.evaluate(()=>window.savedDocument.includesBloodCard),false);
  console.log('PASS: casilla PDF combinado registra ambos tipos; desmarcada conserva carga de cedula independiente.');
  console.log('PASS: PDF con casilla sin campo separado de carnet; conserva anexado a cedula existente.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
