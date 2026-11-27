import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/js/core/realtime/RealtimeClient.js',import.meta.url),'utf8')
  .replace(/^import .*;\r?\n/gm,'').replace('export const realtimeClient = new RealtimeClient();','globalThis.client = new RealtimeClient();').replace('export function subscribeRealtime','function subscribeRealtime');
function fixture(roles){let connections=0,refreshes=0,expirations=0;const timers=[];
 const context=vm.createContext({sessionStorage:{getItem:()=>JSON.stringify({roles})},navigator:{onLine:true},
 apiClient:{getToken:()=> 'synthetic-token',getBaseUrls:()=>['https://synthetic.invalid/api'],tryRefresh:async()=>{refreshes++;return false;},expireSession:()=>expirations++},
 secureRealtimeUrl:()=> 'wss://synthetic.invalid',WebSocket:class{constructor(){connections++;}close(){}},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},console});
 vm.runInContext(source,context);return {client:context.client,counts:()=>({connections,refreshes,expirations})};
}
test('operador no abre realtime ni provoca refresh o cierre de sesion',()=>{const f=fixture(['QUICK_REGISTRATION_OPERATOR']);f.client.syncSession();f.client.connect();assert.deepEqual(f.counts(),{connections:0,refreshes:0,expirations:0});});
test('personal habitual conserva conexion realtime',()=>{const f=fixture(['SECRETARY']);f.client.syncSession();assert.equal(f.counts().connections,1);});
test('operador desconecta socket previo sin ejecutar su manejador de cierre',()=>{const f=fixture(['QUICK_REGISTRATION_OPERATOR']);let closed=false;f.client.socket={close(){closed=true;}};f.client.syncSession();assert.equal(closed,true);assert.equal(f.client.socket,null);assert.equal(f.counts().expirations,0);});
