const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('el resumen prioriza el instructor del calendario sobre el selector anterior', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/js/views/students/StudentsView.js'), 'utf8');
  const method = source.slice(source.indexOf('  updateScheduleSelectionSummary('), source.indexOf('  getCalendarInstructorButton('));
  const detail = { textContent: '', hidden: true };
  const title = { textContent: '' };
  const summary = { classList: { toggle() {} }, querySelector: selector => selector === 'strong' ? title : detail };
  const calendar = { dataset: { cycleId: 'benito-cycle' }, style: { display: '' } };
  const document = {
    querySelectorAll: () => [calendar],
    getElementById: id => ({
      'schedule-selection-summary': summary,
      'selected-practical-mode': { value: 'classes' },
      'preferred-instructor-select': { value: 'antonio', selectedIndex: 0, options: [{ textContent: 'Antonio Salgado' }] },
    })[id],
  };
  const view = vm.runInNewContext(`({${method}})`, { document });
  view.updateMobileTimePicker = () => {};
  view.getCalendarInstructorButton = current => {
    assert.equal(current, calendar);
    return { textContent: 'Benito Alonzo' };
  };
  const plan = [{ cycleId: 'benito-cycle', time: '08:00 - 09:40' }];
  view.updateScheduleSelectionSummary(plan, calendar);
  assert.equal(detail.textContent, 'Benito Alonzo');
  view.updateScheduleSelectionSummary(plan);
  assert.equal(detail.textContent, 'Benito Alonzo');
});

test('la edicion envia Benito aunque el selector conserve Antonio', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/js/views/students/StudentsView.js'), 'utf8');
  const method = source.slice(source.indexOf('  async collectStudentRecordEdit('), source.indexOf('  async handleStudentRecordEditSubmit('));
  const view = vm.runInNewContext(`({${method}})`);
  const calendar = { dataset: { cycleId: 'cycle' }, style: { display: '' } };
  const plan = { selections: [{ cycleId: 'cycle', date: '2026-10-26', time: '08:00 - 09:40' }] };
  const form = {
    elements: { schedulePlan: { value: JSON.stringify(plan) }, preferredInstructorId: { value: 'antonio' } },
    querySelector: () => null,
    querySelectorAll: selector => selector === '.enrollment-calendar' ? [calendar] : [],
  };
  view.recordEditContext = {
    student: { branch_id: 'branch' }, revision: 'revision', canSchedule: true,
    enrollments: [{ course_id: 'moto' }], assignments: [], documents: [],
  };
  view.getCalendarInstructorButton = selected => selected ? { dataset: { courseInstructorId: 'benito' } } : null;
  const payload = await view.collectStudentRecordEdit(form, { get: () => null });
  assert.equal(payload.academic.schedulePlan.preferredInstructorId, 'benito');
  plan.preferredInstructorId = 'benito';
  form.elements.schedulePlan.value = JSON.stringify(plan);
  form.querySelectorAll = () => [];
  const restored = await view.collectStudentRecordEdit(form, { get: () => null });
  assert.equal(restored.academic.schedulePlan.preferredInstructorId, 'benito');
});
