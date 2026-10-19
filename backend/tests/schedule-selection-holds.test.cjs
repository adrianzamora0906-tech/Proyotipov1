const { test } = require('node:test');
const assert = require('node:assert/strict');
const Holds = require('../services/ScheduleSelectionHolds');
const slot = { instructorId:'3502fb7e-eb33-4338-9375-bc5701009367', cycleId:'646b0818-29bb-496c-a7f9-06fd85b6c9ee', date:'2026-10-19',start:'08:00',end:'09:40' };
test('examen separado de clase: admite dos examenes y rechaza el tercero',()=>{
 const holds=new Holds();assert(holds.replace('class',[slot]));
 const exam={...slot,mode:'exam_only'};
 assert(holds.replace('exam1',[exam]));assert(holds.replace('exam2',[exam]));
 assert.equal(holds.replace('exam3',[exam]),false);
 assert.equal(holds.replace('class2',[slot]),false);
 holds.replace('exam1',[]);assert(holds.replace('exam3',[exam]));
});
test('15 selecciones del mismo cupo: solo una obtiene la retencion', async () => {
  const holds = new Holds();
  const results = await Promise.all(Array.from({length:15}, (_,i) => Promise.resolve().then(() => holds.replace(i,[slot]))));
  assert.equal(results.filter(Boolean).length,1);
  assert.equal(holds.snapshot(0)[0].mine,true);
  assert.equal(holds.snapshot(1)[0].mine,false);
});
test('cancelar libera, renovar extiende y vencer permite otro usuario', () => {
  let now = 0;
  const holds = new Holds(() => now);
  holds.replace('a',[slot]); now = 60000; holds.replace('a',[slot]);
  now = 100000; assert.equal(holds.replace('b',[slot]),false);
  now = 160001; assert.equal(holds.replace('b',[slot]),true);
  holds.replace('b',[]); assert.equal(holds.replace('a',[slot]),true);
});
test('conflictos se comparan por instructor y solapamiento incluso entre ciclos', () => {
  const holds = new Holds(); holds.replace('a',[slot]);
  assert.equal(holds.replace('b',[{...slot,cycleId:'11111111-1111-1111-1111-111111111111',start:'09:00',end:'10:00'}]),false);
  assert.equal(holds.replace('b',[{...slot,start:'09:40',end:'11:20'}]),true);
});
test('reemplazo rechazado no pierde la seleccion anterior y valida mensajes', () => {
  const holds = new Holds(); holds.replace('a',[slot]);
  holds.replace('b',[{...slot,date:'2026-10-20'}]);
  assert.equal(holds.replace('b',[slot]),false);
  assert.equal(holds.snapshot('b').find(h => h.mine).slots[0].date,'2026-10-20');
  assert.throws(() => holds.replace('a',[{...slot,start:'25:00'}]));
  assert.throws(() => holds.replace('a',Array(33).fill(slot)));
});
