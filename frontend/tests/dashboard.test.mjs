import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
globalThis.window = { dispatchEvent() {} };

const { default: DashboardService } = await import('../src/js/services/DashboardService.js');

test('documentos faltantes se calculan solo sobre estudiantes devueltos por la API', async () => {
  localStorage.setItem('erp_documents', JSON.stringify([
    { id: 'antiguo-1', studentId: 'eliminado', file: null },
    { id: 'antiguo-2', studentId: 'eliminado', file: null },
  ]));

  const stats = await DashboardService.getDashboardStats([], []);
  assert.equal(stats.totalStudents, 0);
  assert.equal(stats.missingDocuments, 0);
});

test('actividad reciente excluye registros de estudiantes que ya no existen', () => {
  localStorage.setItem('erp_history', JSON.stringify([
    { id: '1', studentId: 'eliminado', action: 'Estudiante registrado' },
    { id: '2', action: 'Actividad general' },
  ]));

  assert.deepEqual(
    DashboardService.getRecentActivity(8, []).map(item => item.id),
    ['2'],
  );
});
