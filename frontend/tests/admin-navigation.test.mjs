import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map();
globalThis.sessionStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, value),
  removeItem: key => values.delete(key),
};
globalThis.window = { location: { pathname: '/admin-system' } };

const { default: SidebarLayout } = await import('../src/js/layouts/SidebarLayout.js');
const { authService } = await import('../src/js/core/auth/AuthService.js');
const { apiClient } = await import('../src/js/core/api/ApiClient.js');

function session(user) {
  values.set('erp_session', JSON.stringify(user));
}

test('ADMIN_SYSTEM muestra navegación global sin Financiero ni Académico', async () => {
  session({ roles: ['ADMIN_SYSTEM'], role: 'Administrador', permissions: ['ATM_DOCUMENT_GENERATE'], branch: 'Global' });
  const html = await SidebarLayout.render('<p>Contenido</p>');
  const expected = ['/admin-system', '/admin-system/branches', '/admin-system/reports', '/admin-system/audit', '/admin-system/settings'];
  expected.forEach(route => assert.match(html, new RegExp(`href="${route.replaceAll('/', '\\/')}"`)));
  assert.doesNotMatch(html, /href="\/admin-system\/finance"/);
  assert.doesNotMatch(html, /href="\/admin-system\/academic"/);
  assert.doesNotMatch(html, /href="\/admin-system\/security"/);
  assert.doesNotMatch(html, /href="\/atm-authorizations"/);
  assert.ok(expected.map(route => html.indexOf(`href="${route}"`)).every((position, index, positions) => index === 0 || position > positions[index - 1]));
});

test('la reorganización no retira la navegación operativa de otros roles', async () => {
  window.location.pathname = '/cash/pending';
  session({ name: 'Caja', roles: [], role: 'caja', permissions: ['PAYMENT_VIEW'], branch: 'Matriz' });
  const html = await SidebarLayout.render('<p>Contenido</p>');
  assert.match(html, /href="\/cash\/pending"/);
  assert.match(html, /Historial de cobros/);
});

test('GENERAL_MANAGER muestra exclusivamente la navegación gerencial', async () => {
  window.location.pathname = '/manager';
  session({ roles: ['GENERAL_MANAGER'], role: 'admin', permissions: ['REPORT_VIEW', 'PAYMENT_VIEW'], branch: 'Global' });
  const html = await SidebarLayout.render('<p>Contenido</p>');
  const expected = ['/manager', '/manager/finance', '/manager/academic', '/manager/branches', '/manager/reports', '/manager/audit'];
  expected.forEach(route => assert.match(html, new RegExp(`href="${route.replaceAll('/', '\\/')}"`)));
  assert.doesNotMatch(html, /href="\/students"/);
  assert.doesNotMatch(html, /href="\/cash\/pending"/);
  assert.doesNotMatch(html, /href="\/reports"/);
  assert.doesNotMatch(html, /href="\/admin-system"/);
  assert.match(html, /manager-mobile-layout/);
});

test('GENERAL_MANAGER no activa el layout móvil fuera de /manager', async () => {
  window.location.pathname = '/students';
  session({ roles: ['GENERAL_MANAGER'], role: 'admin', permissions: ['STUDENT_VIEW'], branch: 'Global' });
  const html = await SidebarLayout.render('<p>Contenido</p>');
  assert.doesNotMatch(html, /manager-mobile-layout/);
  assert.match(html, /href="\/students"/);
});

test('refreshAuthorization conserva permisos existentes si la respuesta viene vacía', async () => {
  const previous = {
    name: 'Ana',
    role: 'admin',
    roles: ['GENERAL_MANAGER'],
    permissions: ['STUDENT_VIEW', 'PAYMENT_VIEW', 'REPORT_VIEW'],
    branch: 'Global',
    branch_id: 'branch-1',
    apiToken: 'token-123',
    scope: 'GLOBAL',
  };
  values.set('erp_session', JSON.stringify(previous));
  const originalGet = apiClient.get;
  apiClient.get = async () => ({ success: true, data: { roles: [], permissions: [], scope: 'BRANCH', instructorType: null, practiceArea: null, mustChangePassword: false } });

  try {
    const refreshed = await authService.refreshAuthorization('branch-1');
    assert.deepEqual(refreshed.roles, previous.roles);
    assert.deepEqual(refreshed.permissions, previous.permissions);
    assert.equal(refreshed.scope, 'GLOBAL');
  } finally {
    apiClient.get = originalGet;
  }
});

test('refreshAuthorization conserva el bloque completo si la respuesta es parcial', async () => {
  const previous = {
    role: 'admin',
    roles: ['ADMIN_SYSTEM'],
    permissions: ['STUDENT_VIEW', 'PAYMENT_VIEW'],
    scope: 'GLOBAL',
    apiToken: 'token-partial',
  };
  values.set('erp_session', JSON.stringify(previous));
  const originalGet = apiClient.get;
  apiClient.get = async () => ({ success: true, data: { roles: ['GENERAL_MANAGER'], permissions: [], scope: 'BRANCH' } });

  try {
    const refreshed = await authService.refreshAuthorization();
    assert.deepEqual(refreshed.roles, previous.roles);
    assert.deepEqual(refreshed.permissions, previous.permissions);
    assert.equal(refreshed.scope, previous.scope);
  } finally {
    apiClient.get = originalGet;
  }
});
