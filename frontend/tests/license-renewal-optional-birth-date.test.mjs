import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('renovacion de licencia no exige fecha de nacimiento', () => {
  const modeStart = source.indexOf('async setRegistrationMode');
  const modeEnd = source.indexOf('\n  scheduleAdditionalPracticeResolution', modeStart);
  const modeFlow = source.slice(modeStart, modeEnd);
  assert.match(modeFlow, /setTemporaryReservationFieldsOptional\(isRenewal \|\| this\.temporaryReservationMode\)/);
  assert.match(source, /birthDate: temporaryReservation \|\| renewal \? \[\]/);
});
