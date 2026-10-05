import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('security renders users with the paginated branch response', async () => {
  const source = await readFile(new URL('../src/js/views/admin/AdminSecurityView.js', import.meta.url), 'utf8');
  const branch = { id: 'portoviejo', name: 'Portoviejo' };
  const context = vm.createContext({
    Component: class {},
    permissionService: { can: () => true },
    SidebarLayout: { render: content => content },
    authService: { getCurrentUser: () => ({ userId: 'system-admin' }) },
    AdminService: {
      users: async () => ({ data: { data: [{ id: 'manager', username: 'gerente.general', first_name: 'Gerente', last_name: 'General', active: true, roles: [] }] } }),
      roles: async () => ({ data: [] }),
      permissions: async () => ({ data: [] }),
      sessions: async () => ({ data: [] }),
      branches: async () => ({ data: { data: [], filters: { branches: [branch] }, pagination: { total: 1 } } }),
    },
  });
  vm.runInContext(source.replace(/^import .*\r?\n/gm, '').replace('export default class', 'globalThis.SecurityView = class'), context);
  const view = new context.SecurityView();
  const html = await view.render();
  assert.match(html, /gerente\.general/);
  assert.match(html, /<option value="portoviejo">Portoviejo<\/option>/);
  assert.equal(view.error, undefined);
  assert.match(html, /id="security-filters"/);
  assert.match(html, /Generar clave temporal/);
  view.users = [{ id: 'system-admin', username: 'admin.system', roles: [{ code: 'ADMIN_SYSTEM', scope: 'GLOBAL' }] }];
  assert.doesNotMatch(view.userRows(), /security-reset/);
  assert.match(view.userRows(), /Global/);
});
