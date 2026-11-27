import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

let source=await readFile(new URL('../src/js/services/RegistrationUploadQueue.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\r?$/gm,'');
const {RegistrationUploadQueue}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
function fixture(upload) {
  const rows=new Map(), notices=[], errors=[];
  const store={list:async()=>structuredClone([...rows.values()]),put:async job=>rows.set(job.id,structuredClone(job)),remove:async id=>rows.delete(id)};
  const queue=new RegistrationUploadQueue({store,upload,user:()=> 'owner',notify:job=>notices.push(structuredClone(job)),onError:job=>errors.push(structuredClone(job))});
  return {queue,rows,store,notices,errors};
}
const draft={studentId:'student',studentName:'Alumno de prueba',tasks:[{type:'cedula',name:'Cedula',source:new Blob(['fixture'])},{type:'certificado_bachiller',name:'Bachiller',cedulaIndicatesBachiller:true}]};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('encola archivos duraderos sin esperar la red y conserva orden de cedula y bachiller',async()=>{
  let release;const calls=[];
  const f=fixture(async(_,task)=>{calls.push(task.type);if(calls.length===1)await new Promise(resolve=>release=resolve)});
  const id=await f.queue.enqueue(draft);
  assert.equal(f.rows.size,1);assert.equal(calls.length,0);
  assert((await f.store.list())[0].tasks[0].source instanceof Blob);
  const operation=f.queue.run(id);await tick();
  assert.deepEqual(calls,['cedula']);
  assert.equal(f.rows.size,1);
  release();await operation;
  assert.deepEqual(calls,['cedula','certificado_bachiller']);
  assert.equal(f.rows.size,0);assert.equal(f.notices.at(-1).status,'complete');assert.equal(f.errors.length,0);
});
test('fallo conserva archivos y reintento no repite documentos confirmados',async()=>{
  let fail=true;const calls=[];
  const f=fixture(async(_,task)=>{calls.push(task.type);if(task.type==='certificado_bachiller'&&fail)throw Error('Sin conexion')});
  const id=await f.queue.enqueue(draft);await f.queue.run(id);
  assert.equal(f.errors.length,1);assert.deepEqual(f.rows.get(id).done,[0]);assert.equal(f.rows.get(id).status,'error');
  fail=false;await f.queue.retry(id);
  for(let n=0;n<20&&f.queue.running.size;n++)await tick();
  assert.deepEqual(calls,['cedula','certificado_bachiller','certificado_bachiller']);
  assert.equal(f.rows.size,0);assert.equal(f.notices.at(-1).status,'complete');
});
test('otra instancia recupera una carga tras recarga; otra cuenta no puede enviarla',async()=>{
  const calls=[];const f=fixture(async()=>{});
  const id=await f.queue.enqueue(draft);
  const other=new RegistrationUploadQueue({store:f.store,user:()=> 'other',upload:async()=>calls.push('other'),notify:()=>{},onError:()=>{}});
  await other.run(id);assert.deepEqual(calls,[]);assert.equal(f.rows.size,1);
  await assert.rejects(other.enqueue({...draft,userId:'owner'}),/sesion cambio/);
  const recovered=new RegistrationUploadQueue({store:f.store,user:()=> 'owner',upload:async(_,task)=>calls.push(task.type),notify:()=>{},onError:()=>{}});
  await recovered.run(id);assert.equal(f.rows.size,0);assert.deepEqual(calls,['cedula','certificado_bachiller']);
});
test('un cambio de usuario detiene los siguientes archivos y evita dos envios del mismo trabajo',async()=>{
  let user='owner',release;const calls=[];
  const f=fixture(async(_,task)=>{calls.push(task.type);await new Promise(resolve=>release=resolve)});
  f.queue.user=()=>user;
  const id=await f.queue.enqueue(draft);
  const operation=f.queue.run(id);await tick();await f.queue.run(id);
  assert.equal(calls.length,1);user='other';release();await operation;
  assert.deepEqual(calls,['cedula']);assert.deepEqual(f.rows.get(id).done,[0]);
});
test('si no se puede conservar la cola no se informa una carga iniciada',async()=>{
  const f=fixture(async()=>{});f.store.put=async()=>{throw Error('Sin espacio')};
  await assert.rejects(f.queue.enqueue(draft),/Sin espacio/);assert.equal(f.notices.length,0);
});
