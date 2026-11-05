const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const root=path.resolve(__dirname,'../frontend'),page=await browser.newPage({serviceWorkers:'block'});
  await page.route('http://localhost:8080/**',async route=>{
   const file=path.resolve(root,'.'+new URL(route.request().url()).pathname);
   if(!file.startsWith(root+path.sep))return route.abort();
   try{await route.fulfill({contentType:'text/javascript',body:await fs.readFile(file)});}catch{await route.abort();}
  });
  await page.route('**/purchase-test',route=>route.fulfill({contentType:'text/html',body:'<div id="atm-auth-count"></div><div id="atm-permit-count"></div><h3 id="atm-list-title"></h3><div id="atm-history"></div>'}));
  await page.goto('http://localhost:8080/purchase-test');
  await page.evaluate(async()=>{
   const {default:View}=await import('/src/js/views/admin/AtmAuthorizationView.js');
   const {default:Admin}=await import('/src/js/services/AdminService.js');
   window.confirm=()=>true;window.prompt=()=> 'Prueba de anulacion autorizada';
   window.doc={id:'00000000-0000-4000-8000-000000000001',document_type:'PERMIT',office_number:'OF-TEST',purchase_status:'DRAFT',purchase_count:33,branch_name:'Manta',course_start:'2026-10-01',course_end:'2026-10-20',generated_at:'2026-10-20T12:00:00Z'};
   Admin.atmAuthorizations=async()=>({data:[window.doc]});
   Admin.confirmPermitPurchase=async id=>{window.confirmedId=id;window.doc.purchase_status='CONFIRMED';return {success:true};};
   Admin.cancelPermitPurchase=async(id,reason)=>{window.cancelled={id,reason};window.doc.purchase_status='CANCELLED';return {success:true};};
   window.view=new View();window.view.selectedType='PERMIT';window.view.documents=[window.doc];window.view.renderHistory();
  });
  assert.equal(await page.locator('.atm-confirm-purchase').count(),1);
  await page.click('.atm-confirm-purchase');
  await page.waitForSelector('.atm-cancel-purchase');
  assert.equal(await page.locator('.atm-delete-document').count(),0);
  assert((await page.locator('#atm-history').textContent()).includes('Compra confirmada'));
  await page.click('.atm-cancel-purchase');
  await page.waitForFunction(()=>document.getElementById('atm-history').textContent.includes('Compra anulada'));
  assert.equal(await page.locator('.atm-confirm-purchase').count(),0);
  assert.equal((await page.evaluate(()=>window.cancelled)).reason,'Prueba de anulacion autorizada');
  console.log('PASS: borrador, confirmar, anular con motivo y sin eliminacion de compras confirmadas. API simulada.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
