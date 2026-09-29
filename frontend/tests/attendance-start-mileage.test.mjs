import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const modal = fs.readFileSync(new URL('../src/js/views/instructor/AttendanceQrModal.js', import.meta.url), 'utf8');
const service = fs.readFileSync(new URL('../src/js/services/practicalSessionService.js', import.meta.url), 'utf8');
const backend = fs.readFileSync(new URL('../../backend/services/InstructorService.js', import.meta.url), 'utf8');
const agenda = fs.readFileSync(new URL('../src/js/views/instructor/InstructorAgendaView.js', import.meta.url), 'utf8');
const completion = fs.readFileSync(new URL('../src/js/views/instructor/CompleteSessionModal.js', import.meta.url), 'utf8');

test('la entrada QR solicita kilometraje inicial numerico al instructor', () => {
  assert.match(modal, /requiresStartMileage/);
  assert.match(modal, /inputmode="numeric"/);
  assert.match(modal, /input\.value\.replace\(\/\\D\/g, ''\)/);
  assert.match(service, /start-mileage/);
  assert.match(backend, /\^\\d\{1,7\}\$/);
  assert.match(backend, /SESSION_START_MILEAGE/);
});

test('la agenda no intenta generar QR con el id de un horario sin sesion practica', () => {
  assert.match(agenda, /if \(item\.isScheduleOnly\)/);
  assert.match(agenda, /Asistencia pendiente de sincronizacion/);
  const guardPosition = agenda.indexOf('if (item.isScheduleOnly)');
  const startButtonPosition = agenda.indexOf('js-start-session', guardPosition);
  assert.ok(guardPosition >= 0 && startButtonPosition > guardPosition);
});

test('la encuesta de salida exige kilometraje final despues de observaciones', () => {
  const observationsPosition = completion.indexOf('name="observations"');
  const mileagePosition = completion.indexOf('name="endMileage"');
  assert.ok(observationsPosition >= 0 && mileagePosition > observationsPosition);
  assert.match(completion, /name="endMileage"[^>]+inputmode="numeric"/);
  assert.match(completion, /mileageInput\.value\.replace\(\/\\D\/g,''\)/);
  assert.match(backend, /endMileage < Number\(session\.start_mileage\)/);
});
