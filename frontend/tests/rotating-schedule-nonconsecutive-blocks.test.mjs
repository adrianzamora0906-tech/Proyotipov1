import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const studentsView = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const cycleService = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('el horario rotativo permite dos bloques no consecutivos el mismo dia', () => {
  assert.match(studentsView, /Puedes variar el horario por día y tomar hasta dos bloques/);
  assert.doesNotMatch(studentsView, /areConsecutiveScheduleOptions/);
  assert.doesNotMatch(studentsView, /los dos bloques del día deben ser consecutivos/);

  const start = cycleService.indexOf('static async reserveSchedule');
  const end = cycleService.indexOf('static async ', start + 1);
  const reservationFlow = cycleService.slice(start, end === -1 ? undefined : end);

  assert.notEqual(start, -1, 'No se encontro reserveSchedule');
  assert.match(reservationFlow, /daySelections\.length > 2/);
  assert.doesNotMatch(reservationFlow, /los dos bloques del dia deben ser consecutivos/);
});
