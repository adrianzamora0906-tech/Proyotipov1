import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const service = await readFile(new URL('../../backend/services/CashOperationsService.js', import.meta.url), 'utf8');
const migration = await readFile(new URL('../../backend/migrations/enterprise/104_central_transfer_verifier.sql', import.meta.url), 'utf8');

test('Gema Obregon queda configurada como verificadora central única', () => {
  assert.match(migration, /username = 'spic2_gema\.obregon'/);
  assert.match(migration, /DELETE FROM role_permissions/);
  assert.match(migration, /user_id <> gema_id/);
  assert.match(migration, /payments\.central_transfer_verifier_user_id/);
});

test('la verificación central conserva la sucursal original del pago', () => {
  assert.match(service, /isCentralTransferVerifier/);
  assert.match(service, /\(\$2::uuid IS NULL OR tv\.branch_id=\$2\)/);
  assert.match(service, /collectionBranchId:row\.branch_id/);
  assert.match(service, /branchId:row\.branch_id/);
});
