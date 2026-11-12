import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const backend = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');

test('solo la reserva vigente de la sucursal recupera su ciclo sin cupos libres', () => {
  assert.match(backend, /WHERE id::text=\$1 AND branch_id=\$2 AND status='activo' AND expires_at>NOW\(\)/);
  const start = backend.indexOf('const bookableOptions = options.filter');
  const end = backend.indexOf('\n\n    if (!selectedInstructorShowsFullSchedule)', start);
  assert.ok(start >= 0 && end > start);
  const source = backend.slice(start, end).replace('const bookableOptions =', 'result =');
  const options = [{ id: 'reserved', slots: [{ available: 0 }] }, { id: 'other', slots: [{ available: 0 }] }];
  const run = (reservation, instructor) => {
    const context = { options, activationReservation: reservation, filters: { instructor_id: instructor }, result: null };
    vm.runInNewContext(source, context);
    return context.result.map(option => option.id).join(',');
  };
  assert.equal(run(null, 'teacher'), '');
  assert.equal(run({ cycle_id: 'reserved', instructor_id: 'teacher' }, 'teacher'), 'reserved');
  assert.equal(run({ cycle_id: 'reserved', instructor_id: 'teacher' }, 'another'), '');
});

test('la activacion carga el instructor reservado aunque no este en el selector', () => {
  const start = frontend.indexOf('async openReservationActivation');
  const end = frontend.indexOf('\n  selectReservedSchedule', start);
  const flow = frontend.slice(start, end);
  assert.match(flow, /instructor\.add\(new Option\(reservation\.instructor_name/);
  assert.match(flow, /reloadModalSchedules\(reservation\.branch_id, reservation\.instructor_id/);
});

test('el horario reservado ocupado se dibuja y otros horarios ocupados siguen ocultos', () => {
  const start = frontend.indexOf('\n  isReservedSchedule(schedule, matchDate = true) {');
  const end = frontend.indexOf('\n  renderScheduleModalitySelector()', start);
  assert.ok(start >= 0 && end > start);
  const view = vm.runInNewContext(`new (class { ${frontend.slice(start, end)} })()`);
  view.getScheduleCourseKey = () => 'carro';
  view.activatingReservation = { cycle_id:'cycle', draft_data:{ schedulePlan:{ selections:[
    {date:'2026-11-19',time:'18:00 - 19:40'}
  ]}}};
  const slot = {cycleId:'cycle', date:'2026-11-19', time:'18:00 - 19:40',
    course:'carro', available:0, capacity:0, availabilityByDate:{'2026-11-19':{available:0,status:'reserved'}}};
  assert.match(view.renderScheduleOption(slot), /class="schedule-option enrollment-calendar-unavailable-cell disabled"/);
  assert.match(view.renderScheduleOption({...slot, time:'16:00 - 17:40'}), /enrollment-calendar-empty-cell/);
  assert.match(view.renderScheduleOption({...slot, cycleId:'another'}), /enrollment-calendar-empty-cell/);
  assert.match(view.renderScheduleOption({...slot, date:'2026-11-20'}), /enrollment-calendar-empty-cell/);
  assert.equal(view.isReservedSchedule({...slot, date:undefined}, false), true);
  assert.match(frontend, /\.some\(schedule => this\.isReservedSchedule\(schedule, false\)/);
});

test('la fila reservada se muestra aunque no tenga cupos libres', () => {
  const start = frontend.indexOf('\n  isReservedSchedule(schedule, matchDate = true) {');
  const end = frontend.indexOf('\n  async openRegistrationGallery()', start);
  assert.ok(start >= 0 && end > start);
  const view = vm.runInNewContext(`new (class { ${frontend.slice(start, end)} })()`, { escapeHtml: String });
  view.getScheduleCourseKey = () => 'carro';
  view.activatingReservation = { cycle_id:'cycle', draft_data:{ schedulePlan:{ selections:[
    {date:'2026-11-19',time:'18:00 - 19:40'}
  ]}}};
  const slot = {cycleId:'cycle', date:'2026-11-19', time:'18:00 - 19:40',
    course:'carro', available:0, capacity:0, availabilityByDate:{'2026-11-19':{available:0,status:'reserved'}}};
  const cycle = {key:'cycle', startDate:'2026-11-19', endDate:'2026-11-19',
    calendarDates:['2026-11-19'], instructors:[], scheduledInstructors:[]};
  const html = view.renderEnrollmentCycleCalendar({courseKey:'carro',modality:'normal',title:'Carro',
    schedules:[slot],cycle,cycleIndex:0,cycleCount:1,activeCycleIndex:0});
  assert.match(html, /enrollment-calendar-row \"/);
  assert.doesNotMatch(html, /normal-row-unavailable/);
  assert.match(html, /18:00 - 19:40/);
  assert.doesNotMatch(html, /Clases registradas:/);
});
