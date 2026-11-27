import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const start = source.indexOf('  mergeEnrollmentSchedules(');
const end = source.indexOf('  async reloadModalSchedules(', start);
const view = vm.runInNewContext(`({${source.slice(start, end)}})`);

const base = [
  { cycleId: 'benito', time: '10', startDate: '2026-11-11', instructors: [{ id: 'b' }] },
  { cycleId: 'francisco', time: '10', startDate: '2026-11-12', instructors: [{ id: 'f' }] },
];
const selected = [
  { ...base[0], startDate: '2026-11-09' },
  { ...base[1], startDate: '2026-11-09' },
  { cycleId: 'antonio', time: '10', startDate: '2026-11-16', instructors: [{ id: 'a' }] },
];

test('la seleccion automatica no altera ni agrega ciclos de otros instructores', () => {
  const merged = view.mergeEnrollmentSchedules(base, selected, 'b');
  assert.equal(merged.length, 2);
  assert.equal(merged[0].startDate, '2026-11-09');
  assert.equal(merged[1].startDate, '2026-11-12');
  assert.equal(merged[1].instructors[0].id, 'f');
});

test('una seleccion explicita de instructor referido conserva los ciclos compatibles', () => {
  const merged = view.mergeEnrollmentSchedules(base, selected, 'b', true);
  assert.equal(merged.length, 3);
  assert.equal(merged[1].startDate, '2026-11-09');
  assert.equal(merged[2].cycleId, 'antonio');
});

test('un ciclo compartido usa la lista actual de instructores y los cupos del seleccionado', () => {
  const cached = [{ cycleId: 'shared', time: '16:00 - 17:40', instructors: [{ id: 'dario' }],
    available: 0, availabilityByDate: { '2026-11-30': { available: 0, occupied: 1 } } }];
  const fresh = [{ ...cached[0], instructors: [{ id: 'dario' }, { id: 'benito' }],
    available: 1, availabilityByDate: { '2026-11-30': { available: 1, occupied: 0 } } }];
  const merged = view.mergeEnrollmentSchedules(cached, fresh, 'benito');
  assert.equal(merged[0].available, 1);
  assert.equal(merged[0].availabilityByDate['2026-11-30'].occupied, 0);
  assert(merged[0].instructors.some(instructor => instructor.id === 'benito'));
  assert.equal(cached[0].available, 0);
  assert.equal(cached[0].instructors.length, 1);
});

test('una respuesta actual vacia de instructores no recupera los retirados de la cache', () => {
  const merged = view.mergeEnrollmentSchedules(
    [{ cycleId: 'shared', time: '16', instructors: [{ id: 'retired' }] }],
    [{ cycleId: 'shared', time: '16', instructors: [], available: 0 }], 'benito', true);
  assert.equal(merged[0].instructors.length, 0);
});
