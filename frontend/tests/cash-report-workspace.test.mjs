import {test,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {isCashReportUser,reportPermission} from '../src/js/helpers/ReportAccess.js';
const require=createRequire(process.env.FRONTEND_TEST_DEPENDENCY_MANIFEST || new URL('../../frontend-react/package.json',import.meta.url));
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<!doctype html><body></body>',{url:'http://localhost/'});
Object.assign(globalThis,{window:dom.window,document:dom.window.document,FormData:dom.window.FormData,sessionStorage:dom.window.sessionStorage,localStorage:dom.window.localStorage});
dom.window.HTMLAnchorElement.prototype.click=function(){};
const {CashReportsPanel}=await import('../src/js/helpers/CashSalesReportModal.js');
const {apiClient}=await import('../src/js/core/api/ApiClient.js');
let requests=[],downloads=[],panels=[];
const branch='11111111-1111-4111-8111-111111111111';
const row=(id,extra={})=>({id,record_date:'2026-11-27',identification:'0123456789',student_name:'Cliente '+id,branch:'Sucursal',course:'Moto',amount:100,discount:25,paid:60,balance:40,promotion:'Black Friday',promotion_key:'BLACK_FRIDAY',payment_methods:'Efectivo',registered_by:'Caja',...extra});
const report=(rows=[row('bf')])=>({rows,totals:{records:rows.length,paid:rows.length*60,amount:rows.length*100,balance:rows.length*40,withoutAccount:0},options:{branches:[{id:branch,name:'Sucursal'}],promotions:[{value:'BLACK_FRIDAY',label:'Black Friday'},{value:'NONE',label:'Sin promoción'}]}});
beforeEach(()=>{panels.forEach(p=>p.unmount());panels=[];requests=[];downloads=[];document.body.innerHTML='';apiClient.get=async url=>{requests.push(url);return{success:true,data:report()};};apiClient.downloadGet=async url=>{downloads.push(url);return{blob:new Blob(['xlsx']),filename:'caja.xlsx'};};});
after(()=>{panels.forEach(p=>p.unmount());dom.window.close();});
async function open(){const panel=new CashReportsPanel();panels.push(panel);document.body.innerHTML=panel.render();await panel.mount();return panel;}

test('Caja usa PAYMENT_VIEW y no cambia los permisos de gerencia, admin o secretaria',()=>{
 assert(isCashReportUser({role:'caja'}));assert(isCashReportUser({role:'secretaria_caja'}));assert(isCashReportUser({roles:['CASHIER']}));assert.equal(reportPermission({role:'caja'}),'PAYMENT_VIEW');
 for(const user of[{role:'secretaria_sucursal'},{role:'caja',roles:['GENERAL_MANAGER']},{role:'caja',roles:['ADMIN_SYSTEM']}]){assert(!isCashReportUser(user));assert.equal(reportPermission(user),'REPORT_VIEW');}
});
test('la vista existente de Caja renderiza solamente el panel financiero',async()=>{
 let user={role:'caja',permissions:['PAYMENT_VIEW']};
 const fixture={Component:class{unmount(){}},SidebarLayout:{render:async html=>html},AdminService:{universalReport:()=>{throw Error('No consultar academia');}},ManagerService:{},authService:{getCurrentUser:()=>user},isCashReportUser,CashReportsPanel};
 globalThis.__cashReportFixture=fixture;
 let source=await fs.readFile(new URL('../src/js/views/manager/ManagerReportsView.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?$/gm,'');
 const {default:View}=await import('data:text/javascript;base64,'+Buffer.from('const {Component,SidebarLayout,AdminService,ManagerService,authService,isCashReportUser,CashReportsPanel}=globalThis.__cashReportFixture;\n'+source).toString('base64'));
 const view=new View();panels.push(view.cashReports);const html=await view.render();document.body.innerHTML=html;await view.mount();
 assert.match(html,/Reportes de Caja/);assert(!html.includes('report-question-input'));assert(!html.includes('Actividad de instructores'));assert(!html.includes('Estudiantes activos'));assert(requests.every(url=>url.startsWith('/payments/sales-report?')));
 user={role:'secretaria_sucursal',roles:[],permissions:['REPORT_VIEW']};const other=new View();assert.equal(other.cashReports,null);assert.match(await other.render(),/report-question-input/);
 view.unmount();delete globalThis.__cashReportFixture;
});
test('promocion actualiza automaticamente e invalida la exportacion anterior al instante',async()=>{
 const panel=await open();const field=panel.form.elements.namedItem('promotion');field.value='BLACK_FRIDAY';field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));field.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert(panel.exportButton.disabled);assert.equal(panel.ready,null);await panel.export();assert.equal(downloads.length,0);
 await new Promise(resolve=>setTimeout(resolve,220));assert.equal(new URL(requests.at(-1),'http://local').searchParams.get('promotion'),'BLACK_FRIDAY');
 await panel.export();const exported=new URL(downloads[0],'http://local').searchParams;assert.equal(exported.get('promotion'),'BLACK_FRIDAY');assert.equal(exported.get('type'),'sales');assert.equal(exported.get('from'),panel.form.elements.namedItem('from').value);
});
test('una respuesta o error anterior no reemplaza filtros mas recientes',async()=>{
 const panel=await open();let rejectOld,resolveNew;
 apiClient.get=()=>new Promise((resolve,reject)=>{if(!rejectOld)rejectOld=reject;else resolveNew=resolve;});
 panel.invalidate();const old=panel.load();panel.invalidate();const latest=panel.load();resolveNew({success:true,data:report([row('nuevo')])});await latest;rejectOld(Error('error anterior'));await old;
 assert.match(document.getElementById('cash-report-body').textContent,/nuevo/);assert(!panel.status.textContent.includes('error anterior'));assert(panel.ready);
});
test('paginacion, vacio y texto escapado se mantienen dentro del reporte de Caja',async()=>{
 apiClient.get=async()=>({success:true,data:report(Array.from({length:25},(_,i)=>row(String(i),{student_name:'<img src=x onerror=alert(1)>'+i})))});
 const panel=await open();assert.equal(document.querySelectorAll('#cash-report-body tr').length,20);assert.equal(document.querySelectorAll('#cash-report-body img').length,0);
 document.querySelector('[data-cash-page="2"]').click();assert.equal(document.querySelectorAll('#cash-report-body tr').length,5);
 apiClient.get=async()=>({success:true,data:report([])});panel.invalidate();await panel.load();assert.match(panel.status.textContent,/No hay registros/);assert(panel.exportButton.disabled);
});
test('cobros no muestran columnas academicas ni sumas de saldos por movimiento',async()=>{
 const panel=await open();document.querySelector('[data-cash-report="collections"]').click();await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(panel.type,'collections');const head=document.getElementById('cash-report-head').textContent;
 assert.match(head,/Comprobante/);assert(!/Instructor|Horario|Saldo pendiente|Matriculado/.test(head));
 assert(!document.getElementById('cash-report-totals').textContent.includes('Saldo pendiente'));
 let resolve;apiClient.get=()=>new Promise(r=>resolve=r);const pending=panel.load();panel.unmount();resolve({success:true,data:report([row('tardio')])});await pending;assert(!document.getElementById('cash-report-body').textContent.includes('tardio'));
});
