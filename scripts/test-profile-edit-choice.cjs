const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    const root = path.resolve(__dirname, '../frontend');
    await page.route('http://localhost:8080/**', async route => {
      const file = path.resolve(root, '.' + new URL(route.request().url()).pathname);
      if (!file.startsWith(root + path.sep)) return route.abort();
      try { await route.fulfill({ contentType: 'text/javascript', body: await fs.readFile(file) }); }
      catch { await route.abort(); }
    });
    await page.route('**/edit-choice-test', route => route.fulfill({ contentType: 'text/html', body: '<div class="modal-overlay" id="profile-action-modal"></div>' }));
    await page.goto('http://localhost:8080/edit-choice-test');
    await page.addScriptTag({ content: await fs.readFile(path.join(root, 'src/assets/lucide.min.js'), 'utf8') });
    for (const file of ['base/globals', 'components/components', 'pages/students', 'pages/student-profile', 'pages/schedule', 'base/responsive']) {
      await page.addStyleTag({ content: await fs.readFile(path.join(root, `src/assets/css/${file}.css`), 'utf8') });
    }
    await page.evaluate(async () => {
      const { default: View } = await import('/src/js/views/student-profile/StudentProfileView.js');
      const { authService } = await import('/src/js/core/auth/AuthService.js');
      authService.can = () => true;
      const view = new View();
      view.student = { firstName: 'LUIS OSWALDO', lastName: 'DELGADO DELGADO' };
      view.openScheduleModal = (id, options) => { window.scheduleChoice = { id, options }; };
      window.choiceView = view;
      await view.openEditStudentModal('student-test');
    });
    for (const width of [360, 390, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished)));
      const box = await page.locator('.profile-edit-choice-modal').boundingBox();
      assert(box.width <= 540 && box.x >= 0 && box.x + box.width <= width);
      assert(box.height < 500);
      assert.equal(await page.locator('.profile-edit-choice').count(), 2);
      assert.equal(await page.locator('.profile-edit-choice svg').count(), 4);
      assert(await page.locator('[data-edit-pending]').isVisible());
      await page.screenshot({ path: `.tmp/edit-choice-${width}.png` });
    }
    await page.click('[data-edit-pending]');
    assert.deepEqual(await page.evaluate(() => window.scheduleChoice), { id: 'student-test', options: { allowInitial: false } });
    await page.click('[data-edit-personal]');
    assert(page.url().endsWith('/students/new?edit=student-test'));
    console.log('PASS: modal compacto en 360/390/1280 y ambos accesos conservados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
