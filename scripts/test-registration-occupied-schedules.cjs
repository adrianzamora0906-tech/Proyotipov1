const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/USUARIO/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://localhost:8080/');
      const result = await page.evaluate(async () => {
        const { default: View } = await import('/src/js/views/students/StudentsView.js');
        const { default: Api } = await import('/src/js/core/api/apiService.js');
        const view = Object.create(View.prototype);
        const requests = [];
        Api.getCourseEnrollmentOptions = async filters => { requests.push(filters); return { success: true, data: [] }; };
        Api.getTheoryEnrollmentOptions = async () => ({ success: true, data: [] });
        await view.getSchedulesForModal('branch-test', 'instructor-test');
        const dates = ['2026-10-14', '2026-10-15'];
        const schedules = ['06:00 - 07:40', '08:00 - 09:40'].map((time, index) => ({
          id: `slot-${index}`, cycleId: 'cycle-test', course: 'carro', modality: 'normal', time,
          available: 0, capacity: 1, fullNormalSchedule: false,
          availabilityByDate: Object.fromEntries(dates.map(date => [date, { available: 0, occupied: 1, capacity: 1 }]))
        }));
        const render = items => view.renderEnrollmentCycleCalendar({ courseKey: 'carro', modality: 'normal',
          title: 'Clase B', schedules: items, cycle: { key: 'cycle-test', instructors: [], calendarDates: dates,
            startDate: dates[0], endDate: dates[1], detail: 'Sin cupos' }, cycleIndex: 0, cycleCount: 1, activeCycleIndex: 0 });
        document.body.innerHTML = render(schedules);
        const defaultRows = document.querySelectorAll('.enrollment-calendar-time').length;
        const courseKept = Boolean(document.querySelector('.enrollment-calendar[data-cycle-id="cycle-test"]'));
        const available = { ...schedules[0], id: 'free', time: '10:00 - 11:40', available: 1,
          availabilityByDate: Object.fromEntries(dates.map(date => [date, { available: 1, occupied: 0, capacity: 1 }])) };
        document.body.innerHTML = render([...schedules, available]);
        const mixedRows = [...document.querySelectorAll('.enrollment-calendar-time')].map(cell => cell.textContent);
        view.useInstructorFirstAvailability = true;
        document.body.innerHTML = render(schedules);
        const cells = [...document.querySelectorAll('.schedule-option')];
        return { requestsIncludeOccupied: requests.length === 4 && requests.every(item => item.include_occupied === 'true'),
          defaultRows, courseKept, mixedRows,
          cells: cells.length, occupied: cells.every(cell => cell.textContent.includes('Ocupado')),
          guarded: cells.every(cell => cell.dataset.normalDisabled === 'true' && cell.getAttribute('aria-disabled') === 'true'),
          visible: cells.every(cell => getComputedStyle(cell).visibility !== 'hidden'),
          times: [...document.querySelectorAll('.enrollment-calendar-time')].map(cell => cell.textContent) };
      });
      assert(result.requestsIncludeOccupied);
      assert.equal(result.defaultRows, 0);
      assert(result.courseKept);
      assert.deepEqual(result.mixedRows, ['10:00 - 11:40']);
      assert.equal(result.cells, 4);
      assert(result.occupied && result.guarded && result.visible, JSON.stringify(result));
      assert.equal(result.times.length, 2);
      assert.equal(errors.length, 0, errors.join('\n'));
      await page.screenshot({ path: require('node:path').join(require('node:os').tmpdir(), `registration-occupied-${width}.png`), fullPage: true });
      const navigation = await page.evaluate(async () => {
        const { default: View } = await import('/src/js/views/students/StudentsView.js');
        const view = Object.create(View.prototype);
        const slots = ids => ids.map((id, index) => ({ id: `slot-${id}`, cycleId: id, day: id, cycleLabel: id,
          course: 'carro', modality: 'normal', startDate: `2026-10-${14 + index * 7}`, endDate: `2026-10-${15 + index * 7}`,
          calendarDates: [`2026-10-${14 + index * 7}`, `2026-10-${15 + index * 7}`], durationBusinessDays: 2,
          time: '06:00 - 07:40', capacity: 1, available: 0, instructors: [],
          availabilityByDate: Object.fromEntries([`2026-10-${14 + index * 7}`, `2026-10-${15 + index * 7}`]
            .map(date => [date, { available: 0, occupied: 1, capacity: 1 }])) }));
        view.getSchedulesForModal = async () => slots(['cycle-B', 'cycle-C']);
        view.resetCalendarSelection = calendar => calendar.querySelectorAll('.selected').forEach(cell => cell.classList.remove('selected'));
        document.body.innerHTML = `<form id="student-modal-form"><select name="course_id"><option data-course-type="carro">Carro</option></select>
          <input name="scheduleId"><input name="schedulePlan"><input id="selected-enrollment-modality" value="normal"></form>
          <div id="student-schedule-calendar"></div>`;
        const host = document.getElementById('student-schedule-calendar');
        host.innerHTML = view.renderScheduleCalendar(slots(['cycle-A', 'cycle-B']));
        let set = host.querySelector('.enrollment-cycle-set[data-course="carro"]');
        set.dataset.activeCycleIndex = '1';
        await view.reloadModalSchedules('branch-test');
        set = host.querySelector('.enrollment-cycle-set[data-course="carro"]');
        const calendars = [...set.querySelectorAll('.enrollment-calendar')];
        const identities = calendars.map(calendar => calendar.dataset.cycleId);
        const before = Number(set.dataset.activeCycleIndex);
        await view.shiftEnrollmentCycle(calendars[0].querySelector('[data-cycle-direction="1"]'), 1);
        const next = Number(set.dataset.activeCycleIndex);
        await view.shiftEnrollmentCycle(calendars[1].querySelector('[data-cycle-direction="-1"]'), -1);
        const previous = Number(set.dataset.activeCycleIndex);
        let loads = 0, release;
        view.loadNextEnrollmentCycle = async () => { loads++; await new Promise(resolve => { release = resolve; }); };
        const button = calendars[1].querySelector('[data-cycle-direction="1"]');
        const first = view.shiftEnrollmentCycle(button, 1);
        await view.shiftEnrollmentCycle(button, 1);
        release(); await first;
        return { identities, before, next, previous, loads };
      });
      assert.deepEqual(navigation.identities, ['cycle-B', 'cycle-C'], 'Reload must not retain headers belonging to previous cycles');
      assert.deepEqual([navigation.before, navigation.next, navigation.previous], [0, 1, 0]);
      assert.equal(navigation.loads, 1, 'Repeated clicks must not overlap cycle loads');
      console.log(`PASS ${width}px: courses remain navigable; default hides occupied rows; full view shows guarded occupied cells`);
      console.log(`PASS ${width}px: refreshed course identities, next/previous navigation and repeated-click guard`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
