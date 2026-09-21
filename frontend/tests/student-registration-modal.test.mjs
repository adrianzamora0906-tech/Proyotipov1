import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const submitStart = source.indexOf('async handleStudentSubmit(event)');
const submitEnd = source.indexOf('async handleTemporaryReservationSubmit', submitStart);
const submitFlow = source.slice(submitStart, submitEnd);

test('el modal de Nuevo Estudiante se cierra al confirmar el horario', () => {
  assert.notEqual(submitStart, -1, 'No se encontró handleStudentSubmit');
  assert.notEqual(submitEnd, -1, 'No se pudo delimitar el flujo de matrícula');

  const scheduleConfirmed = submitFlow.indexOf('await this.selectStudentSchedule(student.id, scheduleId, schedulePlan)');
  const modalClosed = submitFlow.indexOf('this.closeStudentModal();', scheduleConfirmed);
  const paymentContinues = submitFlow.indexOf('if (shouldCollectPayment) {', modalClosed);

  assert.ok(scheduleConfirmed >= 0, 'Debe confirmarse el horario antes de terminar la matrícula');
  assert.ok(modalClosed > scheduleConfirmed, 'El modal debe cerrarse inmediatamente después de confirmar el horario');
  assert.ok(paymentContinues > modalClosed, 'El cierre no debe depender del cobro ni de tareas posteriores');
});

test('las notificaciones locales no pueden impedir el cierre del modal', () => {
  assert.match(submitFlow, /try\s*\{\s*NotificationService\.createNotification\(/s);
  const selectStart = source.indexOf('async selectStudentSchedule(studentId');
  const selectEnd = source.indexOf('showModalAlert(type, message)', selectStart);
  const scheduleFlow = source.slice(selectStart, selectEnd);
  assert.match(scheduleFlow, /try\s*\{\s*NotificationService\.notifyScheduleSelected\(studentId\);\s*\}\s*catch/s);
});

test('el filtro de estudiantes inicia con todas las sucursales del cantón', () => {
  assert.match(source, /else if \(!queryParams\.get\('branch_id'\)\) listParams\.scope = 'all'/);
  assert.match(source, /const activeStudentFilter = !queryParams\.get\('branch_id'\)/);
});

test('la sucursal de la sesión se ordena primero sin limitar el alcance cantonal', () => {
  assert.match(source, /cantonBranches\.sort/);
  assert.match(source, /String\(first\.id\) === String\(currentBranchRecord\?\.id\)/);
  assert.match(source, /const belongsToCurrentBranch = student/);
  assert.match(source, /student\.branchId/);
});

test('cerrar el modal descarta todos los datos y horarios seleccionados', () => {
  const closeStart = source.indexOf('\n  closeStudentModal() {');
  const closeEnd = source.indexOf('scheduleReferralStaffSearch', closeStart);
  const closeFlow = source.slice(closeStart, closeEnd);

  assert.notEqual(closeStart, -1, 'No se encontró closeStudentModal');
  assert.match(closeFlow, /REGLA PROTEGIDA: cerrar el modal siempre descarta el borrador completo/);
  assert.match(closeFlow, /form\?\.reset\(\)/);
  assert.match(closeFlow, /querySelectorAll\('select'\)/);
  assert.match(closeFlow, /form\.elements\.scheduleId\.value = ''/);
  assert.match(closeFlow, /form\.elements\.schedulePlan\.value = ''/);
  assert.match(closeFlow, /this\.resetCalendarSelection\(calendar\)/);
  assert.match(closeFlow, /set\.dataset\.activeCycleIndex = '0'/);
});
