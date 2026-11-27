import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('  async loadDemandEnrollmentSchedules('), source.indexOf('  mergeEnrollmentSchedules('));
function setup(respond) {
  const calls = [];
  const view = vm.runInNewContext(`({${method}})`, {
    document: {
      querySelector: () => ({ selectedOptions: [{ dataset: { courseType: 'moto' } }] }),
      getElementById: () => ({ value: 'normal' }),
    },
    ApiService: { getCourseEnrollmentOptions: async params => { calls.push(params); return respond(params); } },
  });
  view.modalScheduleRequestId = 1;
  view.flattenEnrollmentOptions = data => data;
  return { view, calls };
}
const cycles = [{ id: 'first' }, { id: 'second' }, { id: 'third' }];
const detail = id => ({ id, instructors: [{ id: 'instructor' }], slots: [{ available: 1 }] });

test('solo consulta moto normal y el detalle del ciclo solicitado', async () => {
  const { view, calls } = setup(p => ({ success: true, data: p.catalog_only ? cycles : [detail(p.cycle_id)] }));
  const loaded = await view.loadDemandEnrollmentSchedules('branch', null, null, { demandCycleId: 'second' }, 1);
  assert.equal(loaded.navigation.cycleId, 'second');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(p => p.vehicle_type === 'moto' && p.modality === 'normal'));
  assert.ok(calls.slice(1).every(p => p.cycle_id === 'second'));
  assert.equal(calls[2].instructor_id, 'instructor');
});

test('omite un ciclo sin cupos sin precargar los siguientes disponibles', async () => {
  const { view, calls } = setup(p => ({ success: true, data: p.catalog_only ? cycles : p.cycle_id === 'first' ? [] : [detail(p.cycle_id)] }));
  const loaded = await view.loadDemandEnrollmentSchedules('branch', null, null, {}, 1);
  assert.equal(loaded.navigation.cycleId, 'second');
  assert.ok(!calls.some(p => p.cycle_id === 'third'));
});

test('un cambio de filtro descarta la respuesta anterior antes de consultar detalles', async () => {
  const { view, calls } = setup(() => { view.modalScheduleRequestId = 2; return { success: true, data: cycles }; });
  assert.equal(await view.loadDemandEnrollmentSchedules('branch', null, null, {}, 1), null);
  assert.equal(calls.length, 1);
});

test('conserva instructor explícito, inicio anticipado y reserva en el detalle', async () => {
  const { view, calls } = setup(p => ({ success: true, data: p.catalog_only ? cycles : [detail(p.cycle_id)] }));
  view.scheduleInstructorExplicit = true;
  view.activatingReservation = { id: 'reservation' };
  await view.loadDemandEnrollmentSchedules('branch', 'chosen', '2026-12-01', { practicalCycleId: 'second' }, 1);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(p => p.instructor_id === 'chosen' && p.reservation_id === 'reservation'
    && p.practical_start_date === '2026-12-01' && p.practical_cycle_id === 'second'));
});

test('Próximo al final solicita extensión y empieza después del ciclo actual', async () => {
  const { view, calls } = setup(p => ({ success: true, data: p.catalog_only ? cycles : [detail(p.cycle_id)] }));
  const loaded = await view.loadDemandEnrollmentSchedules('branch', null, null,
    { extend: true, demandCycleId: 'second', demandAfterCurrent: true }, 1);
  assert.equal(calls[0].extend, true);
  assert.equal(loaded.navigation.cycleId, 'third');
});
