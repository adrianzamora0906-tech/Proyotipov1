import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stateMessage } from '../src/js/views/instructor/InstructorHelpers.js';

const source = fs.readFileSync(new URL('../src/js/views/instructor/CompleteSessionModal.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');

async function modalWith(completeSession) {
  const handlers = {};
  const submit = {};
  const errorBox = { hidden: true, focus() { this.focused = true; } };
  const mileage = { value: '105800', addEventListener() {} };
  const form = {
    querySelector(selector) {
      if (selector === '[data-submit-complete]') return submit;
      if (selector === '[data-complete-error]') return errorBox;
      if (selector === '[name="endMileage"]') return mileage;
      return { focus() {} };
    },
    addEventListener(name, handler) { handlers[name] = handler; },
  };
  const overlay = {
    querySelector(selector) { return selector === '[data-complete-session-form]' ? form : { focus() {} }; },
    querySelectorAll() { return []; },
    remove() { this.removed = true; },
  };
  class FormData {
    getAll() { return ['FRENADO']; }
    get(key) { return { performanceLevel: 'CUMPLIO_OBJETIVO', observations: '', endMileage: mileage.value }[key]; }
  }
  const context = vm.createContext({
    PracticalSessionService: { getAttendanceQrStatus: async () => ({ data: { requiresMileage: true, mileageEnabled: true } }), completeSession },
    stateMessage, FormData,
    document: { createElement: () => overlay, body: { appendChild() {} } },
    window: { alert() { throw Error('Unexpected alert'); } },
  });
  vm.runInContext(source, context);
  await context.openCompleteSessionModal('session-test');
  return { handlers, submit, errorBox, overlay, mileage, submitForm: () => handlers.submit({ preventDefault() {} }) };
}

test('muestra el motivo exacto de validacion 422 y permite corregir y reintentar', async () => {
  const message = 'El kilometraje final no puede ser menor que el kilometraje inicial';
  let calls = 0;
  const modal = await modalWith(async () => {
    if (++calls === 1) throw Object.assign(new Error('validation'), { status: 422, data: { error: { message } } });
    return { success: true };
  });
  await modal.submitForm();
  assert.equal(modal.errorBox.textContent, message);
  assert.equal(modal.errorBox.hidden, false);
  assert.equal(modal.errorBox.focused, true);
  assert.equal(modal.submit.textContent, 'Guardar y finalizar');
  assert.equal(modal.submit.disabled, false);
  assert.equal(modal.overlay.removed, undefined);
  assert.match(modal.overlay.innerHTML, /<\/div><div class="alert alert-error complete-session-error"/);
  await modal.submitForm();
  assert.equal(modal.overlay.removed, true);
});

test('muestra conflictos y tiempo de espera agotado con su mensaje', async () => {
  for (const error of [
    Object.assign(new Error('El plazo de 30 minutos para registrar la salida ya termino'), { status: 409 }),
    Object.assign(new Error('El servidor tardo demasiado en responder'), { code: 'REQUEST_TIMEOUT' }),
  ]) {
    const modal = await modalWith(async () => { throw error; });
    await modal.submitForm();
    assert.equal(modal.errorBox.textContent, error.message);
    assert.equal(modal.submit.disabled, false);
  }
});

test('un permiso rechazado no cierra el modal como si hubiera finalizado', async () => {
  const modal = await modalWith(async () => ({ success: false, status: 403, error: 'Sin permiso' }));
  await modal.submitForm();
  assert.equal(modal.overlay.removed, undefined);
  assert.equal(modal.errorBox.hidden, false);
  assert.equal(modal.submit.disabled, false);
});

test('mantiene el boton bloqueado y evita envios duplicados durante el guardado', async () => {
  let resolve, calls = 0;
  const pending = new Promise(done => { resolve = done; });
  const modal = await modalWith(() => { calls++; return pending; });
  const saving = modal.submitForm();
  modal.handlers.change();
  assert.equal(modal.submit.disabled, true);
  await modal.submitForm();
  assert.equal(calls, 1);
  resolve({ success: true });
  await saving;
  assert.equal(modal.overlay.removed, true);
});

test('kilometraje permite de tres a siete digitos y rechaza valores mas cortos o largos', async () => {
  let calls = 0;
  const modal = await modalWith(async () => { calls++; return { success: true }; });
  for (const value of ['1', '12', '12345678']) {
    modal.mileage.value = value;
    modal.handlers.change();
    assert.equal(modal.submit.disabled, true);
    await modal.submitForm();
    assert.equal(calls, 0);
  }
  for (const value of ['123', '1234567']) {
    modal.mileage.value = value;
    modal.handlers.change();
    assert.equal(modal.submit.disabled, false);
  }
});
