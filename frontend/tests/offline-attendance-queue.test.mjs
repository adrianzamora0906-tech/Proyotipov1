import test from 'node:test';
import assert from 'node:assert/strict';

import { OfflineAttendanceQueue } from '../src/js/lib/offlineAttendanceQueue.js';

test('agrega elementos pendientes para asistencia offline', async () => {
  await OfflineAttendanceQueue.clear();

  const recordId = await OfflineAttendanceQueue.add({
    action: 'confirm',
    token: 'token-123',
    phase: 'ENTRY',
    studentId: 'student-42',
    payload: { lastFour: '1234', latitude: -0.9, longitude: -80.7, accuracy: 450 },
  });

  assert.ok(recordId);
  const pending = await OfflineAttendanceQueue.getPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].action, 'confirm');
});

test('sincroniza los elementos pendientes eliminándolos al enviarlos', async () => {
  await OfflineAttendanceQueue.clear();
  await OfflineAttendanceQueue.add({
    action: 'confirm',
    token: 'token-456',
    phase: 'ENTRY',
    studentId: 'student-42',
    payload: { lastFour: '5678', latitude: -0.91, longitude: -80.72, accuracy: 500 },
  });

  const sent = [];
  await OfflineAttendanceQueue.syncPending({
    async request({ path, method, body }) {
      sent.push({ path, method, body });
      return { ok: true };
    },
  });

  assert.equal(sent.length, 1);
  const pendingAfter = await OfflineAttendanceQueue.getPending();
  assert.equal(pendingAfter.length, 0);
});

test('evita duplicados pendientes para la misma confirmación offline', async () => {
  await OfflineAttendanceQueue.clear();

  await OfflineAttendanceQueue.add({
    action: 'confirm',
    token: 'token-dup',
    phase: 'ENTRY',
    studentId: 'student-42',
    payload: { lastFour: '1234', latitude: -0.9, longitude: -80.7, accuracy: 450 },
  });

  const duplicateId = await OfflineAttendanceQueue.add({
    action: 'confirm',
    token: 'token-dup',
    phase: 'ENTRY',
    studentId: 'student-42',
    payload: { lastFour: '1234', latitude: -0.9, longitude: -80.7, accuracy: 450 },
  });

  const pending = await OfflineAttendanceQueue.getPending();
  assert.equal(pending.length, 1);
  assert.equal(duplicateId, pending[0].id);
});
