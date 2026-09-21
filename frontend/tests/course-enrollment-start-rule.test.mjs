import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cycleSource = await readFile(new URL('../../backend/services/CourseCycleService.js', import.meta.url), 'utf8');
const studentSource = await readFile(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');

test('las opciones de matricula solo admiten hasta dos dias desde el inicio', () => {
  const start = cycleSource.indexOf('static async getEnrollmentOptions');
  const end = cycleSource.indexOf('static async findFirstInstructorAvailability', start);
  const flow = cycleSource.slice(start, end);
  assert.match(flow, /AND CURRENT_DATE <= cc\.start_date \+ 2/);
  assert.doesNotMatch(flow, /AND CURRENT_DATE <= cc\.end_date/);
});

test('la confirmacion del horario aplica la ventana de dos dias', () => {
  const start = cycleSource.indexOf('static async reserveSchedule');
  const flow = cycleSource.slice(start);
  assert.match(flow, /AND CURRENT_DATE <= cc\.start_date \+ 2/);
});

test('una reserva temporal usa la misma ventana de dos dias', () => {
  const start = studentSource.indexOf('static async createTemporarySeatReservation');
  const end = studentSource.indexOf('static async cancelSeatReservation', start);
  const flow = studentSource.slice(start, end);
  assert.match(flow, /AND CURRENT_DATE<=cc\.start_date\+2/);
});
