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
    for (const width of [1280,390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      page.setDefaultTimeout(5000);
      await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
      await page.evaluate(async () => {
        const { openWeekendGroupEditor } = await import('/src/js/views/schedule/WeekendGroupEditor.js');
        const { default: Api } = await import('/src/js/core/api/apiService.js');
        const data = { cycle: { id: 'cycle', code: 'SP_IC_40_26' }, instructorId: 'instructor', version: 'snapshot',
          instructors: [{ id: 'instructor', name: 'Instructor de prueba' }, { id: 'second', name: 'Otro instructor' }],
          dates: ['2026-10-10','2026-10-11'], times: ['07:00 - 10:10','10:30 - 13:50'],
          members: [{ enrollmentId: 'member', name: 'ESTUDIANTE DE PRUEBA', identification: '1300000000',
            slots: [{ date: '2026-10-10', time: '07:00 - 10:10', instructorId: 'instructor', editable: true },
              { date: '2026-10-11', time: '07:00 - 10:10', instructorId: 'instructor', editable: true }] }],
          candidates: [{ enrollmentId: 'candidate', name: 'OTRO ESTUDIANTE', identification: '1300000001',
            slots: [{ date: '2026-10-10', time: '10:30 - 13:50', instructorId: 'second', editable: true }] }] };
        Api.getWeekendGroup = async () => ({ success: true, data });
        Api.updateWeekendGroup = async (cycle, instructor, body) => {
          window.sent = body;
          if (window.conflict) throw new Error('Cruce de horario de prueba');
          return { success: true };
        };
        document.body.innerHTML = '<button id="opener">Editar grupo</button>';
        window.openEditor = () => openWeekendGroupEditor({ course: { id: 'cycle', code: data.cycle.code }, instructor: { id: 'instructor', name: 'Instructor de prueba' } }, () => { window.refreshed = true; });
        document.getElementById('opener').onclick = window.openEditor;
      });
      await page.locator('#opener').click();
      const dialog = page.locator('#weekend-group-editor');
      await dialog.locator('[data-member]').waitFor();
      const bounds = await dialog.boundingBox();
      assert(Math.abs(bounds.x + bounds.width / 2 - width / 2) < 2);
      assert(Math.abs(bounds.y + bounds.height / 2 - 422) < 2);
      await dialog.locator('[data-time]').first().selectOption('10:30 - 13:50');
      await dialog.locator('[data-save]').click();
      assert((await dialog.locator('[role=status]').textContent()).includes('motivo'));
      await dialog.locator('[data-reason]').fill('Ajuste solicitado por secretaria');
      await page.evaluate(() => { window.conflict = true; });
      await dialog.locator('[data-save]').click();
      await dialog.locator('[role=status]').filter({ hasText: 'Cruce de horario' }).waitFor();
      assert.equal(await dialog.locator('[data-time]').first().inputValue(), '10:30 - 13:50');
      await dialog.locator('[data-add-select]').selectOption('candidate');
      await dialog.locator('[data-add]').click();
      assert.equal(await dialog.locator('[data-member]').count(), 2);
      await page.screenshot({ path: path.join(require('node:os').tmpdir(), `weekend-editor-${width}.png`), fullPage: true });
      await page.evaluate(() => { window.conflict = false; });
      await dialog.locator('[data-save]').click();
      await dialog.waitFor({ state: 'detached' });
      const saved = await page.evaluate(() => ({ sent: window.sent, refreshed: window.refreshed }));
      assert.equal(saved.sent.changes.length, 2);
      assert.equal(saved.sent.changes[0].slots[0].time, '10:30 - 13:50');
      assert(saved.refreshed);
      await page.locator('#opener').click();
      await page.locator('[data-remove]').first().check();
      await page.locator('[data-reason]').fill('Retiro de prueba');
      page.once('dialog', popup => popup.accept());
      await page.locator('[data-save]').click();
      await dialog.waitFor({ state: 'detached' });
      assert((await page.evaluate(() => window.sent.changes[0])).remove);
      console.log(`PASS ${width}px: modal centrado, precarga, cambios, motivo, errores, integrantes, retiro confirmado y refresco`);
      await page.close();
    }
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
