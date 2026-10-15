const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage({ serviceWorkers: 'block' });
    await page.route('**/hour-order-test', route => route.fulfill({
      contentType: 'text/html', body: '<body></body>',
    }));
    await page.goto('http://localhost:8080/hour-order-test');
    const result = await page.evaluate(async () => {
      const { default: View } = await import('/src/js/views/schedule/ScheduleView.js');
      const view = Object.create(View.prototype);
      const students = [
        { id: 'gema', name: 'Gema', start_time: '08:00', end_time: '09:40', status: 'matriculado' },
        { id: 'julia', name: 'Julia', start_time: '14:00', end_time: '15:40', status: 'matriculado' },
        { id: 'mary', name: 'Mary', start_time: '16:00', end_time: '17:40', status: 'matriculado' },
        { id: 'yamileth', name: 'Yamileth', start_time: '10:00', end_time: '11:40', status: 'practica_adicional' },
        { id: 'pending', name: 'Pendiente', status: 'reservado' },
        { id: 'early', name: 'Temprano', start_time: '6:00:00', end_time: '07:40', status: 'clase_intensiva' },
      ];
      const calendar = { instructor: { name: 'Instructor' }, course: { code: 'Curso' }, students };
      document.body.innerHTML = view.renderInstructorStudentsModal(calendar);
      return {
        order: [...document.querySelectorAll('.instructor-student-person strong')].map(el => el.textContent),
        original: students.map(student => student.id),
        practiceHref: document.querySelector('a[href="/student-profile/yamileth"]')?.getAttribute('href'),
        empty: view.renderInstructorStudentsModal({ ...calendar, students: [] }).includes('no tiene estudiantes'),
      };
    });
    assert.deepEqual(result.order, ['Temprano', 'Gema', 'Yamileth', 'Julia', 'Mary', 'Pendiente']);
    assert.deepEqual(result.original, ['gema', 'julia', 'mary', 'yamileth', 'pending', 'early']);
    assert.equal(result.practiceHref, '/student-profile/yamileth');
    assert(result.empty);
    console.log('PASS: orden por hora, practicas incluidas, pendientes al final y enlaces conservados.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
