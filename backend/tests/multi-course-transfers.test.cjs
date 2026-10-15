const assert=require('node:assert/strict');
const {test}=require('node:test');
let calls,ambiguous,applied;
const client={release(){},query:async(sql,values)=>{
 calls.push({sql,values});
 if(sql.startsWith('SELECT e.id,e.student_id'))return {rows:ambiguous?[{id:'auto'},{id:'moto'}]:[{id:'moto',student_id:'student',branch_id:'branch'}]};
 if(sql.startsWith('SELECT p.balance'))return {rows:[{balance:125}]};
 if(sql.includes('COALESCE(SUM(amount)'))return {rows:[{total:0}]};
 if(sql.startsWith('INSERT INTO transfer_payment_verifications'))return {rows:[{id:'transfer'}]};
 if(sql.includes('SELECT tv.*,s.identification'))return {rows:[{id:'transfer',student_id:'student',identification:'1234567890',enrollment_id:'moto',branch_id:'branch',status:'AWAITING_APPROVAL',reviewed_by:'another',amount:25,reference:'ref'}]};
 if(sql.startsWith('UPDATE transfer_payment_verifications SET status='))return {rows:[{id:'transfer',status:'CONFIRMED'}]};
 return {rows:[]};
}};
const dbPath=require.resolve('../config/database');require.cache[dbPath]={id:dbPath,filename:dbPath,loaded:true,exports:{getClient:async()=>client}};
for(const [name,exports] of [['PaymentService',{registerPayment:async data=>{applied=data;return {payment:{id:'payment'}};}}],['AuditService',{log:async()=>{}}]]){
 const id=require.resolve(`../services/${name}`);require.cache[id]={id,filename:id,loaded:true,exports};
}
const Cash=require('../services/CashOperationsService');
const actor={id:'cashier',role:'caja',branch_id:'branch'};
test('transferencia queda vinculada a la matricula seleccionada',async()=>{
 calls=[];ambiguous=false;
 await Cash.createTransfer({studentId:'student',enrollmentId:'moto',amount:25,reference:'ref',transferDate:'2026-10-15'},actor,{branchId:'branch'},{});
 const selected=calls.find(c=>c.sql.startsWith('SELECT e.id,e.student_id'));assert.equal(selected.values[2],'moto');
 const insert=calls.find(c=>c.sql.startsWith('INSERT INTO transfer_payment_verifications'));assert.equal(insert.values[9],'moto');
 assert(calls.some(c=>c.sql==='COMMIT'));
});
test('transferencia ambigua se rechaza sin insertar',async()=>{
 calls=[];ambiguous=true;
 await assert.rejects(Cash.createTransfer({studentId:'student',amount:25,reference:'ref',transferDate:'2026-10-15'},actor,{branchId:'branch'},{}),/Selecciona la matricula/);
 assert(!calls.some(c=>c.sql.startsWith('INSERT')));assert(calls.some(c=>c.sql==='ROLLBACK'));
});
test('aprobar conserva el destino de la transferencia',async()=>{
 calls=[];applied=null;Cash.transferBranch=async()=> 'branch';
 await Cash.reviewTransfer('transfer','APPROVED',null,actor,{branchId:'branch',permissions:['TRANSFER_APPROVE'],transferApproval:true},{});
 assert.equal(applied.enrollmentId,'moto');assert.equal(applied.amount,25);
});
