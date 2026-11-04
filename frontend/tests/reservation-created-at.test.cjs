const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/js/views/students/StudentsView.js'),'utf8');
const methods=source.slice(source.indexOf('  formatReservationCreatedAt('),source.indexOf('  getResultCountLabel('));
const view=vm.runInNewContext(`new (class {${methods}})()`,{Intl,Date,escapeHtml:v=>String(v),DateHelper:{format:()=> '04/11/2026'}});
test('Reserva muestra fecha y hora de creacion en Ecuador, independiente del inicio del curso',()=>{
 const date=view.formatReservationCreatedAt('2026-10-30T02:17:00.000Z');
 assert(date.includes('29/10/2026'));assert(date.includes('21:17'));
 assert.equal(view.formatReservationCreatedAt(null),'Sin registro');
 assert.equal(view.formatReservationCreatedAt('invalida'),'Sin registro');
 view.getInitials=()=> 'PR';
 const html=view.renderReservationRows([{name:'Persona',created_at:'2026-10-30T02:17:00.000Z',created_by_name:'Secretaria',start_date:'2026-11-04',id:'r'}]);
 assert(!html.includes('Fecha y hora de reserva:'));assert(html.includes('21:17'));assert(html.includes('04/11/2026'));
});
test('Listado paginado conserva created_at original de la reserva',()=>{
 const backend=fs.readFileSync(path.join(__dirname,'../../backend/services/StudentService.js'),'utf8');
 assert.match(backend,/SELECT id,name,identification,phone,created_at,created_by_name/);
});
