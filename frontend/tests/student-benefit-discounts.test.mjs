import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const frontendService = await readFile(new URL('../src/js/services/StudentService.js', import.meta.url), 'utf8');
const backendService = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../backend/migrations/enterprise/103_student_discount_benefit.sql', import.meta.url), 'utf8');

test('los convenios fijan sus precios finales para moto y carro', () => {
  for (const source of [view, backendService]) {
    assert.match(source, /UNIVERSITY_STUDENT:\s*\{ moto: 117, carro: 180 \}/);
    assert.match(source, /POLICE:\s*\{ moto: 110, carro: 170 \}/);
  }
});

test('los descuentos se eligen desde el mismo buscador de referidos', () => {
  assert.match(view, /placeholder="Buscar personal, Polic(?:&iacute;|í)a o universidad\.\.\."/);
  assert.match(view, /id: 'benefit:POLICE'/);
  assert.match(view, /id: 'benefit:UNIVERSITY_STUDENT'/);
  assert.match(view, /benefitInput\.value = person\.discount_benefit \|\| ''/);
  assert.doesNotMatch(view, /<select[^>]+name="discountBenefit"/);
});

test('el backend calcula el descuento y limita el convenio a moto y carro', () => {
  assert.match(backendService, /Number\(selectedCourseRecord\.price\) - benefitFinalAmount/);
  assert.match(backendService, /El convenio solo aplica a los cursos de Moto y Carro/);
  assert.match(backendService, /!\/tipo\\s\*f\/i\.test\(selectedCourseName\)/);
  assert.match(backendService, /isCarCourse && !discountBenefit \? 175 : 0/);
});

test('el convenio se envia y queda guardado con valores restringidos', () => {
  assert.match(frontendService, /discountBenefit: studentData\.discountBenefit \|\| null/);
  assert.match(backendService, /pickup_branch_id, disability_percentage, discount_benefit/);
  assert.match(migration, /IN \('UNIVERSITY_STUDENT', 'POLICE'\)/);
});
