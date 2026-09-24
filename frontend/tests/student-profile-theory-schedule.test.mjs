import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const profile = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');
const service = await readFile(new URL('../../backend/services/ScheduleService.js', import.meta.url), 'utf8');

test('el perfil muestra practica y teoria desde el horario del estudiante', () => {
  assert.match(profile, /Pr&aacute;cticas/);
  assert.match(profile, /renderTheorySchedule\(schedule\.theory\)/);
  assert.match(profile, /Teor&iacute;a/);
  assert.match(service, /theory_group_students/);
  assert.match(service, /theory_course_groups/);
  assert.match(service, /theory,/);
});
