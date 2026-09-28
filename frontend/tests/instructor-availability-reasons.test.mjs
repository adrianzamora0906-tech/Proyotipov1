import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const frontend = await readFile(new URL('../src/js/views/schedule/ScheduleView.js', import.meta.url), 'utf8');
const backend = await readFile(new URL('../../backend/services/InstructorAdminService.js', import.meta.url), 'utf8');

test('solicita y conserva el motivo al bloquear disponibilidad', () => {
  assert.match(frontend, /Motivo de ocupaci&oacute;n/);
  assert.match(frontend, /value="transport"/);
  assert.match(frontend, /value="occupied"/);
  assert.match(frontend, /value="other"/);
  assert.match(frontend, /reasonType === 'other' && !reason/);
  assert.match(backend, /reason_type=CASE/);
  assert.match(backend, /unavailable_reason=\$7/);
});

test('transporte suma una sola unidad mensual y se muestra en el curso', () => {
  assert.match(backend, /THEN 1 ELSE 0 END::int AS transport_students/);
  assert.match(backend, /assignedStudents: transportStudents/);
  assert.match(backend, /name: 'Transporte'/);
  assert.match(frontend, /incluye \$\{totals\.transportStudents\} por transporte/);
});

test('una fila seleccionada recibe el mismo motivo en todos sus dias', () => {
  assert.match(frontend, /data-availability-row/);
  assert.match(frontend, /calendar\.availabilityRowSelection = alreadySelected \? null : \{ startTime, endTime \}/);
  assert.match(frontend, /const fullRowSelected = calendar\.availabilityRowSelection\?\.startTime === selectedStartTime/);
  assert.match(frontend, /editableSlots\.filter\(item => item\.startTime === selectedStartTime && item\.endTime === selectedEndTime\)/);
  assert.match(frontend, /affectedKeys\.forEach\(affectedKey =>/);
  assert.match(frontend, /reasons\.set\(affectedKey, reasonData\)/);
});
