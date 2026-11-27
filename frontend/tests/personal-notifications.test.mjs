import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('avisos locales y remotos permanecen aislados entre sesiones del mismo navegador',async()=>{
  let current={userId:'alice'};
  const rows=[{id:'old',studentId:'student',read:false},{id:'bob-item',userId:'bob',studentId:'student',read:false}];
  const updates=[];
  const fixture={
    authService:{getCurrentUser:()=>current},
    storageService:{insert:(_,item)=>{const row={id:'alice-item',...item};rows.push(row);return row},findBy:(_,criteria)=>rows.filter(row=>Object.entries(criteria).every(([key,value])=>row[key]===value)),update:(_,id,value)=>{updates.push(id);return Object.assign(rows.find(row=>row.id===id),value)}},
    ApiService:{getNotifications:async()=>({success:true,data:[{id:'remote-alice',user_id:'alice',created_at:'2026-11-23'},{id:'remote-bob',user_id:'bob',created_at:'2026-11-23'},{id:'remote-old',user_id:null}]})},
  };
  globalThis.__personalNotificationFixture=fixture;
  try {
    let source=await fs.readFile(new URL('../src/js/services/NotificationService.js',import.meta.url),'utf8');
    source=source.replace(/^import .*;\r?$/gm,'');
    source='const {storageService,authService,ApiService}=globalThis.__personalNotificationFixture;\n'+source;
    const {default:Notifications}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
    Notifications.createNotification('student','Registro','Confirmado');
    assert.deepEqual(Notifications.getAllNotifications().map(row=>row.id),['alice-item']);
    assert.equal(Notifications.markAsRead('bob-item'),null);assert.equal(Notifications.markAsRead('old'),null);
    assert.deepEqual(updates,[]);
    assert.deepEqual((await Notifications.getPersonalNotifications()).map(row=>row.id).sort(),['alice-item','remote-alice']);
    current={userId:'bob'};
    assert.deepEqual(Notifications.getStudentNotifications('student').map(row=>row.id),['bob-item']);
    assert.equal(Notifications.markAsRead('alice-item'),null);
    fixture.ApiService.getNotifications=async()=>{current={userId:'alice'};return {success:true,data:[{id:'remote-bob',user_id:'bob'}]}};
    assert.deepEqual(await Notifications.getPersonalNotifications(),[]);
    current=null;assert.deepEqual(Notifications.getAllNotifications(),[]);assert.equal(Notifications.createNotification('student','x','x'),null);
  }finally{delete globalThis.__personalNotificationFixture;}
});
