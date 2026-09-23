import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('la reserva temporal conserva el instructor previsto por el servidor', () => {
  const previewStart = source.indexOf('async updateInstructorAssignmentPreview');
  const previewEnd = source.indexOf('updateReferredInstructorBlockPreview', previewStart);
  const previewFlow = source.slice(previewStart, previewEnd);
  const reservationStart = source.indexOf('\n  toggleTemporaryReservationMode() {');
  const reservationEnd = source.indexOf('getStudentModalLastStep()', reservationStart);
  const reservationFlow = source.slice(reservationStart, reservationEnd);

  assert.notEqual(previewStart, -1, 'No se encontro la previsualizacion del instructor');
  assert.match(previewFlow, /response\.data\?\.instructorId/);
  assert.match(previewFlow, /preview\.dataset\.instructorId\s*=\s*instructorId/);
  assert.match(reservationFlow, /preview\?\.dataset\.instructorId/);
  assert.match(source, /formData\.get\('preferredInstructorId'\).*dataset\.instructorId/);
});
