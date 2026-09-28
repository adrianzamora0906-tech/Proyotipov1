import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const frontend = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const backend = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('la activacion consulta la disponibilidad excluyendo su propia reserva', () => {
  const reloadStart = frontend.indexOf('async reloadModalSchedules');
  const reloadEnd = frontend.indexOf('\n  renderScheduleCalendar', reloadStart);
  const reloadFlow = frontend.slice(reloadStart, reloadEnd);
  const activationStart = frontend.indexOf('async openReservationActivation');
  const activationEnd = frontend.indexOf('\n  selectReservedSchedule', activationStart);
  const activationFlow = frontend.slice(activationStart, activationEnd);

  assert.match(reloadFlow, /activationReservationId/);
  assert.match(reloadFlow, /reservation_id:\s*activationReservationId/);
  assert.match(activationFlow, /reservationId:\s*reservation\.id/);
  assert.match(backend, /o\.reason NOT LIKE CONCAT\('RESERVA_CURSO:',\$3::text,':%'\)/);
  assert.match(backend, /id<>\$2::uuid/);
});

test('la activacion puede seleccionar reservas de instructor sin borrador de horario', () => {
  const selectionStart = frontend.indexOf('selectReservedSchedule(reservation)');
  const selectionEnd = frontend.indexOf('\n  closeStudentModal', selectionStart);
  const selectionFlow = frontend.slice(selectionStart, selectionEnd);

  assert.match(selectionFlow, /reserved_start_time/);
  assert.match(selectionFlow, /reserved_end_time/);
  assert.match(selectionFlow, /cell\.dataset\.time \|\| payload\.time/);
  assert.match(selectionFlow, /Boolean\(expectedTime\) && cellTime === expectedTime/);
});
