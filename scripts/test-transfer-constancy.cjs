const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  for(const width of [390,1280]){
   const page=await browser.newPage({viewport:{width,height:850},serviceWorkers:'block'});
   await page.route('**/transfer-constancy-test',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
   await page.goto('http://localhost:8080/transfer-constancy-test');
   const result=await page.evaluate(async()=>{
    const {apiClient}=await import('/src/js/core/api/ApiClient.js');
    const {default:Api}=await import('/src/js/core/api/apiService.js');
    const {default:Payments}=await import('/src/js/services/PaymentService.js');
    let writes=0,reads=0;
    Api.registerPayment=async()=>{writes++;return {success:true,data:{pendingTransfer:true,transfer:{id:'pending-id'}}};};
    apiClient.get=async url=>{reads++;if(!url.endsWith('/pending-id/receipt'))throw new Error('Ruta incorrecta');return {success:true,html:'<div class="receipt"><h2>CONSTANCIA DE TRANSFERENCIA PENDIENTE</h2><p>No acredita un pago confirmado ni reduce el saldo del estudiante.</p><p>Este documento no tiene validez tributaria.</p></div>'};};
    const response=await Payments.registerPayment({cedula:'1234567890',amount:165,method:'transferencia',reference:'test',notify:false});
    const layer=document.getElementById('transfer-constancy-overlay');
    const shown=layer.textContent.includes('no tiene validez tributaria')&&!layer.querySelector('[data-print]').disabled;
    layer.querySelector('[data-close]').click();
    return {success:response.success,pending:response.pendingTransfer,writes,reads,shown,closed:!document.getElementById('transfer-constancy-overlay')};
   });
   assert(result.success&&result.pending&&result.shown&&result.closed);assert.equal(result.writes,1);assert.equal(result.reads,1);
   await page.close();
  }
  console.log('PASS: constancia de transferencia pendiente visible e imprimible, un solo registro y sin afectar el saldo.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
