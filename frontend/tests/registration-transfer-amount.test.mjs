import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const frontendService = await readFile(new URL('../src/js/services/StudentService.js', import.meta.url), 'utf8');
const backendService = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');

test('secretaria debe registrar comprobante y valor de la transferencia', () => {
  assert.match(view, /id="student-transfer-reference-input"/);
  assert.match(view, /id="student-transfer-amount-input" type="number" min="0\.01"/);
  assert.match(view, /Ingresa el valor de la transferencia/);
  assert.match(frontendService, /registrationTransfer: studentData\.registrationTransfer \|\| null/);
});

test('la transferencia queda pendiente sin alterar el saldo', () => {
  assert.match(backendService, /transferAmount > finalCourseAmount/);
  assert.match(backendService, /INSERT INTO transfer_payment_verifications/);
  assert.match(backendService, /TRANSFER_VERIFICATION_CREATED/);
  assert.doesNotMatch(backendService, /registrationTransfer[\s\S]{0,300}UPDATE payments SET balance/);
});
