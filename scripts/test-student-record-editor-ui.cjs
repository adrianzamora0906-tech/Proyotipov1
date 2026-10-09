const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function main() {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await page.goto('http://localhost:8080/');
      await page.evaluate(async () => {
        const { default: StudentsView } = await import('/src/js/views/students/StudentsView.js');
        const { default: Api } = await import('/src/js/core/api/apiService.js');
        const { default: Students } = await import('/src/js/services/StudentService.js?v=registro-sin-fallback-20260820');
        const { default: Payment } = await import('/src/js/services/PaymentService.js');
        const { authService } = await import('/src/js/core/auth/AuthService.js');
        const branchId = '20857100-415d-4072-94cb-7ad8635d9dc3';
        const cityId = 'a2e03b24-e85c-4d2f-8e8e-3353f0b11b9d';
        const courseId = 'b69021bc-1041-4d91-9315-f92c34803cae';
        const instructorId = '91b215ab-e0a1-4d88-8332-825052527ffd';
        authService.can = permission => ['PAYMENT_CREATE', 'STUDENT_UPDATE', 'DOCUMENT_CREATE'].includes(permission);
        authService.getEffectiveBranchId = () => branchId;
        authService.getCurrentUser = () => ({ branch_id: branchId, branch: 'Sportmancar Flavio Reyes' });
        Payment.getAvailableMethods = async () => [{ code: 'efectivo', name: 'Efectivo', requires_reference: false }];
        Students.getInstructors = async () => [{ id: instructorId, name: 'Elias Hidalgo', courses: [{ id: courseId }], priority_branch: true }];
        Api.getCities = async () => ({ success: true, data: [{ id: cityId, name: 'Manta', province: 'Manabi' }] });
        Api.getBranches = async () => ({ success: true, data: [{ id: branchId, name: 'Sportmancar Flavio Reyes', city_id: cityId, active: true }] });
        Api.getBranchCourses = async () => ({ success: true, data: [{ id: courseId, name: 'Clase A - Moto', price: 140 }] });
        Api.getCourseEnrollmentOptions = async () => ({ success: true, data: [] });
        Api.getTheoryEnrollmentOptions = async () => ({ success: true, data: [] });
        Api.getStudentEditContext = async () => ({ success: true, data: {
          student: { id: 'student-1', first_name: 'ERICK JONATHAN', last_name: 'FIGUEROA PICO',
            identification: '1308735602', birth_date: '2000-01-01', email: 'erick@example.com', phone: '0991234567',
            address: 'Manta', blood_type: 'O+', branch_id: branchId, city_id: cityId, notes: 'Observacion anterior' },
          revision: 'revision-1', enrollments: [{ course_id: courseId, course_name: 'Clase A - Moto', course_price: 140, theory_modality: 'por_confirmar' }],
          assignments: [{ cycleId: 'cycle-1', date: '2026-10-10', time: '15:00 - 17:30', instructorId, modality: 'intensivo' }],
          exam: null, payment: { total: 140, final_amount: 140, balance: 40 },
          documents: [{ type: 'cedula', name: 'Cedula', hasFile: true }],
          cities: [{ id: cityId, name: 'Manta', province: 'Manabi' }],
          instructors: [{ id: instructorId, name: 'Elias Hidalgo' }],
          canSchedule: true, canFinance: true, canDocuments: true,
        } });
        window.writes = 0;
        Api.previewStudentEdit = async (_id, payload) => {
          window.previewPayload = payload;
          return { success: true, data: { confirmationToken: 'confirmed',
            changes: [{ field: 'Nombres', before: 'ERICK JONATHAN', after: `${payload.personal.firstName} <img src=x onerror=alert(1)>` }] } };
        };
        Api.saveStudentEdit = async () => { window.writes++; return { success: true, data: {} }; };
        const view = new StudentsView();
        view.getSchedulesForModal = async () => [];
        document.body.innerHTML = await view.renderStudentModal();
        await view.mountStudentModalEvents();
        await view.openStudentRecordEdit('student-1');
        window.editView = view;
      });
      const modal = page.locator('#student-modal-overlay');
      assert((await modal.locator('#student-modal-title').textContent()).includes('Editar estudiante'));
      assert.equal(await modal.locator('[name=cedula]').inputValue(), '1308735602');
      assert.equal(await modal.locator('[name=firstName]').inputValue(), 'ERICK JONATHAN');
      assert.equal(await modal.locator('[name=scheduleId]').inputValue(), 'cycle:cycle-1');
      assert.equal(await page.evaluate(() => window.editView.renderScheduleOption({
        id: 'cycle:cycle-1', cycleId: 'cycle-1', date: '2026-10-10',
        time: '15:00 - 17:30', available: 0, course: 'Clase A - Moto',
      }).includes('class="schedule-option ')), true);
      await page.evaluate(() => window.editView.goToModalStep(2));
      await modal.locator('[name=firstName]').fill('ERICK CAMBIADO');
      await page.evaluate(() => window.editView.goToModalStep(4));
      await modal.locator('#student-modal-submit').click();
      const review = page.locator('#student-record-edit-review');
      try { await review.waitFor({ state: 'visible', timeout: 5000 }); }
      catch (error) { throw new Error(`Review missing: ${await modal.locator('#student-modal-alert').textContent()} / ${await modal.locator('#student-modal-submit').textContent()}`); }
      assert.equal(await page.evaluate(() => window.writes), 0);
      assert.equal(await page.evaluate(() => window.previewPayload.academic), undefined);
      assert.equal(await page.evaluate(() => window.previewPayload.finance), undefined);
      assert.equal(await page.evaluate(() => window.previewPayload.personal.disabilityPercentage), undefined);
      assert.equal(await page.evaluate(() => window.previewPayload.personal.notes), 'Observacion anterior');
      assert.equal(await review.locator('img').count(), 0);
      assert((await review.textContent()).includes('<img src=x'));
      const bounds = await review.locator('section').boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
      await page.screenshot({ path: path.join(os.tmpdir(), `student-edit-registration-${width}.png`) });
      await review.locator('[data-back]').click();
      assert.equal(await page.evaluate(() => window.writes), 0);
      await modal.locator('#student-modal-submit').click();
      await review.locator('[data-confirm]').click();
      assert.equal(await page.evaluate(() => window.writes), 1);
      await page.close();
      console.log(`PASS ${width}px: same registration form, prefill, review before save, confirm`);
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
