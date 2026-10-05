import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('la validacion de instructor especial intensivo envia solo los parametros usados', () => {
  assert.match(service, /findForcedWeekendInstructor[\s\S]*?\[branchId, instructorId\]\)\)\.rows\[0\] \|\| null/);
  assert.doesNotMatch(service, /\[branchId, instructorId, program\.course_id\]\)\)\.rows\[0\] \|\| null/);
});
