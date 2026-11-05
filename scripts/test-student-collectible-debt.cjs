const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const source=fs.readFileSync('frontend/src/js/views/students/StudentsView.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default StudentsView;','window.View=StudentsView;');
 const page=await browser.newPage();
 await page.setContent('<div id="summary"></div>');
 await page.addScriptTag({content:`const Component=class {};${source}`});
 const html=await page.evaluate(()=>{
  const v=Object.create(window.View.prototype);v.disabledStudentCount=0;
  return v.renderStudentSummary([{status:'pago_confirmado',hasCollectibleDebt:true},{status:'pendiente_pago',hasCollectibleDebt:false},{status:'pago_parcial',hasCollectibleDebt:true},{status:'pendiente_pago',hasCollectibleDebt:false}],[],'payment_pending');
 });
 await page.locator('#summary').evaluate((node,html)=>node.innerHTML=html,html);
 const card=page.locator('[data-status="payment_pending"]');
 assert.equal(await card.locator('strong').innerText(),'2');
 assert.equal(await card.locator('span').last().innerText(),'Con deuda pendiente');
 assert.equal(await card.getAttribute('aria-pressed'),'true');
 await page.close();
 console.log('PASS: tarjeta usa deuda calculada, no el estado academico o la transferencia pendiente.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
