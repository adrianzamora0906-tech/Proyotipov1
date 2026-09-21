import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  __SPORTMANCAR_CONFIG__: {},
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/' },
  setTimeout,
  clearTimeout,
};

const { default: ApiClient } = await import('../src/js/core/api/ApiClient.js');

test('consultas 401 simultáneas comparten una sola renovación de token', async () => {
  const values = new Map();
  global.sessionStorage = {
    getItem: key => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };
  sessionStorage.setItem('erp_api_token', 'expired-token');
  sessionStorage.setItem('erp_session', JSON.stringify({ apiToken: 'expired-token', refreshToken: 'refresh-1' }));
  let refreshCalls = 0;
  global.fetch = async (url, options = {}) => {
    if (url.endsWith('/auth/refresh')) {
      refreshCalls += 1;
      await new Promise(resolve => setTimeout(resolve, 10));
      return new Response(JSON.stringify({ success: true, data: { token: 'new-token', refreshToken: 'refresh-2', sessionId: 'session-2', roles: [], permissions: [], scope: 'BRANCH' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (options.headers?.Authorization === 'Bearer new-token') return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify({ success: false, error: 'Token expirado' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  };
  const client = new ApiClient();
  const results = await Promise.all([client.get('/one'), client.get('/two')]);
  assert.equal(refreshCalls, 1);
  assert.equal(results.every(result => result.success), true);
  assert.equal(JSON.parse(sessionStorage.getItem('erp_session')).refreshToken, 'refresh-2');
});

test('performRefresh conserva la sesión actual si la respuesta de refresh llega vacía', async () => {
  const values = new Map();
  global.sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  };

  const existingSession = {
    apiToken: 'expired-token',
    refreshToken: 'refresh-1',
    sessionId: 'session-1',
    roles: ['GENERAL_MANAGER'],
    permissions: ['STUDENT_VIEW', 'PAYMENT_VIEW', 'REPORT_VIEW'],
    scope: 'GLOBAL',
    branch_id: 'branch-1',
    username: 'ana',
  };
  sessionStorage.setItem('erp_session', JSON.stringify(existingSession));
  global.fetch = async (url) => {
    if (url.endsWith('/auth/refresh')) {
      return new Response(JSON.stringify({
        success: true,
        data: { token: 'new-token', refreshToken: 'refresh-2', sessionId: 'session-2', roles: [], permissions: [], scope: 'BRANCH' },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const client = new ApiClient();
  const ok = await client.performRefresh();
  assert.equal(ok, true);
  const updated = JSON.parse(sessionStorage.getItem('erp_session'));
  assert.deepEqual(updated.roles, existingSession.roles);
  assert.deepEqual(updated.permissions, existingSession.permissions);
  assert.equal(updated.scope, 'GLOBAL');
  assert.equal(updated.apiToken, 'new-token');
});
