import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../../backend/services/AdditionalPracticeService.js', import.meta.url), 'utf8');
const students = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');

test('horas practicas conserva el referido por cada contratacion', () => {
  assert.match(view, /staff-referral-field referral-eligible-field/);
  assert.match(view, /referred_by_user_id: formData\.get\('referredByUserId'\)/);
  assert.match(service, /referred_by_user_id\)/);
  assert.match(service, /ADDITIONAL_PRACTICE_CREATED/);
  assert.match(students, /'referred_by_name'/);
});
