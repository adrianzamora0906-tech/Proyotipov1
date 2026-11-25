import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const helper=await fs.readFile(new URL('../src/js/helpers/BlackFridayPromotion.js',import.meta.url),'utf8');
const {BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
for(const [time,active] of [['2026-11-26T23:59:59-05:00',false],['2026-11-27T00:00:00-05:00',true],['2026-11-28T23:59:59-05:00',true],['2026-11-29T00:00:00-05:00',false]])test('Vigencia visible '+time,()=>assert.equal(isBlackFridayPromotionActive(new Date(time)),active));
async function fixture(kind='carro'){
 const fields={benefit:'BLACK_FRIDAY',discount:{value:'0'},summary:{innerHTML:''},search:{value:'black'}};let scheduled;
 const form={querySelector:selector=>selector==='[name="course_id"]'?{selectedOptions:[{dataset:{price:kind==='carro'?'190':'125',catalogType:kind}}]}:selector==='[name="discountBenefit"]'?{value:fields.benefit}:selector==='[name="discountAmount"]'?fields.discount:null};
 const nodes={'student-modal-form':form,'payment-registration-summary':fields.summary,'student-referrer-search':fields.search,'student-referrer-results':{}};
 const dependencies={Component:class{},BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive:()=>isBlackFridayPromotionActive(new Date(fields.now||'2026-11-27T12:00:00-05:00')),isHalloweenPromotionActive:()=>false,StudentService:{searchReferralStaff:async()=>[]},document:{getElementById:id=>nodes[id]||null,querySelector:()=>({value:'regular'})},setTimeout:cb=>{scheduled=cb;return 1},clearTimeout:()=>{}};
 globalThis.__blackFridayFixture=dependencies;
 let source=await fs.readFile(new URL('../src/js/views/students/StudentsView.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?$/gm,'');source='const {Component,BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive,isHalloweenPromotionActive,StudentService,document,setTimeout,clearTimeout}=globalThis.__blackFridayFixture;\n'+source;
 const {default:View}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+kind+Math.random());
 return {view:new View(),fields,runSearch:()=>scheduled()};
}
for(const [kind,price] of [['carro','156.00'],['moto','100.00']])test('Resumen real del formulario: '+kind+' $'+price,async()=>{const {view,fields}=await fixture(kind);view.updateRegistrationPaymentSummary();assert(fields.summary.innerHTML.includes('$'+price));assert(fields.summary.innerHTML.includes('Black Friday'));assert.equal(Number(fields.discount.value),kind==='carro'?34:25)});
for(const [now,expected] of [['2026-11-25T12:00:00-05:00',false],['2026-11-27T12:00:00-05:00',true],['2026-11-28T12:00:00-05:00',true],['2026-11-29T12:00:00-05:00',false]])test('Busqueda de promociones '+now,async()=>{const {view,fields,runSearch}=await fixture();fields.now=now;let result;view.renderReferralStaffResults=rows=>{result=rows};view.scheduleReferralStaffSearch('black',0);await runSearch();assert.equal(result.some(r=>r.discount_benefit==='BLACK_FRIDAY'),expected)});
test.after(()=>delete globalThis.__blackFridayFixture);
