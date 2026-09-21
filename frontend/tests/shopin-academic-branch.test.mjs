import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const instructorSource = await readFile(new URL('../../backend/services/InstructorAdminService.js', import.meta.url), 'utf8');
const cycleSource = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const theorySource = await readFile(new URL('../../backend/services/TheoryCourseService.js', import.meta.url), 'utf8');

test('Shopin usa el contexto académico de Flavio en horarios', () => {
  assert.match(instructorSource, /current\.code = 'SP_IC2'/);
  assert.match(instructorSource, /reference\.code = 'SP_IC1'/);
  assert.match(instructorSource, /const branchId = await this\.resolveScheduleBranchId/);
});

test('Shopin usa ciclos y cupos de Flavio durante la matrícula', () => {
  assert.match(cycleSource, /current\.code = 'SP_IC2'/);
  assert.match(cycleSource, /reference\.code = 'SP_IC1'/);
  assert.match(cycleSource, /filters = \{ \.\.\.filters, branch_id: enrollmentBranchId \}/);
});

test('Shopin comparte la oferta teórica de Flavio', () => {
  assert.match(theorySource, /current\.code='SP_IC2'/);
  assert.match(theorySource, /reference\.code='SP_IC1'/);
  assert.match(theorySource, /const branchId=await resolveEnrollmentBranchId/);
});

test('la matrícula oculta ciclos sin una franja completa disponible', () => {
  assert.match(cycleSource, /const bookableOptions = options\.filter/);
  assert.match(cycleSource, /some\(slot => Number\(slot\.available \|\| 0\) > 0\)/);
});
