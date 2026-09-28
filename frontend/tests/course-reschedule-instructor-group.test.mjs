import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('la asignacion y reagendamiento exigen que el instructor pertenezca al ciclo seleccionado', () => {
  const start = source.indexOf('let preferredInstructor = null');
  const end = source.indexOf('const instructorLockKeys', start);
  const validation = source.slice(start, end);

  assert.match(validation, /course_cycle_instructors cci/);
  assert.match(validation, /cci\.cycle_id=selected_cycle\.id/);
  assert.match(validation, /instructor_group_members igm/);
  assert.match(validation, /igm\.group_id=selected_cycle\.group_id/);
});

test('un instructor externo no consume el cupo horario del grupo seleccionado', () => {
  const start = source.indexOf('const occupiedResult = await client.query');
  const end = source.indexOf('const occupied = Number', start);
  const capacityCheck = source.slice(start, end);

  assert.match(capacityCheck, /cci\.instructor_id=course_cycle_schedule_assignments\.instructor_id/);
  assert.match(capacityCheck, /igm\.instructor_id=course_cycle_schedule_assignments\.instructor_id/);
  assert.match(capacityCheck, /cci\.instructor_id=referred_instructor_schedule_blocks\.instructor_id/);
});
