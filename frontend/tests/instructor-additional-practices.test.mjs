import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../../backend/services/InstructorService.js', import.meta.url), 'utf8');
const agenda = await readFile(new URL('../src/js/views/instructor/InstructorAgendaView.js', import.meta.url), 'utf8');
const dashboard = await readFile(new URL('../src/js/views/instructor/InstructorDashboardView.js', import.meta.url), 'utf8');

test('agenda incluye dias adicionales sin matricula artificial', () => {
  assert.match(backend, /FROM additional_driving_practices ap/);
  assert.match(backend, /generate_series\(0,ap.number_of_days-1\)/);
  assert.match(backend, /day_offset>=ap.completed_days/);
  assert.match(backend, /ap.instructor_id=\$1 AND ap.status IN \('SCHEDULED','IN_PROGRESS'\)/);
  assert.match(backend, /isAdditionalPractice: Boolean\(row.is_additional_practice\)/);
});

test('practicas sin matricula no ofrecen asistencia ni seguimiento de curso', () => {
  for (const view of [agenda, dashboard]) {
    assert.match(view, /if \(item.isAdditionalPractice\) return/);
  }
  assert.match(agenda, /studentResult.additionalPractices/);
});
