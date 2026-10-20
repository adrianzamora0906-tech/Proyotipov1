import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/js/core/api/ApiClient.js', import.meta.url), 'utf8');
const primary = 'https://primary.example/api';
const backup = 'https://backup.example/api';

test('respaldo de API: lecturas, autenticacion, escrituras y cancelacion', async () => {
  globalThis.window = {
    __SPORTMANCAR_CONFIG__: { API_BASE_URL: primary, API_FALLBACK_URL: backup },
    location: { origin: 'https://erp.example', hostname: 'erp.example' },
    setTimeout, clearTimeout, dispatchEvent() {},
  };
  const { default: ApiClient } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const originalFetch = globalThis.fetch;
  try {
    let calls = [];
    globalThis.fetch = async url => {
      calls.push(url);
      if (url.startsWith(primary)) throw new TypeError('Failed to fetch');
      return new Response('{}');
    };
    const client = new ApiClient();
    await client.fetchWithFallback('/students');
    assert.deepEqual(calls, [primary + '/students', backup + '/students']);
    assert.equal(client.getBaseUrls()[0], backup);

    calls = [];
    const writer = new ApiClient();
    await writer.fetchWithFallback('/payments', { method: 'POST' });
    assert.deepEqual(calls, [primary + '/health', backup + '/health', backup + '/payments']);

    calls = [];
    globalThis.fetch = async url => { calls.push(url); throw new TypeError('Failed to fetch'); };
    await assert.rejects(writer.fetchWithFallback('/payments', { method: 'POST' }));
    assert.deepEqual(calls, [backup + '/payments']);

    calls = [];
    globalThis.fetch = async url => { calls.push(url); return new Response('{}', { status: 401 }); };
    assert.equal((await new ApiClient().fetchWithFallback('/students')).status, 401);
    assert.equal(calls.length, 1);

    calls = [];
    globalThis.fetch = async url => { calls.push(url); return new Response('{}', { status: url.startsWith(primary) ? 502 : 200 }); };
    assert.equal((await new ApiClient().fetchWithFallback('/students')).status, 200);
    assert.equal(calls.length, 2);

    calls = [];
    await assert.rejects(new ApiClient().fetchWithFallback('/students', { signal: AbortSignal.abort() }));
    assert.equal(calls.length, 0);

    globalThis.fetch = async (_url, options) => {
      if (_url.startsWith(backup)) return new Response('{}');
      return new Promise((_, reject) => options.signal.addEventListener('abort', () => reject(new Error('timeout'))));
    };
    window.setTimeout = callback => setTimeout(callback, 1);
    const timeoutClient = new ApiClient();
    assert.equal((await timeoutClient.fetchWithFallback('/health')).status, 200);
    assert.equal(timeoutClient.lastBaseUrl, backup);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window;
  }
});
