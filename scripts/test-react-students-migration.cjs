const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { stripTypeScriptTypes } = require('node:module');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
// Pure rules run independently of a server or database.
const source = fs.readFileSync(path.join(__dirname, '../frontend-react/src/features/students/utils.ts'), 'utf8');
const moduleCode = stripTypeScriptTypes(source);
const utils = await import('data:text/javascript;base64,' + Buffer.from(moduleCode).toString('base64'));
assert.equal(utils.readFilters(new URLSearchParams(), true).status, 'active');
assert.equal(utils.readFilters(new URLSearchParams('status='), true).status, '');
assert.equal(utils.readFilters(new URLSearchParams('q=123'), false).search, '123');
assert.equal(utils.apiFilters({ status: 'active', registration_type: 'REGULAR', group: 'instructor', scope: 'created' }).scope, 'created');
assert(!('registration_type' in utils.apiFilters({ registration_type: 'REGULAR' })));
const branches = [{ id: 'home', name: 'Local', city_id: 'one' }, { id: 'neighbor', name: 'Vecina', city_id: 'one' }, { id: 'other', name: 'Ajena', city_id: 'two' }];
assert.equal(utils.branchesForScope(branches, 'home', false).length, 2);
assert.equal(utils.branchesForScope(branches, 'unknown', false).length, 0);
assert.equal(utils.branchesForScope(branches, 'home', true).length, 3);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const errors = [];
  try {
    const context = await browser.newContext();
    const user = { userId: 'test-operator', sessionId: 'test-session', username: 'prueba', name: 'Prueba', role: 'secretaria_sucursal',
      branch_id: 'home', roles: ['SECRETARY'], permissions: ['STUDENT_VIEW', 'STUDENT_CREATE'], scope: 'BRANCH', apiToken: 'mock-token', refreshToken: 'mock-refresh' };
    await context.addInitScript(user => sessionStorage.setItem('erp_session', JSON.stringify(user)), user);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    const requests = [];
    let fail = false, removed = false, deletes = 0;
    const students = Array.from({ length: 12 }, (_, i) => ({ id: 'student-' + i, identification: String(i).padStart(10, '0'),
      first_name: 'Alumno', last_name: String(i), branch_id: 'home', branch: 'Sede académica', city: 'Cantón',
      registered_by_branch_name: 'Sucursal del inscriptor', registered_by_city_name: 'Cantón del inscriptor',
      status: i ? 'matriculado' : 'pendiente_pago', registration_type: 'REGULAR', created_at: '2026-10-15T12:00:00Z' }));
    students.push({ ...students[0], id: 'practice', first_name: 'Práctica', registration_type: 'ADDITIONAL_PRACTICE' });
    const reservation = { id: 'reservation', name: 'Persona reservada', identification: '0000000099', course_name: 'Moto', start_date: '2026-10-19' };
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url());
      requests.push({ method: req.method(), pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
      if (fail) return route.fulfill({ status: 403, json: { success: false, error: 'Sin acceso a este listado' } });
      if (url.pathname === '/api/students/branches/all') return route.fulfill({ json: { success: true, data: branches } });
      if (req.method() === 'DELETE') { deletes++; removed = true; return route.fulfill({ json: { success: true } }); }
      if (url.pathname === '/api/students/list-summary') return route.fulfill({ json: { success: true, data: { counts: [
        { status: 'matriculado', registration_type: 'REGULAR', active: true, count: 11 },
        { status: 'pendiente_pago', registration_type: 'REGULAR', active: false, count: 1 },
        { status: 'matriculado', registration_type: 'ADDITIONAL_PRACTICE', active: true, count: 1 },
        { status: 'inhabilitado', registration_type: 'REGULAR', active: false, count: 1 }
      ], reservations: removed ? 0 : 1 } } });
      if (url.pathname === '/api/students/reservations') return route.fulfill({ json: { success: true, data: { reservations: removed ? [] : [reservation], total: removed ? 0 : 1, page: 1, pageSize: 10 } } });
      if (url.pathname !== '/api/students') throw new Error('Endpoint no permitido en prueba: ' + url.pathname);
      const status = url.searchParams.get('status'), search = url.searchParams.get('search');
      let result = status === 'inhabilitado' ? [{ ...students[0], id: 'disabled', first_name: 'Inhabilitado', status }] : students;
      if (status === 'active') result = result.filter(s => s.status === 'matriculado');
      if (status === 'payment_pending') result = result.filter(s => s.status === 'pendiente_pago');
      if (search === 'anterior') { await new Promise(resolve => setTimeout(resolve, 450)); result = [{ ...students[0], first_name: 'Respuesta anterior' }]; }
      if (search === 'actual') result = [{ ...students[0], first_name: 'Respuesta actual' }];
      assert.equal(url.searchParams.get('paginated'), 'true');
      const type = url.searchParams.get('registration_type');
      if (type) result = result.filter(row => row.registration_type === type);
      const pageNumber = Number(url.searchParams.get('page')) || 1;
      return route.fulfill({ json: { success: true, data: { students: result.slice((pageNumber - 1) * 10, pageNumber * 10), total: result.length, page: pageNumber, pageSize: 10 } } }).catch(() => {});
    });
    const entry = (process.env.REACT_TEST_URL || 'http://127.0.0.1:5187') + '/tests/fixtures/students.html';
    await page.goto(entry);
    await page.getByRole('link', { name: 'Alumno 0', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr[data-student-id]').count(), 10);
    assert(!requests.some(r => r.pathname === '/api/students/reservations'));
    assert.equal(await page.locator('tbody tr[data-student-id]').first().locator('td').nth(3).textContent(), 'Sucursal del inscriptor');
    await page.waitForResponse(response => new URL(response.url()).searchParams.get('page') === '2');
    assert.equal(await page.locator('tbody tr[data-student-id]').count(), 10);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('tbody tr[data-student-id]').length === 2);
    assert.equal(await page.locator('tbody tr[data-student-id]').count(), 2);
    assert(requests.some(r => r.query.page === '2' && r.query.paginated === 'true'));
    assert.equal(requests.filter(r => r.pathname === '/api/students/list-summary').length, 1);
    await page.getByLabel('Estado', { exact: true }).selectOption('payment_pending');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr[data-student-id]').length === 1);
    assert(requests.some(r => r.query.status === 'payment_pending' && r.query.registration_type === 'REGULAR'));
    assert(requests.some(r => !r.query.status && !r.query.registration_type && r.query.scope === 'all'));
    await page.getByRole('button', { name: /Limpiar filtros/ }).click();
    await page.getByRole('button', { name: /Prácticas adicionales/ }).click();
    await page.getByRole('link', { name: 'Práctica 0', exact: true }).waitFor();
    await page.getByRole('button', { name: /Inhabilitados/ }).click();
    await page.getByRole('button', { name: /Cursos regulares/ }).click();
    await page.getByRole('link', { name: 'Inhabilitado 0', exact: true }).waitFor();
    await page.getByRole('button', { name: /Reservados/ }).click();
    await page.getByText('Persona reservada', { exact: true }).waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByText('No hay reservas con estos filtros.').waitFor();
    assert.equal(deletes, 1);
    await page.getByRole('button', { name: /Limpiar filtros/ }).click();
    const search = page.getByRole('searchbox', { name: 'Buscar', exact: true });
    await search.fill('anterior');
    await page.waitForRequest(req => new URL(req.url()).searchParams.get('search') === 'anterior');
    await search.fill('actual');
    await page.getByRole('link', { name: 'Respuesta actual 0', exact: true }).waitFor();
    await page.waitForTimeout(600);
    assert.equal(await page.getByRole('link', { name: 'Respuesta anterior 0', exact: true }).count(), 0);
    assert.equal(await search.inputValue(), 'actual');
    await page.evaluate(() => window.migrationAuthStore.getState().setSession({ ...window.migrationAuthStore.getState().user, userId: 'reader', sessionId: 'reader-session', permissions: ['STUDENT_VIEW'] }));
    assert.equal(await page.getByRole('link', { name: 'Nuevo estudiante', exact: true }).count(), 0);
    fail = true;
    await page.getByRole('button', { name: 'Actualizar', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Sin acceso a este listado' }).waitFor();
    assert.equal(await page.locator('tbody tr[data-student-id]').count(), 0);
    await page.evaluate(() => window.migrationAuthStore.getState().clearSession());
    await page.getByRole('alert').filter({ hasText: 'No tienes permiso para consultar estudiantes' }).waitFor();
    assert.equal(await page.locator('tbody').count(), 0);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: alcance, filtros, paginación, resumen, tipos, inhabilitados, reservas, búsqueda concurrente, cambio de sesión, errores y ausencia de escrituras reales.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
