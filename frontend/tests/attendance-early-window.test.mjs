import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const qr = readFileSync(new URL('../../backend/services/AttendanceQrService.js', import.meta.url), 'utf8');
const instructor = readFileSync(new URL('../../backend/services/InstructorService.js', import.meta.url), 'utf8');

test('QR e instructor habilitan asistencia diez minutos antes', () => {
  assert.match(qr, /scheduledStart\)\.getTime\(\) - 10 \* 60 \* 1000/);
  assert.match(qr, /attendanceWindowStart\(challenge\.scheduled_start\)/);
  assert.match(instructor, /scheduledStart\.getTime\(\) - 10 \* 60 \* 1000/);
  assert.match(instructor, /attendanceStart <= now/);
});
