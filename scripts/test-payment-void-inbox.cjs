const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try {
  const page=await browser.newPage({serviceWorkers:'block'});
  const root=path.resolve(__dirname,'../frontend');
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{return route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{return route.abort();}
  });
  await page.route('**/void-test',route=>route.fulfill({contentType:'text/html',body:'<button id="notifications-btn">Avisos</button>'}));
  await page.goto('http://localhost:8080/void-test');
  for(const file of ['base/globals','components/components','base/responsive'])await page.addStyleTag({content:await fs.readFile(path.join(root,`src/assets/css/${file}.css`),'utf8')});
  await page.evaluate(async()=>{
   const {authService}=await import('/src/js/core/auth/AuthService.js');authService.getCurrentUser=()=>({userId:'dayana'});
   const {default:api}=await import('/src/js/core/api/apiService.js');
   window.rows=[{id:'one',student_name:'Estudiante de prueba',amount:125,reason:'Registro equivocado',branch_name:'Shopping',requested_by_name:'Caja'}];
   api.getPendingPaymentVoidRequests=async()=>({success:true,data:window.rows});
   api.getMyReviewedPaymentVoidRequests=async()=>({success:true,data:[]});
   api.reviewPaymentVoidRequest=async(id,decision)=>{window.decision=decision;window.rows=[];return {success:true};};
   window.inbox=(await import('/src/js/services/PaymentVoidInbox.js')).paymentVoidInbox;
   window.inbox.mount();
  });
  await page.waitForFunction(()=>document.querySelector('#payment-void-button')?.textContent.includes('1'));
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/cash/PendingPaymentsView.js');
   document.body.insertAdjacentHTML('beforeend','<input id="filter-cedula"><select id="filter-branch"><option value=""></option></select><button data-payment-tab="voids"><b></b></button><span id="void-result-count"></span><div id="void-requests-content"></div>');
   window.paymentView=new View();window.paymentView.renderVoidRequests();
  });
  assert((await page.locator('#void-requests-content').textContent()).includes('Estudiante de prueba'));
  assert.equal(await page.locator('[data-payment-tab="voids"] b').textContent(),'1');
  await page.fill('#filter-cedula','no coincide');
  await page.evaluate(()=>window.paymentView.renderVoidRequests());
  assert((await page.locator('#void-requests-content').textContent()).includes('No hay anulaciones'));
  await page.fill('#filter-cedula','');
  await page.click('#payment-void-button');
  assert(await page.locator('[data-review]').count()===2);
  await page.click('[data-decision="REJECTED"]');
  assert((await page.locator('[data-error]').textContent()).includes('motivo'));
  await page.fill('[data-note]','Solicitud incorrecta');
  await page.click('[data-decision="REJECTED"]');
  await page.waitForFunction(()=>window.decision==='REJECTED'&&!document.querySelector('[data-review]'));
  await page.evaluate(()=>{window.rows=[{id:'two',student_name:'Nuevo pendiente',amount:165}];window.dispatchEvent(new CustomEvent('erp:payment-void-changed'));});
  await page.waitForFunction(()=>document.querySelector('[data-review="two"]'));
  await page.evaluate(()=>{window.rows=[];window.dispatchEvent(new CustomEvent('erp:realtime',{detail:{topics:['resync']}}));});
  await page.waitForFunction(()=>!document.querySelector('[data-review]'));
  console.log('PASS: bandeja, contador, rechazo con motivo, aviso en vivo y recuperacion al reconectar. Sin pagos reales.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
