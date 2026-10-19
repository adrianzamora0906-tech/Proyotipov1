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
      try { return route.fulfill({ contentType: file.endsWith('.css') ? 'text/css' : 'text/javascript', body: await fs.readFile(file) }); }
      catch { return route.abort(); }
    });
    await page.route('**/responsive-test', route => route.fulfill({ contentType: 'text/html', body: '<html><head></head><body></body></html>' }));
    await page.goto('http://localhost:8080/responsive-test');
    const styles = ['base/globals', 'layout/sidebar', 'components/components', 'pages/schedule', 'base/responsive'];
    for (const style of styles) await page.addStyleTag({ content: await fs.readFile(path.join(root, `src/assets/css/${style}.css`), 'utf8') });
    await page.evaluate(async () => {
      const { authService } = await import('/src/js/core/auth/AuthService.js');
      authService.can = () => true;
      const { default: View } = await import('/src/js/views/schedule/ScheduleView.js');
      const view = new View();
      window.calendarMarkup = view.renderCalendar({
        instructor: { name: 'Carlos Alfredo Velez Romero', branch: 'Sportmancar Flavio Reyes' },
        course: { code: 'SP_IC1_53_26' }, week: { startDate: '2026-10-19', endDate: '2026-10-28' },
        days: [{ day: 'lunes', date: '2026-10-19' }],
        slots: [{ day: 'lunes', date: '2026-10-19', startTime: '08:00', endTime: '09:40', status: 'disponible' }],
      });
    });
    for (const width of [360, 390, 768, 955, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => {
        document.body.innerHTML = `<div class="layout"><aside class="sidebar"></aside><div class="main-container"><main class="content"><div class="schedule-page"><div class="page-header"><div><h1>Horarios de instructores</h1><p>Horarios de cursos regulares y de fin de semana</p></div><div class="schedule-header-actions"><div class="monthly-course-switch schedule-vehicle-switch"><button>Automovil</button><button>Moto</button></div><div><button class="btn">Editar grupos</button></div><button class="btn">Ver disponibilidad mensual</button><label class="schedule-weekend-toggle"><input type="checkbox">Fin de semana</label></div></div><div class="instructor-card-grid">${Array.from({length:3}, () => '<button class="instructor-card"><span class="instructor-card-avatar">RC</span><span class="instructor-card-body"><h3>Rolando Cirilo Sanchez Cantos</h3><p>64 horas disponibles</p></span></button>').join('')}</div></div></main></div></div>`;
      });
      const check = selector => page.locator(selector).evaluateAll(nodes => nodes.every(node => {
        const r = node.getBoundingClientRect();
        return r.left >= -1 && r.right <= innerWidth + 1;
      }));
      assert(await check('.schedule-header-actions > *, .instructor-card'), `Page overflow at ${width}`);
      await page.screenshot({ path: `.tmp/schedule-responsive-${width}.png` });
      await page.evaluate(() => document.body.innerHTML = `<div id="instructor-calendar-modal" class="modal-overlay active">${window.calendarMarkup}</div>`);
      await page.locator('.modal-title').waitFor({ state: 'visible' });
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished)));
      assert(await check('.modal, .modal-header button, .calendar-course-actions'), `Modal overflow at ${width}`);
      assert(await page.locator('.modal-header').evaluate(node => node.scrollWidth <= node.clientWidth + 1), `Header overflow at ${width}`);
      await page.screenshot({ path: `.tmp/calendar-responsive-${width}.png` });
      console.log(`PASS ${width}px: page controls and calendar modal fit`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
