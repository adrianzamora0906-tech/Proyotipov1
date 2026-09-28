import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const frontendService = await readFile(new URL('../src/js/services/StudentService.js', import.meta.url), 'utf8');
const backendService = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');
const controller = await readFile(new URL('../../backend/controllers/studentController.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../backend/migrations/enterprise/094_student_pickup_branch.sql', import.meta.url), 'utf8');

test('Datos muestra Recoger en después del tipo de sangre y lo exige en curso normal', () => {
  const bloodType = view.indexOf('name="bloodType"');
  const pickup = view.indexOf('name="pickupBranchId"');
  assert.ok(bloodType >= 0 && pickup > bloodType);
  assert.match(view, /for="student-pickup-branch">Recoger en/);
  assert.match(view, /pickupBranchId: additionalPractice \|\| renewal \? \[\] : \[\{ type: 'required'/);
});

test('tipo de sangre y comprobante comparten una fila responsiva de dos columnas', () => {
  const rowStart = view.indexOf('student-blood-transfer-row');
  const rowEnd = view.indexOf('</div>\n\n                  <div class="form-group">', rowStart);
  const row = view.slice(rowStart, rowEnd);
  assert.match(row, /name="bloodType"/);
  assert.match(row, /id="student-transfer-payment"/);
  assert.match(row, /id="student-transfer-reference" hidden/);
});

test('Recoger en inicia con la sucursal efectiva de la sesión y se envía al servidor', () => {
  assert.match(view, /pickupBranchSelect\.value = sessionBranchId/);
  assert.match(view, /pickupBranches = sessionBranch\?\.city_id/);
  assert.match(view, /branches\.filter\(branch => String\(branch\.city_id\) === String\(sessionBranch\.city_id\)\)/);
  assert.match(view, /pickupBranchId: formData\.get\('pickupBranchId'\)/);
  assert.match(frontendService, /pickupBranchId: studentData\.pickupBranchId \|\| null/);
  assert.match(controller, /pickupBranchId: req\.body\.pickupBranchId \|\| effectiveBranchId\(req\)/);
});

test('el servidor guarda y devuelve la sucursal de recogida', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS pickup_branch_id UUID REFERENCES branches\(id\)/);
  assert.match(backendService, /pickup\.name as pickup_branch_name/);
  assert.match(backendService, /pickupBranchId: 'pickup_branch_id'/);
  assert.match(backendService, /Selecciona una sucursal válida para recoger al estudiante/);
});
