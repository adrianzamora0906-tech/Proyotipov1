import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('el permiso de cambio de instructor llega al manejador que guarda el horario', () => {
  const source = fs.readFileSync(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');
  assert.match(source, /this\.mountProfileScheduleModal\(modal, studentId, \{ allowInstructorFeedback \}\)/);
  assert.match(source, /mountProfileScheduleModal\(modal, studentId, \{ allowInstructorFeedback = false \} = \{\}\)/);
  assert.match(source, /allowInstructorChange:\s*allowInstructorFeedback/);
});
