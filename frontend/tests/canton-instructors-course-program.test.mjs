import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/admin/AdminBranchesView.js', import.meta.url), 'utf8');
const formStart = source.indexOf('async openCourseProgramForm');
const formEnd = source.indexOf('openCourseForm(body', formStart);
const formFlow = source.slice(formStart, formEnd);

test('los grupos fijos muestran instructores compatibles de todo el cantón', () => {
  assert.notEqual(formStart, -1, 'No se encontró el formulario del programa académico');
  assert.notEqual(formEnd, -1, 'No se pudo delimitar el formulario del programa académico');
  assert.match(formFlow, /const cantonInstructors=instructors\.filter/);
  assert.match(formFlow, /instructor\.practice_area==='mixto'\|\|instructor\.practice_area===selectedVehicleType/);
  assert.match(formFlow, /cantonInstructors\.map/);
  assert.match(formFlow, /Apoyo cantonal/);
  assert.doesNotMatch(formFlow, /const priorityInstructors=instructors\.filter/);
});

test('la rotación intensiva usa la misma lista cantonal compatible', () => {
  assert.match(formFlow, /const rotationCandidates=cantonInstructors/);
});
