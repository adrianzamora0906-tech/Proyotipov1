import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('fecha de nacimiento y tipo de sangre son opcionales solo durante la reserva', () => {
  const toggleStart = source.indexOf('\n  toggleTemporaryReservationMode() {');
  const toggleEnd = source.indexOf('\n  setTemporaryReservationFieldsOptional', toggleStart);
  const toggleFlow = source.slice(toggleStart, toggleEnd);
  const optionalStart = toggleEnd;
  const optionalEnd = source.indexOf('\n  getStudentModalLastStep', optionalStart);
  const optionalFlow = source.slice(optionalStart, optionalEnd);

  assert.match(toggleFlow, /setTemporaryReservationFieldsOptional\(this\.temporaryReservationMode\)/);
  assert.match(optionalFlow, /\['birthDate', 'bloodType'\]/);
  assert.match(optionalFlow, /input\.required = !optional/);
  assert.match(optionalFlow, /classList\.toggle\('required', !optional\)/);
  assert.match(source, /this\.setTemporaryReservationFieldsOptional\(false\)/);
});
