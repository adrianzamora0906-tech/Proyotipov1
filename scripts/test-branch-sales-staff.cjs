const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const source=fs.readFileSync('frontend/src/js/views/manager/ManagerBranchesView.js','utf8').replace(/^import .*;\r?\n/gm,'').replace('export default class ManagerBranchesView','window.View=class ManagerBranchesView');
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent('<style>body{font-family:Arial;margin:12px}.branch-staff-table{max-width:100%;overflow:auto}th,td{padding:10px}table{border-collapse:collapse}.branch-staff-summary{display:flex;flex-wrap:wrap;gap:12px}.branch-staff-summary article{max-width:180px}span{display:block}</style><div id="branch-staff-title"></div><div id="branch-staff-period"></div><div id="branch-staff-content"></div>');
  await page.addScriptTag({content:`const Component=class {};const SidebarLayout={};const AdminService={};const authService={};const permissionService={};${source}`});
  await page.evaluate(()=>{
   const v=Object.create(window.View.prototype);
   v.chartBranches=[{id:'branch',name:'Flavio',students_with_payment:12,daily_enrollments:[{enrollments:19,fully_paid_enrollments:11,income:100}],staff_performance:[{id:'a',name:'Anthony',role:'BRANCH_ADMIN',registered_students:15,confirmed_enrollments:9,payments_count:1,collected_amount:100,last_activity:'2026-10-26'},{id:'s',name:'Secretaria',role:'SECRETARY',registered_students:4,confirmed_enrollments:2,payments_count:0,collected_amount:0,last_activity:null}]}];
   v.dateFromInput={value:'2026-10-01'};v.dateToInput={value:'2026-10-26'};v.staffModal={classList:{add(){}},setAttribute(){}};
   v.openStaffModal('branch');
  });
  const row=page.locator('tbody tr').first();
  assert.equal(await row.locator('td').nth(2).innerText(),'15');
  assert.equal(await row.locator('td').nth(3).innerText(),'9');
  const summary=await page.locator('.branch-staff-summary').innerText();
  assert(summary.includes('19'));assert(summary.includes('Ventas del periodo'));assert(summary.includes('Anthony'));
  assert(!(await page.locator('thead').innerText()).includes('Registrados'));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:'.tmp/branch-sales-staff-'+width+'.png',fullPage:true});await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
