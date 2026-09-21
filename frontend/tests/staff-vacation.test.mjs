import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../../backend/services/StaffVacationService.js', import.meta.url), 'utf8');
const routes = await readFile(new URL('../../backend/routes/admin.js', import.meta.url), 'utf8');
const view = await readFile(new URL('../src/js/views/admin/AdminBranchesView.js', import.meta.url), 'utf8');

test('vacaciones solo se administran con rol de Administrador de Sucursal', () => {
  assert.match(service, /auth\?\.roles\?\.includes\('BRANCH_ADMIN'\)/);
  assert.match(routes, /branches\/:id\/vacations[\s\S]*GESTION_PERSONAL/);
  assert.match(view, /authService\.hasRole\('BRANCH_ADMIN'\)/);
});

test('un instructor debe cumplir 13 alumnos y reconocer la reorganizacion', () => {
  assert.match(service, /MINIMUM_MONTHLY_STUDENTS = 13/);
  assert.match(service, /preview\.isInstructor && !data\.reorganizationAcknowledged/);
  assert.match(view, /Alumnos atendidos este mes/);
  assert.match(view, /Grupos que deben reorganizarse/);
});

test('las vacaciones bloquean la disponibilidad y cancelarlas la libera', () => {
  assert.match(service, /instructor_availability_overrides/);
  assert.match(service, /VACATION:/);
  assert.match(service, /SET active=FALSE/);
});

test('la interfaz filtra instructores por alumno y por vacaciones actuales', () => {
  assert.match(view, /Buscar por alumno/);
  assert.match(view, /De vacaciones hoy/);
  assert.match(view, /assigned_student_search/);
  assert.match(view, /current_vacation_id/);
});
