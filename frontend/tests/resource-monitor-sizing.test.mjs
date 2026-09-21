import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const backend = await readFile(new URL('../../backend/services/ResourceTelemetryService.js', import.meta.url), 'utf8');
const frontend = await readFile(new URL('../src/js/views/admin/AdminResourceMonitorView.js', import.meta.url), 'utf8');

test('el dimensionamiento utiliza todo el periodo y no solo las últimas 100 filas', () => {
  assert.match(backend, /WITH scoped AS/);
  assert.match(backend, /peak_active_users_per_minute/);
  assert.match(backend, /peak_requests_per_minute/);
  assert.match(backend, /confidence/);
});

test('la pantalla muestra datos concretos para decidir la compra', () => {
  assert.match(frontend, /PERFIL SUGERIDO/);
  assert.match(frontend, /Pico de usuarios\/min/);
  assert.match(frontend, /Base de datos P95/);
  assert.match(frontend, /Dónde se concentra la carga/);
});
