import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const profile = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');

test('el cambio de practicas reconoce ciclos operativos compartidos en la misma ciudad', () => {
  const start = service.indexOf('static async getStudentScheduleChangeOptions');
  const end = service.indexOf('\n  static async', start + 20);
  const flow = service.slice(start, end);
  assert.match(flow, /scope_branch\.city_id=b\.city_id/);
  assert.doesNotMatch(flow, /branchFilter = `AND cc\.branch_id/);
  assert.match(profile, /openCourseCycleScheduleModal\(studentId, modal\)/);
});
