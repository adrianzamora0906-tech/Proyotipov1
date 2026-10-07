import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../../backend/services/PaymentService.js', import.meta.url), 'utf8');
const cash = await readFile(new URL('../src/js/views/cash/PendingPaymentsView.js', import.meta.url), 'utf8');
const operations = await readFile(new URL('../../backend/services/CashOperationsService.js', import.meta.url), 'utf8');

test('caja recibe saldo por confirmar y disponible para cobrar', () => {
  assert.match(backend, /AS "pendingVerification"/);
  assert.match(backend, /availableToCollect:Math\.max/);
  assert.match(cash, /por confirmar/);
  assert.match(cash, /Saldo disponible para cobrar/);
  assert.match(cash, /<th>Transferencia<\/th><th>Saldo<\/th>/);
  assert.match(cash, /this\.money\(availableToCollect\)/);
  assert.match(cash, /transfer-pending-badge">POR CONFIRMAR<\/span><strong>\$\{this\.money\(pendingVerification\)\}/);
  assert.doesNotMatch(cash, /Comprobante: \$\{this\.escape\(p\.pendingTransferReference/);
  assert.match(cash, /availableToCollect <= 0 \? 'disabled/);
});

test('no permite registrar transferencias que superen el saldo disponible', () => {
  assert.match(operations, /Este servicio ya tiene una transferencia por confirmar/);
  assert.match(operations, /Number\(data\.amount\)\+Number\(pending\.total\)>Number\(payment\.balance\)/);
});
