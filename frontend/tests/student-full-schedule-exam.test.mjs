import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const viewSource = await readFile(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const cycleSource = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');

test('el encabezado permite solicitar y ocultar el horario completo', () => {
  assert.match(viewSource, /'Ver horario completo'/);
  assert.match(viewSource, /'Ocultar horario completo'/);
  assert.match(viewSource, /full_schedule: 'true'/);
});

test('las celdas ocupadas se publican como botones bloqueados para clases normales', () => {
  const start = viewSource.indexOf('renderScheduleOption(schedule)');
  const end = viewSource.indexOf('renderScheduleModalitySelector()', start);
  const renderFlow = viewSource.slice(start, end);

  assert.match(renderFlow, /class="schedule-option enrollment-calendar-unavailable-cell disabled"/);
  assert.match(renderFlow, /data-normal-disabled="true"/);
  assert.match(renderFlow, /aria-disabled="true" aria-label="\$\{statusLabel\}"/);
});

test('solo examen habilita las celdas ocupadas del horario completo', () => {
  const start = viewSource.indexOf('setPracticalMode(mode)');
  const end = viewSource.indexOf('shiftCalendarWindow(', start);
  const modeFlow = viewSource.slice(start, end);

  assert.match(modeFlow, /option\.disabled = !examOnly && blockedForClass && !isFullScheduleCell/);
  assert.match(viewSource, /option\.classList\.toggle\('disabled', blockedForClass && !examOnly\)/);
  assert.match(viewSource, /option\.disabled = blockedForClass && !examOnly && !isFullScheduleCell/);
  assert.match(cycleSource, /const fullScheduleRequested = filters\.full_schedule === true \|\| filters\.full_schedule === 'true'/);
  assert.match(cycleSource, /if \(!selectedInstructorIsBenito\) return options/);
});

test('el servidor procesa solo examen antes de validar cupos de clases', () => {
  const reserveStart = cycleSource.indexOf('static async reserveSchedule');
  const reserveFlow = cycleSource.slice(reserveStart);
  const examBranch = reserveFlow.indexOf('if (examOnly) {');
  const classCapacityValidation = reserveFlow.indexOf("throw createError(409, `No hay cupos disponibles para");

  assert.ok(examBranch >= 0, 'Debe existir el flujo exclusivo de Solo examen');
  assert.ok(classCapacityValidation > examBranch, 'La ocupacion de clases no debe bloquear Solo examen');
  assert.match(reserveFlow.slice(examBranch, classCapacityValidation), /appointment_type='EXAM_ONLY'/);
});

test('solo examen acepta instructores del grupo y conserva la hora seleccionada', () => {
  const reserveStart = cycleSource.indexOf('static async reserveSchedule');
  const reserveFlow = cycleSource.slice(reserveStart);
  const examStart = reserveFlow.indexOf('if (examOnly) {');
  const examEnd = reserveFlow.indexOf('const capacityResult', examStart);
  const examFlow = reserveFlow.slice(examStart, examEnd);

  assert.match(examFlow, /FROM instructor_group_members igm/);
  assert.match(examFlow, /igm\.group_id=cc\.group_id/);
  assert.match(examFlow, /INTERVAL '20 minutes'/);
  assert.match(examFlow, /selection\.date,startTime,user\.id/);
});

test('el registro usa el instructor activo aunque el selector interno estuviera vacio', () => {
  const submitStart = viewSource.indexOf('async handleStudentSubmit(event)');
  const submitEnd = viewSource.indexOf('async handleTemporaryReservationSubmit', submitStart);
  const submitFlow = viewSource.slice(submitStart, submitEnd);

  assert.match(submitFlow, /activeInstructorButton\?\.dataset\.courseInstructorId \|\| this\.scheduleInstructorFilterId \|\| formData\.get\('preferredInstructorId'\)/);
  assert.match(submitFlow, /button\.closest\('\.enrollment-calendar'\)\?\.style\.display !== 'none'/);
  assert.match(viewSource, /preferredSelect\.add\(new Option\(instructorRecord\?\.name/);
});

test('la vista previa de Solo examen conserva el instructor activo de la tabla', () => {
  const previewStart = viewSource.indexOf('async updateInstructorAssignmentPreview');
  const previewEnd = viewSource.indexOf('updateReferredInstructorBlockPreview', previewStart);
  const previewFlow = viewSource.slice(previewStart, previewEnd);

  assert.match(previewFlow, /const preferredInstructorId = examOnly\s*\? activeInstructorButton\?\.dataset\.courseInstructorId/);
  assert.match(previewFlow, /Instructor para Solo examen/);
  const examReturn = previewFlow.indexOf("if (examOnly && preferredInstructorId)");
  const automaticPreview = previewFlow.indexOf('ApiService.previewCourseCycleInstructor');
  assert.ok(examReturn >= 0 && automaticPreview > examReturn, 'Solo examen debe evitar la asignacion automatica');
});
