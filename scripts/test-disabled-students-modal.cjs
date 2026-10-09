const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const root = path.resolve(__dirname, '../frontend');
  const server = http.createServer((req, res) => {
    const name = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!name.startsWith(root + path.sep)) return res.writeHead(403).end();
    fs.readFile(name, (error, data) => {
      if (error) return res.writeHead(404).end();
      res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
      res.end(data);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true });
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(5000);
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.evaluate(async () => {
        const { default: View } = await import('/src/js/views/students/StudentsView.js');
        const { default: Api } = await import('/src/js/core/api/apiService.js');
        window.requests = [];
        Api.getStudents = async params => {
          window.requests.push(params);
          if (window.failRequest) throw new Error('Error de prueba');
          return { success: true, data: Array.from({ length: 23 }, (_, i) => ({ id: `student-${i}`, first_name: i ? `Nombre ${i}` : '<img src=x onerror=alert(1)>', last_name: 'Apellido', identification: `13000000${i}`, branch_name: 'Sucursal de prueba', status: 'inhabilitado' })) };
        };
        window.view = Object.create(View.prototype);
        window.view.registrationType = 'REGULAR';
        window.view.disabledStudentCount = 23;
        document.body.innerHTML = `<form id="student-filter-form"><select name="studentScope"><option value="branch:branch-one">Sucursal</option></select><input name="status" value="active"><input name="search"><input name="province" value="Manabi"></form><section id="students-summary">${window.view.renderStudentSummary([], [])}</section>`;
        window.view.bindSummaryCardEvents(document.querySelector('form'));
      });
      await page.locator('[data-open-disabled-students]').click();
      const dialog = page.locator('.disabled-students-dialog');
      await dialog.locator('[role=status]').filter({ hasText: '23 estudiantes' }).waitFor();
      const bounds = await dialog.boundingBox();
      assert(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 2, 'Modal centrado horizontalmente');
      assert(Math.abs(bounds.y + bounds.height / 2 - 844 / 2) < 2, 'Modal centrado verticalmente');
      assert.equal(await dialog.locator('tbody tr').count(), 10);
      assert.equal(await dialog.locator('tbody img').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.requests[0]), { branch_id: 'branch-one', status: 'inhabilitado', province: 'Manabi' });
      assert.equal(await page.locator('[name=status]').inputValue(), 'active');
      await dialog.locator('[data-next]').click();
      assert.equal(await dialog.locator('[data-page]').textContent(), '2 de 3');
      await dialog.locator('[data-search]').fill('1300000022');
      assert.equal(await dialog.locator('tbody tr').count(), 1);
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), `disabled-students-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await page.evaluate(() => { window.failRequest = true; });
      await page.locator('[data-open-disabled-students]').click();
      await page.getByRole('button', { name: 'Reintentar' }).waitFor();
      await page.evaluate(() => { window.failRequest = false; });
      await page.getByRole('button', { name: 'Reintentar' }).click();
      await page.locator('.disabled-students-dialog [role=status]').filter({ hasText: '23 estudiantes' }).waitFor();
      await page.locator('.disabled-students-dialog [data-search]').fill('sin coincidencias');
      assert.equal(await page.locator('.disabled-students-dialog tbody tr').count(), 0);
      const activation = await page.evaluate(() => {
        window.view.disabledStudentsDialog.close();
        const payload = { id: 'cycle:reserved:2026-10-12', cycleId: 'reserved', date: '2026-10-12', time: '18:00 - 19:40', course: 'carro' };
        document.body.innerHTML = `<form id="student-modal-form"><select name="course_id"><option data-course-type="carro">Auto</option></select><input id="selected-schedule-id"><input id="selected-schedule-plan"><input id="selected-enrollment-modality" value="normal"></form>
          <div id="schedule-selection-summary"><div><strong></strong></div></div><div id="schedule-error"></div>
          <div id="student-schedule-calendar"><div class="enrollment-cycle-set" data-active-cycle-index="0">
          <div class="enrollment-calendar" data-course="carro" data-modality="normal" data-cycle-index="0" data-required-classes="1"><button class="schedule-option" data-course="carro" data-time="18:00 - 19:40"></button></div>
          <div class="enrollment-calendar" data-course="moto" data-modality="normal" data-cycle-index="1"><button class="schedule-option" data-course="moto"></button></div></div></div>`;
        document.querySelector('.schedule-option').dataset.schedule = JSON.stringify(payload);
        window.view.updateCalendarWindow = () => {};
        window.view.updateReferredInstructorBlockPreview = () => {};
        window.view.updateInstructorAssignmentPreview = () => {};
        window.view.showModalAlert = message => { throw new Error(message); };
        window.view.syncScheduleOptions();
        window.view.selectReservedSchedule({ cycle_id: 'reserved', reserved_start_time: '18:00:00', reserved_end_time: '19:40:00' });
        // A later refresh must not let the hidden motorcycle calendar erase it.
        window.view.syncScheduleOptions();
        return { id: document.getElementById('selected-schedule-id').value,
          plan: JSON.parse(document.getElementById('selected-schedule-plan').value),
          summary: document.querySelector('#schedule-selection-summary strong').textContent };
      });
      assert.equal(activation.id, 'cycle:reserved:2026-10-12');
      assert.equal(activation.plan.selections.length, 1);
      assert.equal(activation.plan.selections[0].time, '18:00 - 19:40');
      assert(activation.summary.includes('18:00 - 19:40'));
      console.log(`PASS ${width}px: scope, card, pagination, search, escaping, close, error/retry, empty state`);
      console.log(`PASS ${width}px: reservation selection persists in form, summary and hidden plan after sync`);
      await page.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
