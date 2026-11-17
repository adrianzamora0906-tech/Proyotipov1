import test from 'node:test';
import assert from 'node:assert/strict';
import { findAntEntryNumbers, extractAntEntryNumbers } from '../src/js/lib/AtmPdfEntry.js';

test('extrae el ingreso y descarta el número del oficio de respuesta', () => {
  assert.deepEqual(findAntEntryNumbers('Oficio Nro. ANT-DPM-2026-2593-OF. Con Ingreso Nro. ANT-DPM-2026-8501-E de fecha 05 de octubre.'), ['ANT-DPM-2026-8501-E']);
});

test('normaliza espacios, saltos de línea, minúsculas y guiones tipográficos', () => {
  assert.deepEqual(findAntEntryNumbers('ant – dpm – 2026 –\n8501 – e'), ['ANT-DPM-2026-8501-E']);
});

test('no duplica el ingreso repetido en varias páginas', () => {
  assert.deepEqual(findAntEntryNumbers('ANT-DPM-2026-8501-E ANT-DPM-2026-8501-E'), ['ANT-DPM-2026-8501-E']);
});

test('conserva candidatos distintos para que el usuario elija', () => {
  assert.deepEqual(findAntEntryNumbers('ANT-DPM-2026-8501-E ANT-DPG-2026-0123-E'), ['ANT-DPM-2026-8501-E', 'ANT-DPG-2026-0123-E']);
});

test('no inventa un ingreso a partir de un oficio o un identificador incompleto', () => {
  assert.deepEqual(findAntEntryNumbers('ANT-DPM-2026-2593-OF ANT-DPM-2026-8501 ANT-DPM-2026-8501-EXTRA'), []);
});

test('rechaza un PDF falso antes de cargar el lector', async () => {
  await assert.rejects(extractAntEntryNumbers(new File(['texto'], 'respuesta.pdf')), /PDF válido/);
});

test('rechaza archivos demasiado grandes antes de leerlos', async () => {
  await assert.rejects(extractAntEntryNumbers({ name: 'respuesta.pdf', size: 11 * 1024 * 1024 }), /10 MB/);
});
