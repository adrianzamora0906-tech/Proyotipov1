import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const source = fs.readFileSync(
  new URL('../src/js/views/students/StudentsView.js', import.meta.url),
  'utf8',
);

test('las observaciones del registro regular aparecen despues de la teoria', () => {
  const theoryPosition = source.indexOf('id="theory-schedule-error"');
  const notesPosition = source.indexOf("observationsField('regular-enrollment-observations-field')");
  const workflowEndPosition = source.indexOf('</div>', notesPosition);

  assert.ok(theoryPosition >= 0, 'Debe existir el bloque de horario de teoria');
  assert.ok(notesPosition > theoryPosition, 'Las observaciones deben estar despues de teoria');
  assert.ok(workflowEndPosition > notesPosition, 'Las observaciones deben permanecer dentro del flujo regular');
  assert.doesNotMatch(source, /canRegisterPayment\s*\?\s*''\s*:\s*observationsField\(\)/);
});

test('cada modalidad conserva un unico campo de observaciones visible', () => {
  assert.match(source, /regular-enrollment-observations-field/);
  assert.match(source, /additional-practice-observations-field/);
  assert.match(source, /renewal-observations-field/);
  assert.match(
    source,
    /\.additional-practice-observations-field'[\s\S]*element\.hidden = isRenewal \|\| !isAdditionalPractice/,
  );
});
