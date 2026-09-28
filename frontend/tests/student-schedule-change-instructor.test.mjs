import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('el cambio conserva y consulta solo el instructor asignado', () => {
  const start = backend.indexOf('static async getStudentScheduleChangeOptions');
  const end = backend.indexOf('\n  static async changeStudentScheduleDays', start);
  const flow = backend.slice(start, end);

  assert.match(flow, /const assignedInstructor = currentAssignments\.find/);
  assert.match(flow, /WHERE instructor_id=\$1 AND status='activo' AND student_id<>\$2/);
  assert.match(flow, /FROM instructor_availability_overrides/);
  assert.match(flow, /instructor: \{/);
  assert.match(flow, /name: assignedInstructor\.instructorName/);
});

test('cada fecha cambiada mantiene su instructor actual', () => {
  const start = backend.indexOf('static async changeStudentScheduleDays');
  const end = backend.indexOf('\n  static async changeStudentScheduleDay(', start);
  const flow = backend.slice(start, end);

  assert.match(flow, /current\.instructor_id/);
  assert.match(flow, /instructor_id, status, created_by/);
  assert.match(flow, /Solo puedes seleccionar un nuevo horario por dia/);
});
