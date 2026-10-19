const {test}=require('node:test');
const assert=require('node:assert/strict');
const dbPath=require.resolve('../config/database');
let result=[],call;
require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{query:async(sql,params)=>{call={sql,params};return {rows:result};}}};
const Receipts=require('../services/ReceiptService');
const fixture={id:'transfer',receipt_number:'TR-transfer',studentName:'Prueba <script>',amount:165,payment_method:'transferencia',reference:'ABC<123',created_at:'2026-10-16T15:00:00Z'};
test('constancia no afirma pago ni saldo reducido y contiene leyenda tributaria',()=>{
 const html=Receipts.renderHTML({...fixture,pending_transfer:true});
 assert(html.includes('CONSTANCIA DE TRANSFERENCIA PENDIENTE'));
 assert(html.includes('No acredita un pago confirmado ni reduce el saldo'));
 assert(html.includes('Este documento no tiene validez tributaria.'));
 assert(!html.includes('Valor pagado'));assert(!html.includes('Gracias por su pago'));
 assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));
});
test('comprobantes confirmados de curso o servicio mantienen importe y leyenda tributaria',()=>{
 const html=Receipts.renderHTML({...fixture,balance:25});
 assert(html.includes('COMPROBANTE DE PAGO'));assert(html.includes('Valor pagado'));
 assert(html.includes('$25.00'));assert(html.includes('Este documento no tiene validez tributaria.'));
});
test('lectura pendiente restringida a global, sucursal o creador y excluye rechazadas/aplicadas',async()=>{
 result=[fixture];const html=await Receipts.getTransferPrintHTML('transfer',{id:'operator',branch_id:'home'},{permissions:['PAYMENT_VIEW'],operationalCoverage:{operational_branch_id:'cover'}});
 assert(html.includes('CONSTANCIA'));assert.deepEqual(call.params,['transfer',false,'cover','operator',true]);
 assert(call.sql.includes("tv.status IN ('PENDING','AWAITING_APPROVAL')"));
 assert(call.sql.includes('tv.created_by=$4::uuid'));assert(!/\b(UPDATE|INSERT|DELETE)\b/.test(call.sql));
 result=[];await assert.rejects(Receipts.getTransferPrintHTML('other',{id:'operator'},{}),/no disponible/);
});
test('secretaria sin caja solo accede por ser creadora, no a todas las transferencias de la sucursal',async()=>{
 result=[fixture];await Receipts.getTransferPrintHTML('transfer',{id:'secretary',branch_id:'branch'},{permissions:['STUDENT_CREATE']});
 assert.deepEqual(call.params,['transfer',false,'branch','secretary',false]);
 assert(call.sql.includes('($5::boolean AND tv.branch_id=$3::uuid)'));
 assert(call.sql.includes('tv.created_by=$4::uuid'));
});
