import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAntCourses, compareAntCourses, pdfPageText } from '../src/js/lib/AtmCourseComparison.js';

const course = { courseCode: 'SP-ICP27-26', registrationStart: '2026-10-22', registrationEnd: '2026-10-28', courseStart: '2026-11-05', courseEnd: '2026-11-12', receiptNumber: '101774436' };

test('lee las cuatro fechas y comprobantes de filas sucesivas', () => {
  const rows = parseAntCourses('SP-ICP27-26 22-10-2026 28-10-2026 05-11-2026 12-11-2026 101774436\nSP-ICP28-26 30-10-2026 05-11-2026 13-11-2026 20-11-2026 101774566');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], course);
  assert.equal(rows[1].receiptNumber, '101774566');
});

test('acepta códigos separados y fechas con barras sin cambiar la identidad', () => {
  const rows = parseAntCourses('SP_IMJ_39_26 17/08/2026 18/08/2026 20/08/2026 27/08/2026 PENDIENTE');
  assert.equal(rows[0].courseCode, 'SP_IMJ_39_26');
  assert.equal(rows[0].registrationStart, '2026-08-17');
  assert.equal(rows[0].receiptNumber, 'PENDIENTE');
});

test('reconstruye filas cuando los elementos están guardados por columnas', () => {
  const item = (str, x, y) => ({ str, transform: [1, 0, 0, 1, x, y] });
  assert.equal(pdfPageText([item('SP-ICP27-26', 10, 200), item('SP-ICP28-26', 10, 180), item('22-10-2026', 100, 200), item('30-10-2026', 100, 180)]), 'SP-ICP27-26 22-10-2026\nSP-ICP28-26 30-10-2026');
});

test('compara por código aunque cambie el orden y los separadores', () => {
  const rows = compareAntCourses([course], [{ ...course, courseCode: 'SP_ICP_27_26' }]);
  assert.equal(rows[0].status, 'match');
});

test('señala fechas y comprobante diferentes', () => {
  const rows = compareAntCourses([course], [{ ...course, courseEnd: '2026-11-13', receiptNumber: '999999999' }]);
  assert.deepEqual(rows[0].differences, ['Fin de clases', 'Comprobante']);
  assert.equal(rows[0].status, 'different');
});

test('un curso parecido con otro número se muestra como faltante y adicional', () => {
  const rows = compareAntCourses([course], [{ ...course, courseCode: 'SP-ICP28-26' }]);
  assert.deepEqual(rows.map(row => row.status), ['missing', 'extra']);
});

test('los datos ilegibles o fechas imposibles no producen una coincidencia verde', () => {
  const [received] = parseAntCourses('SP-ICP27-26 31-02-2026 28-10-2026 05-11-2026 12-11-2026');
  assert.equal(received.registrationStart, null);
  assert.equal(compareAntCourses([course], [received])[0].status, 'different');
});

test('dos filas distintas para el mismo código requieren revisión', () => {
  const rows = compareAntCourses([course], [course, { ...course, courseEnd: '2026-11-13' }]);
  assert.equal(rows[0].status, 'different');
  assert.ok(rows[0].differences.includes('El código aparece con datos distintos en el PDF'));
});

test('texto sin tabla no se interpreta como cursos autorizados', () => {
  assert.deepEqual(parseAntCourses('Se solicitó autorización para SP-ICP27-26.\nSin fechas ni comprobante.'), []);
});
