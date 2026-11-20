import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saveRegistrationDocuments } from '../src/js/services/RegistrationDocuments.js';

const deferred = () => { let resolve, reject; const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; };

test('inicia documentos independientes juntos y espera que terminen', async () => {
  const identity = deferred(), certificate = deferred(), started = [];
  const operation = saveRegistrationDocuments({ saveIdentity: () => { started.push('identity'); return identity.promise; }, saveCertificate: () => { started.push('certificate'); return certificate.promise; } });
  await Promise.resolve(); assert.deepEqual(started, ['identity', 'certificate']);
  identity.resolve(); certificate.resolve(); await operation;
});
test('la confirmacion de bachiller espera a la cedula', async () => {
  const identity = deferred(), started = [];
  const operation = saveRegistrationDocuments({ saveIdentity: () => { started.push('identity'); return identity.promise; }, saveCertificate: () => { started.push('certificate'); }, certificateNeedsIdentity: true });
  await Promise.resolve(); assert.deepEqual(started, ['identity']); identity.resolve(); await operation;
  assert.deepEqual(started, ['identity', 'certificate']);
});
test('espera las otras cargas antes de devolver el error', async () => {
  const certificate = deferred(); let done = false;
  const operation = saveRegistrationDocuments({ saveIdentity: () => { throw new Error('fallo'); }, saveCertificate: () => certificate.promise }).catch(error => { done = true; throw error; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(done, false);
  certificate.resolve(); await assert.rejects(operation, /fallo/);
});
