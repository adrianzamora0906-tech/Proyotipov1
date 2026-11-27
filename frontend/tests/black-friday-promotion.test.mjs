import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const helper=await fs.readFile(new URL('../src/js/helpers/BlackFridayPromotion.js',import.meta.url),'utf8');
const {BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive}=await import('data:text/javascript;base64,'+Buffer.from(helper).toString('base64'));
for(const [time,active] of [['2026-11-26T23:59:59-05:00',false],['2026-11-27T00:00:00-05:00',true],['2026-11-28T23:59:59-05:00',true],['2026-11-29T00:00:00-05:00',true],['2026-11-29T23:59:59-05:00',true],['2026-11-30T00:00:00-05:00',false]])test('Vigencia visible '+time,()=>assert.equal(isBlackFridayPromotionActive(new Date(time)),active));
async function fixture(kind='carro'){
 const fields={benefit:'BLACK_FRIDAY',discount:{value:'0'},summary:{innerHTML:''},search:{value:'black'},benefitInput:{value:''},referrerInput:{value:''},selected:{hidden:true,innerHTML:''},results:{hidden:true,innerHTML:''}};let scheduled;
 const form={querySelector:selector=>selector==='[name="course_id"]'?{selectedOptions:[{dataset:{price:kind==='carro'?'190':'125',catalogType:kind}}]}:selector==='[name="discountBenefit"]'?{value:fields.benefit}:selector==='[name="discountAmount"]'?fields.discount:null};
 const nodes={'student-modal-form':form,'payment-registration-summary':fields.summary,'student-referrer-search':fields.search,'student-referrer-results':fields.results,'student-discount-benefit':fields.benefitInput,'student-referrer-id':fields.referrerInput,'student-referrer-selected':fields.selected};
 const dependencies={Component:class{},BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive:()=>isBlackFridayPromotionActive(new Date(fields.now||'2026-11-27T12:00:00-05:00')),isHalloweenPromotionActive:()=>false,StudentService:{searchReferralStaff:async()=>[]},document:{getElementById:id=>nodes[id]||null,querySelector:()=>({value:'regular'})},setTimeout:cb=>{scheduled=cb;return 1},clearTimeout:()=>{}};
 globalThis.__blackFridayFixture=dependencies;
 let source=await fs.readFile(new URL('../src/js/views/students/StudentsView.js',import.meta.url),'utf8');source=source.replace(/^import .*;\r?$/gm,'');source='const {Component,BLACK_FRIDAY_PRICES,isBlackFridayPromotionActive,isHalloweenPromotionActive,StudentService,document,setTimeout,clearTimeout}=globalThis.__blackFridayFixture;\n'+source;
 const {default:View}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')+'#'+kind+Math.random());
 return {view:new View(),fields,runSearch:()=>scheduled()};
}
for(const [kind,price] of [['carro','156.00'],['moto','100.00']])test('Resumen real del formulario: '+kind+' $'+price,async()=>{const {view,fields}=await fixture(kind);view.updateRegistrationPaymentSummary();assert(fields.summary.innerHTML.includes('$'+price));assert(fields.summary.innerHTML.includes('Black Friday'));assert.equal(Number(fields.discount.value),kind==='carro'?34:25)});
for(const [now,active] of [['2026-11-25T12:00:00-05:00',false],['2026-11-27T00:00:00-05:00',true],['2026-11-28T23:59:59-05:00',true],['2026-11-29T00:00:00-05:00',true],['2026-11-29T23:59:59-05:00',true],['2026-11-30T00:00:00-05:00',false]])test('Black Friday visible y seleccionable solo en vigencia '+now,async()=>{
 const {view,fields,runSearch}=await fixture();fields.now=now;
 view.scheduleReferralStaffSearch('black',0);await runSearch();
 assert(view.referralStaffResults.some(r=>r.discount_benefit==='BLACK_FRIDAY'));
 assert(fields.results.innerHTML.includes('Promo Black Friday'));
 assert(fields.results.innerHTML.includes('Moto $100'));
 assert(fields.results.innerHTML.includes('Carro $156'));
 assert.equal(/\bdisabled\b/.test(fields.results.innerHTML),!active);
 view.selectReferralStaff('benefit:BLACK_FRIDAY');
 assert.equal(fields.benefitInput.value,active?'BLACK_FRIDAY':'');
 assert.equal(fields.selected.hidden,!active);
});
test('una opcion abierta antes del vencimiento no puede seleccionarse despues',async()=>{
 const {view,fields,runSearch}=await fixture();fields.now='2026-11-29T23:59:59-05:00';view.scheduleReferralStaffSearch('black',0);await runSearch();assert(!fields.results.innerHTML.includes('disabled'));
 fields.now='2026-11-30T00:00:00-05:00';view.selectReferralStaff('benefit:BLACK_FRIDAY');assert.equal(fields.benefitInput.value,'');assert(fields.results.innerHTML.includes('disabled'));
});
test.after(()=>delete globalThis.__blackFridayFixture);
