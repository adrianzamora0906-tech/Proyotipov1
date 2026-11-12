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
