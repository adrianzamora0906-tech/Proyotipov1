import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');

test('el horario inicial del perfil guarda observaciones despues de teoria', () => {
  const start = source.indexOf('\n  async openInitialCourseScheduleModal');
  const end = source.indexOf('\n  renderInitialCycleOption(cycle) {', start);
  const flow = source.slice(start, end);
  const theoryPosition = flow.indexOf('id="profile-theory-options"');
  const notesPosition = flow.indexOf('id="profile-initial-schedule-notes"');
  const updatePosition = flow.indexOf('ApiService.updateStudent(studentId, { notes })');
  const reservePosition = flow.indexOf('ApiService.reserveCourseCycleSchedule');

  assert.notEqual(start, -1, 'No se encontro el modal de horario inicial');
  assert.ok(notesPosition > theoryPosition, 'Observaciones debe aparecer despues del horario de teoria');
  assert.match(flow, /id="profile-initial-schedule-notes"[^>]*maxlength="500"/);
  assert.ok(updatePosition > notesPosition, 'La observacion debe enviarse al guardar');
  assert.ok(reservePosition > updatePosition, 'La observacion debe validarse antes de reservar el horario');
});
