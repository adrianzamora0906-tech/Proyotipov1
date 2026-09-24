import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('curso normal exige todos los datos personales excepto referido', () => {
  assert.match(source, /name="email"[^>]*required/);
  assert.match(source, /name="phone"[^>]*required/);
  assert.match(source, /name="address"[^>]*required/);
  assert.match(source, /setNormalCourseRequiredFields\(!isRenewal && !isAdditionalPractice\)/);
  assert.match(source, /message: 'El email es requerido'/);
  assert.match(source, /message: 'El teléfono es requerido'/);
  assert.match(source, /message: 'La dirección es requerida'/);
});

test('la reserva solo vuelve opcionales nacimiento y sangre', () => {
  const start = source.indexOf('\n  setTemporaryReservationFieldsOptional');
  const end = source.indexOf('\n  setNormalCourseRequiredFields', start);
  const flow = source.slice(start, end);
  assert.match(flow, /\['birthDate', 'bloodType'\]/);
  assert.doesNotMatch(flow, /email|phone|address/);
});
