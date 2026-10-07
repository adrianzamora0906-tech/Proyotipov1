import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');

test('reservar cupo pregunta la cantidad de dias', () => {
  assert.match(view, /openTemporaryReservationDaysModal\(\)/);
  assert.match(view, /overlay\.className = 'modal-overlay active modal-overlay-secondary'/);
  assert.match(view, /id="temporary-reservation-days" type="number" min="1" max="30"/);
  assert.match(view, /reservationDays:this\.temporaryReservationDays\|\|2/);
  assert.doesNotMatch(view, /Reservar este cupo por 2 d[ií]as/);
});

test('backend valida y aplica la duracion elegida', () => {
  assert.match(service, /reservationDays=Number\(data\.reservationDays\|\|2\)/);
  assert.match(service, /reservationDays<1\|\|reservationDays>30/);
  assert.match(service, /NOW\(\)\+\(\$12::int\*INTERVAL '1 day'\)/);
  assert.match(service, /identification,reservationDays,expiresAt/);
});
