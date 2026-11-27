import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function inboxFixture(user, status=200) {
 let calls=0;
 const source=fs.readFileSync(new URL('../src/js/services/PaymentVoidInbox.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export const paymentVoidInbox = new PaymentVoidInbox();','globalThis.inbox = new PaymentVoidInbox();');
 const result=async()=>{calls++;return {success:status===200,status,data:[]};};
 const context=vm.createContext({authService:{getCurrentUser:()=>user},ApiService:{getPendingPaymentVoidRequests:result,getMyReviewedPaymentVoidRequests:result},
  document:{getElementById:()=>null},window:{dispatchEvent(){}},CustomEvent:class{},Date});
 vm.runInContext(source,context);
 return {inbox:context.inbox,calls:()=>calls};
}
test('operador y cambio de clave pendiente no consultan anulaciones',async()=>{
 for(const user of [{userId:'operator',roles:['QUICK_REGISTRATION_OPERATOR']},{userId:'staff',mustChangePassword:true}]){
  const f=inboxFixture(user);await f.inbox.refresh();assert.equal(f.calls(),0);
 }
});
test('montajes repetidos no multiplican consultas de personal habitual',async()=>{
 const f=inboxFixture({userId:'staff',sessionId:'session'});
 await Promise.all(Array.from({length:50},()=>f.inbox.refresh()));
 await f.inbox.refresh();assert.equal(f.calls(),2);
});
test('403 detiene consultas de anulaciones para esa sesion',async()=>{
 const f=inboxFixture({userId:'staff',sessionId:'session'},403);
 await f.inbox.refresh();f.inbox.lastRefresh=0;
 await f.inbox.refresh();assert.equal(f.calls(),2);
});

function apiFixture(status){
 const source=fs.readFileSync(new URL('../src/js/core/api/ApiClient.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export const apiClient = new ApiClient();','globalThis.client = new ApiClient();').replace('export default ApiClient;','');
 const session={refreshToken:'synthetic',apiToken:'synthetic-access'};
 const context=vm.createContext({window:{__SPORTMANCAR_CONFIG__:{API_BASE_URL:'https://synthetic.invalid/api'},location:{hostname:'synthetic.invalid',origin:'https://synthetic.invalid'}},URL,
  sessionStorage:{getItem:()=>JSON.stringify(session)}});
 vm.runInContext(source,context);
 context.client.getHeaders=()=>({});
 context.client.fetchWithFallback=async endpoint=>({ok:false,status:endpoint==='/auth/refresh'?status:401});
 let expired=0;context.client.expireSession=()=>expired++;
 return {client:context.client,expired:()=>expired};
}
test('429 y 503 al renovar conservan la sesion',async()=>{
 for(const status of [429,503]){
  const f=apiFixture(status);await assert.rejects(f.client.request('GET','/protected'),e=>e.status===status);
  assert.equal(f.expired(),0);
 }
});
test('401 de renovacion sigue cerrando una sesion invalida',async()=>{
 const f=apiFixture(401);f.client.getHeaders=()=>({});
 await assert.rejects(f.client.request('GET','/protected'),e=>e.status===401);
 assert.equal(f.expired(),1);
});
