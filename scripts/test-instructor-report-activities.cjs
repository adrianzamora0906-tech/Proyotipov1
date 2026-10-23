const fs=require('node:fs');
const assert=require('node:assert/strict');
const {chromium}=require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const helper=fs.readFileSync('frontend/src/js/helpers/InstructorReportColumns.js','utf8').replaceAll('export function','function');
 for(const width of [390,1280])for(const [file,className,prefix] of [['ManagerReportsView.js','ManagerReportsView','report-'],['ManagerAcademicView.js','ManagerAcademicView','']]){
  const source=fs.readFileSync('frontend/src/js/views/manager/'+file,'utf8').replace(/^import .*;\r?\n/gm,'').replace('export default class '+className,'window.View=class '+className);
  const page=await browser.newPage({viewport:{width,height:900}});
  await page.setContent(`<style>body{font-family:Arial;margin:8px}.table{overflow:auto;max-width:100%}td,th{padding:8px}small{display:block}</style><div id="${prefix}instructor-students-summary"></div><div id="${prefix}instructor-course-filters"></div><div class="table" id="${prefix}instructor-students-table"></div><div id="${prefix}instructor-students-pagination"></div>`);
  await page.addScriptTag({content:`const Component=class {};const SidebarLayout={};const AdminService={};const authService={getCurrentUser:()=>({})};const ManagerService={instructorStudents:async()=>({data:{data:[{identification:'0000000001',name:'CLASE',course_name:'Moto',start_date:'2026-10-15',end_date:'2026-10-21',classes:5,attended:0,hours:0,schedule_time:'08:00 - 09:40',activity_type:'CLASS'},{identification:'0000000002',name:'EXAMEN',course_name:'Moto',start_date:'2026-10-15',end_date:'2026-10-21',classes:0,attended:0,hours:0,schedule_time:'18:30 - 18:50',activity_type:'EXAM_ONLY'}],courses:[],pagination:{page:1,total:2,totalPages:1}}})};${helper}\n${source}`});
  await page.evaluate(async()=>{const v=Object.create(window.View.prototype);v.selectedInstructor={id:'teacher'};v.instructorCourseId='';v.filters=typeof v.filters==='function'?()=>({}):{};await v.loadInstructorStudents(1);});
  const table=page.locator('#'+prefix+'instructor-students-table');
  assert.equal(await table.locator('tbody tr').count(),2);
  assert((await table.innerText()).includes('Formación intensiva'));
  assert((await table.innerText()).includes('18:30 - 18:50'));
  assert((await table.innerText()).includes('Del 15 al 21 de octubre'));
  assert(!(await table.innerText()).includes('2026'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`.tmp/instructor-report-${className}-${width}.png`,fullPage:true});
  await page.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
