import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const studentsView = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const cycleService = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('Próximo no impone un máximo de ciclos en el selector de horarios', () => {
  assert.match(studentsView, /data-load-next="\$\{cycleIndex === cycleCount - 1 \? 'true' : 'false'\}"/);
  assert.doesNotMatch(studentsView, /loadedCycleCount\s*>=\s*6/);
  assert.doesNotMatch(studentsView, /cycleCount\s*>=\s*6/);
  assert.doesNotMatch(studentsView, /cycleCount\s*<\s*6/);
});

test('cada solicitud extendida puede publicar el siguiente intensivo sin tope acumulado', () => {
  const start = cycleService.indexOf('static async ensureIntensiveRotation');
  const end = cycleService.indexOf('static async previewInstructor', start);
  const rotationFlow = cycleService.slice(start, end);

  assert.notEqual(start, -1, 'No se encontró ensureIntensiveRotation');
  assert.match(rotationFlow, /latestPublished/);
  assert.match(rotationFlow, /nextStart\.setDate\(nextStart\.getDate\(\) \+ 7\)/);
  assert.doesNotMatch(rotationFlow, /published\.rows\.length\s*>=/);
  assert.doesNotMatch(rotationFlow, /LIMIT 6/);
});
