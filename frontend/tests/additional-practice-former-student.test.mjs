import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const PracticeService = require('../../backend/services/AdditionalPracticeService.js');
const source = fs.readFileSync(new URL('../src/js/views/students/StudentsView.js', import.meta.url), 'utf8');
const methods = source.slice(source.indexOf('  isFormerAdditionalPracticeStudent() {'), source.indexOf('  updateRegistrationPaymentSummary() {'));

function priceView({ checked = false, existing = null, days = 3 } = {}) {
  const checkbox = { checked };
  const payment = {};
  const total = {};
  const rate = {};
  const form = { querySelector(selector) {
    return selector.includes('FormerStudent') ? checkbox : selector.includes('Days') ? { value: days } : payment;
  } };
  const context = vm.createContext({ document: { getElementById(id) {
    return { 'student-modal-form': form, 'additional-practice-total': total, 'additional-practice-rate': rate }[id];
  } } });
  const View = vm.runInContext(`(class View { ${methods} })`, context);
  const view = new View();
  view.additionalPracticeStudent = existing;
  return { view, total, rate, payment };
}

test('persona sin registro puede declararse antigua estudiante y recibir tarifa de $17', () => {
  const { view, total, payment } = priceView({ checked: true });
  assert.equal(view.isFormerAdditionalPracticeStudent(), true);
  view.updateAdditionalPracticePrice();
  assert.equal(total.textContent, '$51,00');
  assert.equal(payment.value, '51.00');
  assert.equal(PracticeService.calculatePrice(3, true).totalAmount, 51);
});

test('persona externa mantiene tarifa de $20 y estudiante detectado conserva tarifa de $17', () => {
  const external = priceView();
  external.view.updateAdditionalPracticePrice();
  assert.equal(external.total.textContent, '$60,00');
  const existing = priceView({ existing: { former_student: true } });
  existing.view.updateAdditionalPracticePrice();
  assert.equal(existing.total.textContent, '$51,00');
});

test('paquete de ocho dias mantiene $136 con o sin declaracion', () => {
  for (const checked of [false, true]) {
    const { view, total } = priceView({ checked, days: 8 });
    view.updateAdditionalPracticePrice();
    assert.equal(total.textContent, '$136,00');
    assert.equal(PracticeService.calculatePrice(8, checked).totalAmount, 136);
  }
});
