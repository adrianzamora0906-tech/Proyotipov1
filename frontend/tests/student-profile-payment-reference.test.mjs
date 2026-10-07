import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const view = await readFile(new URL('../src/js/views/student-profile/StudentProfileView.js', import.meta.url), 'utf8');

test('el pago desde el perfil solicita y envia el comprobante de transferencia', () => {
  assert.match(view, /id="profile-payment-reference-group" hidden/);
  assert.match(view, /name="reference"/);
  assert.match(view, /referenceInput\.required = isTransfer/);
  assert.match(view, /reference: values\.get\('reference'\)/);
});

test('la transferencia queda pendiente y no intenta abrir un recibo inmediato', () => {
  assert.match(view, /if \(result\.pendingTransfer\)/);
  assert.match(view, /pendiente hasta su verificacion/);
  assert.match(view, /this\.closeProfileModal\(true\)/);
});

test('el pago con tarjeta conserva el lote obligatorio', () => {
  assert.match(view, /id="profile-payment-card-batch-group" hidden/);
  assert.match(view, /cardBatchInput\.required = isCard/);
  assert.match(view, /cardBatch: values\.get\('cardBatch'\)/);
});
