import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const students = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');
const cycles = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const documents = await readFile(new URL('../../backend/services/DocumentService.js', import.meta.url), 'utf8');
const portal = await readFile(new URL('../../backend/services/StudentPortalService.js', import.meta.url), 'utf8');
const documentsView = await readFile(new URL('../src/js/views/documents/DocumentsView.js', import.meta.url), 'utf8');

test('Tipo F reutiliza la operacion de carro y exige certificado de discapacidad', () => {
  assert.match(view, /data-course-type="\$\{isTypeF \? 'carro' : courseType\}"/);
  assert.match(view, /name="certificadoDiscapacidadFile"/);
  assert.match(view, /certificado_discapacidad/);
  assert.match(view, /obligatorio para la licencia Tipo F/);
  assert.match(view, /name="disabilityPercentage"/);
  assert.match(view, /type="range" min="1" max="100"/);
  assert.match(students, /requested_course\.name ILIKE '%tipo f%'.*cc\.vehicle_type='carro'/s);
  assert.match(students, /porcentaje de discapacidad valido entre 1 y 100/);
  assert.match(cycles, /'%tipo f%'/);
  assert.match(cycles, /type\.code='certificado_discapacidad'/);
  assert.match(documents, /certificado_discapacidad/);
  assert.match(documents, /requiredCount/);
  assert.match(portal, /dt\.code='certificado_discapacidad'/);
  assert.match(portal, /type_f_course\.name ILIKE '%tipo f%'/);
  assert.match(documentsView, /student\.requiredCount \|\| 3/);
  assert.match(documentsView, /Certificado de discapacidad/);
});
