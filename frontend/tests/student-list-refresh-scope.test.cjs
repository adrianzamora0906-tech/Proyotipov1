const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/js/views/students/StudentsView.js'), 'utf8');

test('realtime consulta con la sucursal del formulario, no con el alcance anterior', async () => {
  const method = source.slice(source.indexOf('  async refreshRealtime()'), source.indexOf('  createSnapshot('));
  const form = {};
  const document = { visibilityState: 'visible', getElementById: id => id === 'student-filter-form' ? form : {} };
  const view = vm.runInNewContext(`({${method}})`, {
    document, console, URLSearchParams, window: { location: { search: '' } },
    FormData: class { *[Symbol.iterator]() { yield ['studentScope', 'branch:shopping']; } },
  });
  view.listParams = { scope: 'all' };
  view.getStudentListParams = data => ({ branch_id: data.studentScope.slice(7) });
  let calls = 0;
  view.refreshStudentTable = async (params, page, prefetched) => {
    calls++;
    assert.equal(params.branch_id, 'shopping');
    assert.equal(page, 1);
    assert.equal(prefetched, undefined);
  };
  await view.refreshRealtime();
  assert.equal(calls, 1);
});

test('una respuesta anterior no sobrescribe resultados ni quita el estado de carga vigente', async () => {
  const method = source.slice(source.indexOf('  async refreshStudentTable('), source.indexOf('  bindStudentTableEvents('));
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const container = { style: {}, setAttribute() {}, removeAttribute() { throw new Error('Respuesta obsoleta'); } };
  const view = vm.runInNewContext(`({${method}})`, {
    document: { getElementById: () => container }, console,
    StudentService: { getAllStudents: () => pending, getActiveReservations: async () => [] },
  });
  view.getDisabledStudents = async () => [];
  const request = view.refreshStudentTable({ scope: 'all' });
  view.studentListRequestId++;
  release([]);
  await request;
  assert.equal(container.innerHTML, undefined);
  assert.equal(container.style.opacity, '0.55');
});
