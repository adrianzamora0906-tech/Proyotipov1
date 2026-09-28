import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const profile = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');

test('la asignacion inicial usa calendario por fecha y hora', () => {
  const start = profile.indexOf('renderInitialCycleOption(cycle)');
  const end = profile.indexOf('\n  async openCourseCycleScheduleModal', start);
  const flow = profile.slice(start, end);

  assert.match(flow, /profile-initial-cycle enrollment-calendar/);
  assert.match(flow, /enrollment-calendar-grid/);
  assert.match(flow, /data-day-index/);
  assert.match(flow, /calendar-window-btn/);
  assert.doesNotMatch(flow, /profile-initial-slot-grid/);
});

test('seleccionar una hora marca la fila disponible completa', () => {
  assert.match(profile, /selectInitialProfileScheduleRow\(modal, button\)/);
  assert.match(profile, /item\.classList\.toggle\('selected', sameRow && !item\.disabled\)/);
});

test('el cambio de horario es por instructor y por dia', () => {
  assert.match(profile, /change-schedule-btn'\)\?\.addEventListener\('click', \(\) => this\.openScheduleModal\(studentId, \{ allowInitial: false \}\)\)/);
  assert.match(profile, /cycle\.instructor\?\.name/);
  assert.match(profile, /Selecciona por celda el nuevo horario de cada d&iacute;a/);
  assert.match(profile, /schedule-option-status \$\{isCurrent \? 'current'/);
  assert.match(profile, /calendar\.querySelectorAll\(`\.schedule-option\.selected\[data-date="\$\{option\.dataset\.date\}"\]`\)/);
});
