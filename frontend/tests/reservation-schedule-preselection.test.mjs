import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

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

test('activar no restaura la sucursal de sesion y solicita el ciclo reservado', () => {
  assert.match(frontend, /if \(!this\.activatingReservation\) this\.restoreSessionModalBranch/);
  assert.match(frontend, /this\.studentModalScheduleContext \|\| this\.activatingReservation/);
  const start = frontend.indexOf('async openReservationActivation');
  const flow = frontend.slice(start, frontend.indexOf('\n  selectReservedSchedule', start));
  assert.match(flow, /practicalCycleId: reservation\.cycle_id/);
  assert.match(flow, /refreshedModality\.value = modality/);
});

for (const withDraft of [true, false]) {
  test(`preseleccion efectiva con horas PostgreSQL y ${withDraft ? 'borrador rotativo' : 'reserva sin borrador'}`, () => {
    const start = frontend.indexOf('\n  selectReservedSchedule(reservation) {');
    const method = frontend.slice(start, frontend.indexOf('\n  closeStudentModal', start));
    const selected = new Set();
    const toggle = { classList: { toggle: (name, enabled) => { if (enabled) selected.add('rotation'); } }, setAttribute() {} };
    const set = { dataset: {}, querySelectorAll: () => [calendar] };
    const calendar = { dataset: { cycleIndex: '3' }, style: {}, closest: () => set, querySelectorAll: () => [toggle] };
    const cell = {
      dataset: { time: '08:00 - 09:40', schedule: JSON.stringify({ cycleId: 'cycle-one', date: '2026-10-12', time: '08:00 - 09:40' }) },
      classList: { remove() {}, add: (...names) => names.forEach(name => selected.add(name)) },
      closest: () => calendar, setAttribute() {}, disabled: true,
    };
    const context = vm.createContext({ document: { querySelectorAll: selector => selector.includes('#student-schedule-calendar') ? [cell] : [] } });
    const view = vm.runInContext(`new (class { ${method} })()`, context);
    view.updateCalendarWindow = () => {};
    let stored = false;
    view.storeSchedulePlan = received => { assert.equal(received, calendar); stored = true; };
    view.showModalAlert = () => assert.fail('No debe fallar la precarga');
    view.selectReservedSchedule({ cycle_id: 'cycle-one', reserved_start_time: '08:00:00', reserved_end_time: '09:40:00',
      ...(withDraft ? { draft_data: { schedulePlan: { rotation: true, selections: [{ date: '2026-10-12T00:00:00.000Z', time: '08:00:00 - 09:40:00' }] } } } : {}) });
    assert(selected.has('selected'));
    assert.equal(cell.disabled, false);
    assert.equal(set.dataset.activeCycleIndex, '3');
    assert(stored);
    if (withDraft) assert(selected.has('rotation'));
  });
}
