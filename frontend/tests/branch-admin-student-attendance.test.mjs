import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profile = readFileSync(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/js/core/api/apiService.js', import.meta.url), 'utf8');
const backend = readFileSync(new URL('../../backend/services/StudentService.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../backend/routes/students.js', import.meta.url), 'utf8');

test('solo Administrador de Sucursal ve el control de asistencia en el expediente', () => {
  assert.match(profile, /roles \|\| \[\]\)\.includes\('BRANCH_ADMIN'\)/);
  assert.match(profile, /id="register-branch-admin-attendance"/);
  assert.match(profile, /branchAdminAttendance\?\.canRegister\?'':'disabled'/);
  assert.match(profile, /Registrar salida/);
});

test('la asistencia administrativa conserva horario, sucursal y auditoria', () => {
  assert.match(routes, /requirePermission\('STUDENT_UPDATE'\).*branchAdminAttendanceStatus/);
  assert.match(api, /getBranchAdminAttendance/);
  assert.match(api, /registerBranchAdminAttendance/);
  assert.match(backend, /r\.code='BRANCH_ADMIN'/);
  assert.match(backend, /assignment\.schedule_date=\(NOW\(\) AT TIME ZONE 'America\/Guayaquil'\)::date/);
  assert.match(backend, /exitWindowEnd = new Date\(entryWindowEnd\.getTime\(\) \+ 30 \* 60 \* 1000\)/);
  assert.match(backend, /scheduled_start\)\.getTime\(\) - 10 \* 60 \* 1000/);
  assert.match(backend, /BRANCH_ADMIN_ATTENDANCE_ENTRY_REGISTERED/);
  assert.match(backend, /BRANCH_ADMIN_ATTENDANCE_EXIT_REGISTERED/);
  assert.match(backend, /SET status='COMPLETADA',actual_end=NOW\(\)/);
  assert.match(backend, /attendance_status=COALESCE\(attendance_status,'Asistio'\)/);
});
