const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
const branch = '11111111-1111-4111-8111-111111111111', studentId = '22222222-2222-4222-8222-222222222222';
const instructor = '33333333-3333-4333-8333-333333333333', alternative = '44444444-4444-4444-8444-444444444444';
const base = process.env.REACT_TEST_URL || 'http://127.0.0.1:5187';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let scenarios = 0;
  const browserErrors = [];
  const contexts = [];
  async function open(options = {}) {
    const context = await browser.newContext(); contexts.push(context);
    const permissions = options.denied ? ['STUDENT_VIEW'] : ['STUDENT_VIEW', 'STUDENT_CREATE', ...(options.noUpload ? [] : ['DOCUMENT_CREATE'])];
    await context.addInitScript(user => sessionStorage.setItem('erp_session', JSON.stringify(user)), {
      userId: 'operator', sessionId: 'practice-session', apiToken: 'test-token', refreshToken: 'test-refresh',
      branch_id: branch, scope: 'BRANCH', roles: ['SECRETARY'], permissions,
    });
    const page = await context.newPage(); page.setDefaultTimeout(10_000);
    const requests = [], errors = [];
    page.on('pageerror', error => { errors.push(error.message); browserErrors.push(error.message); });
    let instructorError = Boolean(options.instructorError), checks = 0;
    const existing = options.existing ? { id: studentId, identification: '0000000001', first_name: 'Alumno', last_name: 'Existente',
      former_student: true, birth_date: '1980-12-18', email: 'existing@example.test', status: 'matriculado' } : null;
    await page.route('**/api/**', async route => {
      const req = route.request(), url = new URL(req.url()), path = url.pathname;
      if (!path.startsWith('/api/')) return route.continue();
      const body = req.method() === 'GET' ? null : req.postDataJSON();
      requests.push({ path, method: req.method(), query: Object.fromEntries(url.searchParams), body });
      const ok = data => route.fulfill({ json: { success: true, data } });
      if (path === '/api/students/branches/all') return ok([{ id: branch, name: 'Sucursal de pruebas', city_id: 'city' }]);
      if (path === '/api/students/instructors/branch') {
        assert.equal(url.searchParams.get('branch_id'), branch);
        if (instructorError) return route.fulfill({ status: 503, json: { success: false, error: 'No se pudo cargar instructores' } });
        return ok([{ id: instructor, name: 'Instructor de prueba con nombre muy largo para comprobar el ajuste de pantalla', branch_id: branch, priority_branch: true },
          { id: alternative, name: 'Instructor alternativo', branch_id: branch }, { id: 'other', name: 'Instructor de otra sucursal', branch_id: 'other-branch' }]);
      }
      if (path === '/api/students/additional-practices/resolve') return ok(existing);
      if (path === '/api/students/additional-practices/availability') {
        checks++;
        const unavailable = options.conflict && url.searchParams.get('instructor_id') === instructor || options.lastConflict && checks > 1;
        return ok({ available: !unavailable, available_from: '2026-11-02', conflict_dates: unavailable ? ['2026-10-26'] : [],
          instructor_name: 'Instructor de prueba', alternative_instructor: { id: alternative, name: 'Instructor alternativo' } });
      }
      if (path === '/api/students' && req.method() === 'POST') {
        assert(!('birthDate' in body)); assert.equal(body.registrationType, 'ADDITIONAL_PRACTICE');
        await new Promise(resolve => setTimeout(resolve, 60));
        return ok({ id: studentId, identification: body.identification, first_name: body.firstName, last_name: body.lastName });
      }
      if (path === '/api/students/' + studentId + '/documents') {
        assert.equal(body.type, 'licencia'); assert(body.fileUrl.startsWith('data:application/pdf;base64,'));
        if (options.documentError) return route.fulfill({ status: 422, json: { success: false, error: 'Documento rechazado' } });
        return ok({ id: 'document' });
      }
      if (path === '/api/students/' + studentId + '/additional-practices') {
        assert.equal(body.payment_method, 'pendiente'); assert.equal(body.number_of_days, 3);
        if (options.uncertain) return route.abort('failed');
        if (options.practiceError) return route.fulfill({ status: 409, json: { success: false, error: 'Cupo ocupado al guardar' } });
        return ok({ id: 'practice', access: { created: true, username: '0000000001', temporaryPassword: 'TEMPORAL-PRUEBA' } });
      }
      if (path === '/api/documents/mobile-upload-token') return ok({ token: 'a'.repeat(64) });
      if (path === '/api/documents/mobile-upload-token/' + 'a'.repeat(64) + '/result') return ok({ completed: true, fileUrl: 'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK' });
      throw new Error('API inesperada: ' + req.method() + ' ' + path);
    });
    await page.goto(base + '/tests/fixtures/practice-registration.html');
    const dialog = page.getByRole('dialog', { name: 'Registrar horas prácticas', exact: true });
    const next = () => dialog.getByRole('button', { name: 'Continuar', exact: true }).click();
    const plan = async (conflict = false) => {
      await dialog.getByRole('button', { name: /Instructor de prueba con nombre/ }).click();
      assert.equal(await dialog.getByRole('button', { name: 'Instructor de otra sucursal', exact: true }).count(), 0);
      await dialog.getByLabel('Fecha de inicio', { exact: true }).fill('2026-10-26');
      await dialog.getByLabel('Horario diario', { exact: true }).selectOption('08:00');
      await dialog.getByLabel('Duración', { exact: true }).selectOption('3');
      if (conflict) await dialog.getByRole('button', { name: 'Usar a Instructor alternativo', exact: true }).click();
      await dialog.getByText('Instructor disponible para las fechas seleccionadas.', { exact: true }).waitFor();
      await next();
    };
    const identity = async () => {
      await dialog.getByLabel('Buscar cédula', { exact: true }).fill('0000000001');
      await dialog.getByLabel('Nombres', { exact: true }).waitFor();
      assert.equal(await dialog.getByLabel('Fecha de nacimiento', { exact: true }).count(), 0);
      if (!options.existing) { await dialog.getByLabel('Nombres', { exact: true }).fill('Alumno'); await dialog.getByLabel('Apellidos', { exact: true }).fill('Nuevo'); }
      else assert.equal(await dialog.getByLabel('Nombres', { exact: true }).getAttribute('readonly'), '');
      await next();
    };
    return { page, context, dialog, next, plan, identity, requests, errors, allowInstructors: () => { instructorError = false; } };
  }
  try {
    let test = await open({ denied: true });
    await test.page.getByText('No tienes permiso para registrar o consultar estudiantes.', { exact: true }).waitFor();
    assert.equal(test.requests.length, 0); scenarios++;

    test = await open({ noUpload: true }); await test.plan(); await test.identity();
    await test.next(); await test.dialog.getByText('$60.00', { exact: true }).waitFor();
    await test.dialog.getByRole('button', { name: 'Confirmar registro', exact: true }).evaluate(button => { button.click(); button.click(); });
    await test.page.getByRole('dialog', { name: 'Prácticas registradas', exact: true }).waitFor();
    assert.equal(await test.dialog.count(), 0);
    assert.equal(test.requests.filter(r => r.path === '/api/students' && r.method === 'POST').length, 1);
    assert.equal(test.requests.filter(r => r.path.endsWith('/additional-practices') && r.method === 'POST').length, 1);
    assert(!test.requests.some(r => r.path.endsWith('/documents')));
    assert(!test.requests.some(r => r.path.startsWith('/api/payments')));
    await test.page.getByRole('button', { name: 'Abrir expediente', exact: true }).click();
    assert.equal(await test.page.evaluate(() => window.registeredPracticeStudent), studentId);
    assert.equal(await test.page.getByText('TEMPORAL-PRUEBA').count(), 0); scenarios++;

    test = await open({ existing: true }); await test.plan(); await test.identity(); await test.next();
    await test.dialog.getByText('$51.00', { exact: true }).waitFor();
    await test.dialog.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
    await test.page.getByRole('dialog', { name: 'Prácticas registradas', exact: true }).waitFor();
    assert(!test.requests.some(r => r.path === '/api/students' && r.method === 'POST'));
    assert(!test.requests.some(r => r.method === 'PUT')); scenarios++;

    const documents = await test.page.evaluate(async () => {
      const prepare = window.preparePracticeDocument;
      let rejected = 0;
      for (const value of ['data:text/plain;base64,SG9sYQ==', 'data:application/pdf;base64,SG9sYQ==', 'https://example.test/no-es-captura']) {
        try { await prepare(undefined, value); } catch { rejected++; }
      }
      const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20;
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      const image = await prepare(new File([blob], 'licencia.png', { type: 'image/png' }));
      return { omitted: await prepare(), rejected, image: image.type === 'licencia' && image.fileUrl.startsWith('data:application/pdf;base64,') };
    });
    assert.equal(documents.omitted, null); assert.equal(documents.rejected, 3); assert(documents.image); scenarios++;

    test = await open(); await test.plan(); await test.identity(); await test.next();
    await test.page.evaluate(() => window.practiceTestAuth.getState().updateSession({ permissions: ['STUDENT_VIEW'] }));
    await test.page.getByText('No tienes permiso para registrar o consultar estudiantes.', { exact: true }).waitFor();
    assert(!test.requests.some(r => r.method === 'POST')); scenarios++;

    test = await open({ instructorError: true });
    await test.dialog.getByRole('button', { name: 'Reintentar instructores', exact: true }).waitFor();
    await test.dialog.getByLabel('Fecha de inicio', { exact: true }).fill('2026-10-26');
    test.allowInstructors(); await test.dialog.getByRole('button', { name: 'Reintentar instructores', exact: true }).click();
    await test.dialog.getByRole('button', { name: /Instructor de prueba con nombre/ }).waitFor();
    assert.equal(await test.dialog.getByLabel('Fecha de inicio', { exact: true }).inputValue(), '2026-10-26'); scenarios++;

    test = await open({ conflict: true }); await test.plan(true);
    assert(test.requests.some(r => r.path.endsWith('/availability') && r.query.instructor_id === alternative)); scenarios++;

    test = await open(); await test.plan(); await test.identity();
    await test.dialog.getByLabel('Adjuntar documento', { exact: true }).setInputFiles({ name: 'mal.txt', mimeType: 'text/plain', buffer: Buffer.from('invalid') });
    await test.next(); await test.dialog.getByText('Selecciona un PDF, JPG o PNG.', { exact: true }).waitFor();
    assert(!test.requests.some(r => r.method === 'POST'));
    await test.dialog.getByRole('button', { name: 'Quitar documento', exact: true }).click();
    await test.dialog.getByRole('button', { name: 'Capturar desde teléfono', exact: true }).click();
    await test.dialog.getByRole('button', { name: 'Usar captura', exact: true }).click();
    await test.next(); await test.dialog.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
    await test.page.getByRole('dialog', { name: 'Prácticas registradas', exact: true }).waitFor();
    assert.equal(test.requests.filter(r => r.path.endsWith('/documents') && r.method === 'POST').length, 1); scenarios++;

    for (const options of [{ practiceError: true }, { uncertain: true }, { documentError: true }, { lastConflict: true }]) {
      test = await open(options); await test.plan(); await test.identity();
      if (options.documentError) await test.dialog.getByLabel('Adjuntar documento', { exact: true }).setInputFiles({ name: 'licencia.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
      await test.next(); await test.dialog.getByRole('button', { name: 'Confirmar registro', exact: true }).click();
      if (options.lastConflict) {
        await test.dialog.getByText('El instructor ya no está disponible. Cambia la fecha o selecciona otro instructor.', { exact: true }).waitFor();
        assert(!test.requests.some(r => r.method === 'POST'));
      } else {
        await test.page.getByRole('dialog', { name: 'Resultado del registro', exact: true }).waitFor();
        assert.equal(await test.dialog.count(), 0);
        if (options.practiceError) await test.page.getByText('El estudiante se registró, pero no se le asignó un instructor.', { exact: true }).waitFor();
        if (options.uncertain) await test.page.getByText(/no se pudo confirmar la asignación/).waitFor();
        if (options.documentError) assert(!test.requests.some(r => r.path.endsWith('/additional-practices') && r.method === 'POST'));
      }
      scenarios++;
    }
    test = await open(); await test.plan(); // Step 2; use a fresh wizard for calendar screenshots.
    await test.dialog.getByRole('button', { name: 'Anterior', exact: true }).click();
    for (const width of [360, 390, 768, 955, 1280, 1920]) {
      await test.page.setViewportSize({ width, height: 800 });
      const fits = await test.dialog.evaluate(dialog => {
        const bounds = dialog.getBoundingClientRect();
        const header = dialog.querySelector('header').getBoundingClientRect();
        const footer = dialog.querySelector('footer').getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1 && header.bottom <= footer.top;
      });
      assert(fits, 'Modal fuera de pantalla a ' + width);
      assert(await test.dialog.getByRole('region', { name: 'Calendario de prácticas', exact: true }).evaluate(element => element.clientWidth <= innerWidth));
    }
    await test.page.screenshot({ path: '.tmp/react-practice-registration-1920.png' });
    await test.page.setViewportSize({ width: 390, height: 800 });
    await test.page.screenshot({ path: '.tmp/react-practice-registration-390.png' }); scenarios++;
    for (const context of contexts) {
      for (const page of context.pages()) assert(page.url().startsWith(base), 'Navegación inesperada');
    }
    assert.deepEqual(browserErrors, [], 'Errores de ejecución en el navegador');
    console.log('PASS: ' + scenarios + ' escenarios de prácticas React, permisos, documento opcional/captura, precios, disponibilidad fresca, doble envío, resultados parciales y seis anchos. API simulada; sin datos reales.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
