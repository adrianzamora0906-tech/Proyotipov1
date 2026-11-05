const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext();
    const user = { userId: 'test-staff', sessionId: 'test-session', apiToken: 'mock-token', refreshToken: 'mock-refresh',
      branch_id: 'branch', scope: 'BRANCH', roles: ['SECRETARY'], role: 'secretaria_sucursal', permissions: ['STUDENT_VIEW','STUDENT_UPDATE','DOCUMENT_VIEW','DOCUMENT_CREATE','DOCUMENT_UPDATE','DOCUMENT_DELETE','PAYMENT_VIEW','PAYMENT_CREATE','PAYMENT_VOID','SCHEDULE_VIEW','RECEIPT_VIEW'] };
    await context.addInitScript(user => sessionStorage.setItem('erp_session', JSON.stringify(user)), user);
    const page = await context.newPage(); page.setDefaultTimeout(10000);
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    let forbidden = false;
    const id = '11111111-1111-4111-8111-111111111111';
    const student = { id, identification: '0000000001', first_name: 'Alumno', last_name: 'Prueba', status: 'matriculado', branch_id: 'branch',
      branch: 'Sucursal', city: 'Cantón', email: 'test@example.test', notes: 'Nota original', access_account: { username: '0000000001', active: true, must_change_password: false }, enrollments: [{ id: 'auto', status: 'activo' }, { id: 'moto', status: 'activo' }] };
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const body = method === 'GET' ? null : request.postDataJSON();
      requests.push({ path: url.pathname, method, body });
      const ok = data => route.fulfill({ json: { success: true, data } });
      const path = url.pathname;
      if (path === '/api/students/11111111-1111-4111-8111-111111111111' && method === 'GET') return forbidden ? route.fulfill({ status: 403, json: { success: false, error: 'Expediente fuera de alcance' } }) : ok(student);
      if (path.endsWith('/documents')) return ok([{ id: 'doc', name: 'Cédula', type: 'cedula', file_url: 'javascript:alert(1)' },{id:'lazy',type:'certificado_bachiller',name:'Archivo diferido',file_url:'/api/students/11111111-1111-4111-8111-111111111111/documents/lazy/content'}]);
      if (path.endsWith('/documents/lazy/content')) return ok({file_url:'data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK'});
      if (path.endsWith('/history')) { const number=Number(url.searchParams.get('page') || 1); return ok({ items: [{ id: 'history-'+number, action: number===1?'Registro auditado':'Segunda pagina auditada', timestamp: '2026-10-16T15:00:00Z' }], page:number,pageSize:20,hasMore:number===1 }); }
      if (path.endsWith('/balance')) return ok({ total: 315, paid: 90, balance: 225, pendingVerification: 25, balanceAfterApproval: 200, enrollments: [
        { id: 'auto', course: 'Automóvil', total: 190, paid: 90, balance: 100 }, { id: 'moto', course: 'Moto', total: 125, paid: 0, balance: 125, pendingVerification: 25 }] });
      if (path.endsWith('/payments')) return ok({ page:1,pageSize:20,hasMore:false,items:[{ id: 'payment', amount: 90, status: 'ACTIVE', payment_method: 'efectivo', course_name: 'Automóvil' }] });
      if (path === '/api/payments/methods') return ok([{ code: 'transferencia', name: 'Transferencia', requires_reference: true }]);
      if (path === '/api/receipts/student/' + id) return ok([{ id: 'receipt', receipt_number: 'COMPROBANTE-PRUEBA' }]);
      if (path === '/api/receipts/receipt/print') return route.fulfill({ json: { success: true, html: '<p>Comprobante institucional</p><script>parent.receiptScriptExecuted=true</script>' } });
      if (path === '/api/payments/register') { assert.equal(body.enrollmentId, 'moto'); assert.equal(body.amount, 100); return ok({ pendingTransfer: true }); }
      if (path.endsWith('/edit-context')) return ok({ revision: 'revision-test', student });
      if (path.endsWith('/edit-preview')) { assert.equal(body.revision, 'revision-test'); return ok({ confirmationToken: 'confirmation-test', changes: [{ field: 'Nombres', before: 'Alumno', after: body.personal.firstName }] }); }
      if (path.endsWith('/record')) { assert.equal(body.confirmationToken, 'confirmation-test'); student.first_name = body.payload.personal.firstName; return ok(student); }
      if (path.endsWith('/reset-access')) return ok({ username: '0000000001', temporaryPassword: 'CLAVE-SIMULADA' });
      if (path.startsWith('/api/schedules/student/')) return ok({ course: 'Automóvil', instructor: 'Instructor', time: '08:00–09:40', scheduledDays: 'Lunes, martes', theory: { modality: 'virtual' } });
      if (path === '/api/students/' + id && method === 'DELETE') return ok({});
      throw new Error('Petición inesperada: ' + method + ' ' + path);
    });
    const entry = (process.env.REACT_TEST_URL || 'http://127.0.0.1:5187') + '/tests/fixtures/profile.html';
    await page.goto(entry);
    await page.getByRole('heading', { name: 'Alumno Prueba' }).waitFor();
    assert(!requests.some(r => /documents|history|balance|payments/.test(r.path)));
    await page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/documents'));
    assert(requests.some(r => r.path.endsWith('/history')));
    assert(requests.some(r => r.path.endsWith('/balance')));
    assert(requests.some(r => r.path.endsWith('/payments')));
    const preloadedDocuments = requests.filter(r => r.path.endsWith('/documents')).length;
    await page.getByRole('tab', { name: 'Documentación', exact: true }).click();
    await page.getByText('Archivo no disponible', { exact: true }).waitFor();
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(requests.filter(r => r.path.endsWith('/documents')).length, preloadedDocuments);
    assert(!requests.some(r=>r.path.endsWith('/content')),'La precarga no debe descargar archivos');
    await page.evaluate(() => { window.open = () => ({ location: { replace() {} }, close() {} }); });
    const download=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/content'));
    await page.getByRole('button',{name:'Ver documento',exact:true}).click();await download;
    assert.equal(requests.filter(r=>r.path.endsWith('/content')).length,1);
    const beforeOther = requests.length;
    await page.evaluate(async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('22222222-2222-4222-8222-222222222222'));
      const studentKey = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2,'0')).join('');
      window.dispatchEvent(new CustomEvent('erp:realtime', { detail: { topics: ['documents'], changes: [{ topic: 'documents', studentKey }] } }));
    });
    await page.waitForTimeout(450);
    assert.equal(requests.length, beforeOther, 'Otro estudiante no debe provocar consultas');
    const beforeDetail = requests.filter(r => r.path === '/api/students/' + id).length;
    const updatedDocuments = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/documents'));
    await page.evaluate(async () => {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('11111111-1111-4111-8111-111111111111'));
      const studentKey = Array.from(new Uint8Array(digest), v => v.toString(16).padStart(2,'0')).join('');
      window.dispatchEvent(new CustomEvent('erp:realtime', { detail: { topics: ['documents'], changes: [{ topic: 'documents', studentKey }] } }));
    });
    await updatedDocuments;
    assert.equal(requests.filter(r => r.path === '/api/students/' + id).length, beforeDetail, 'Documentos no debe recargar datos personales');

    await page.getByRole('tab', { name: 'Historial', exact: true }).click();
    await page.getByText('Registro auditado', { exact: false }).waitFor();
    await page.getByRole('button', { name:'Siguiente',exact:true }).click();
    await page.getByText('Segunda pagina auditada',{exact:false}).waitFor();
    assert(requests.some(r=>r.path.endsWith('/history')));
    await page.getByRole('button',{name:'Anterior',exact:true}).click();
    await page.getByText('Registro auditado',{exact:false}).waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('erp:realtime', { detail: { topics: ['students'] } })));
    await page.waitForFunction(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent === 'Historial');
    await page.getByRole('button', { name: 'Editar datos' }).click();
    const dialog = page.getByRole('dialog', { name: 'Editar expediente' });
    await dialog.getByLabel('Nombres', { exact: true }).fill('Editado');
    await dialog.getByRole('button', { name: 'Revisar cambios' }).click();
    await dialog.getByRole('heading', { name: 'Revisa los cambios' }).waitFor();
    assert.equal(requests.filter(r => r.path.endsWith('/record')).length, 0);
    await dialog.getByRole('button', { name: 'Confirmar y guardar' }).click();
    await page.getByRole('heading', { name: 'Editado Prueba' }).waitFor();
    await page.getByRole('tab', { name: 'Estado financiero' }).click();
    await page.getByLabel('Curso a cobrar').selectOption('moto');
    const payment = page.getByRole('form', { name: 'Pago de inscripción' });
    await payment.getByLabel('Método de pago').selectOption('transferencia');
    await payment.getByLabel('Monto', { exact: true }).fill('101');
    await payment.getByRole('button', { name: 'Registrar transferencia pendiente' }).click();
    await payment.getByRole('alert').waitFor();
    assert.equal(requests.filter(r => r.path === '/api/payments/register').length, 0);
    await payment.getByLabel('Monto', { exact: true }).fill('100');
    await payment.getByLabel('Referencia', { exact: true }).fill('REFERENCIA-SIMULADA');
    await payment.getByLabel('Fecha de transferencia').fill('2026-10-16');
    await payment.getByRole('button', { name: 'Registrar transferencia pendiente' }).click();
    await page.getByRole('status').filter({ hasText: 'Transferencia pendiente' }).waitFor();
    await page.getByRole('button', { name: 'Ver comprobante COMPROBANTE-PRUEBA' }).click();
    await page.frameLocator('iframe[title="Comprobante institucional"]').getByText('Comprobante institucional').waitFor();
    assert.equal(await page.evaluate(() => Boolean(window.receiptScriptExecuted)), false);
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.getByRole('tab', { name: 'Credenciales' }).click();
    await page.getByRole('button', { name: 'Restablecer acceso' }).click();
    assert.equal(requests.filter(r => r.path.endsWith('/reset-access')).length, 0);
    await page.getByRole('button', { name: 'Generar contraseña temporal' }).click();
    await page.getByText('CLAVE-SIMULADA', { exact: true }).waitFor();
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    assert.equal(await page.getByText('CLAVE-SIMULADA', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    assert(await page.getByRole('button', { name: 'Eliminar definitivamente' }).isDisabled());
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.evaluate(() => window.profileTestAuth.getState().setSession({ ...window.profileTestAuth.getState().user, permissions: ['STUDENT_VIEW'] }));
    await page.getByRole('heading', { name: 'Editado Prueba' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Editar datos' }).count(), 0);
    assert.equal(await page.getByRole('tab', { name: 'Estado financiero' }).count(), 0);
    forbidden = true;
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Expediente fuera de alcance' }).waitFor();
    assert.equal(await page.getByRole('tab').count(), 0);
    const count = requests.length;
    await page.goto(entry + '?studentId=invalido');
    await page.getByRole('alert').filter({ hasText: 'Identificador' }).waitFor();
    assert.equal(requests.length, count);
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('PASS: expediente React, carga diferida, permisos, errores 403, edición revisada, pago por matrícula, pendientes, credenciales efímeras, confirmación destructiva y pestaña conservada. API simulada, sin escrituras reales.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
