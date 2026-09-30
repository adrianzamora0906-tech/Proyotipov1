import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const qr = readFileSync(new URL('../../backend/services/AttendanceQrService.js', import.meta.url), 'utf8');
const instructor = readFileSync(new URL('../../backend/services/InstructorService.js', import.meta.url), 'utf8');

test('la entrada abre diez minutos antes y la salida conserva treinta minutos de gracia', () => {
  assert.match(qr, /return phase === 'EXIT' \? new Date\(end\.getTime\(\) \+ 30 \* 60 \* 1000\) : end/);
  assert.match(qr, /scheduledStart\)\.getTime\(\) - 10 \* 60 \* 1000/);
  assert.match(qr, /attendanceWindowStart\(challenge\.scheduled_start\)/);
  assert.match(instructor, /scheduledStart\.getTime\(\) - ATTENDANCE_EARLY_MINUTES \* 60 \* 1000/);
  assert.match(instructor, /const attendanceEnd = scheduledEnd/);
  assert.match(instructor, /attendanceStart <= now/);
  assert.match(instructor, /ATTENDANCE_CLOSE_GRACE_MINUTES \* 60 \* 1000 < Date\.now\(\)/);
});
