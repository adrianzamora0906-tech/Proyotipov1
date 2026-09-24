import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profile = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');
const api = await readFile(new URL('../src/js/core/api/apiService.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../../backend/services/TheoryCourseService.js', import.meta.url), 'utf8');

test('el perfil permite cambiar solo la teoria con cupo y trazabilidad', () => {
  assert.match(profile, /id="change-theory-schedule-btn"/);
  assert.match(profile, /openTheoryScheduleModal/);
  assert.match(profile, /ApiService\.changeStudentTheory\(studentId, selection\)/);
  assert.match(api, /course-cycles\/student\/\$\{studentId\}\/theory/);
  assert.match(service, /THEORY_SCHEDULE_CHANGED/);
  assert.match(service, /TheoryCourseService|assignEnrollment/);
});
