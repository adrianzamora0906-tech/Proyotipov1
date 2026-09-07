import test from 'node:test';
import assert from 'node:assert/strict';
import ApiClient from '../src/js/core/api/ApiClient.js';

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
