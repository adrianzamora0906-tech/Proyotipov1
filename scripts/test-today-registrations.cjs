const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Reports = require('../backend/services/ReportService');
const ExcelJS = require('../backend/node_modules/exceljs');
const originalQuery = db.query.bind(db);

async function main() {
  const manager = { global: true, roles: ['GENERAL_MANAGER'] };
  const renewals = (await originalQuery(`SELECT st.customer_identification,st.branch_id,st.created_at::date::text AS report_day
    FROM service_transactions st JOIN students s ON s.id=st.student_id AND s.status <> 'inhabilitado'
    WHERE st.result='RENOVACION_LICENCIA' ORDER BY st.created_at DESC LIMIT 1`)).rows;
  assert.ok(renewals.length, 'A renewal is needed for this read-only test');
  const renewal = renewals[0];
  assert.match(renewal.report_day, /^\d{4}-\d{2}-\d{2}$/);
  db.query = (sql, params) => originalQuery(sql.replace(/CURRENT_DATE/g, `DATE '${renewal.report_day}'`), params);
  const renewalFilters = { branchId: renewal.branch_id, limit: 1000 };
  const renewalReport = await Reports.universal(manager, renewalFilters);
  assert.equal(renewalReport.summary.today_enrollments, renewalReport.rows.length);
  assert.ok(renewalReport.rows.some(row => row.course === 'Renovacion de licencia' && row.identification === renewal.customer_identification));
  const renewalExport = await Reports.exportUniversal(manager, renewalFilters);
  const renewalWorkbook = new ExcelJS.Workbook();
  await renewalWorkbook.xlsx.load(renewalExport.buffer);
  assert.ok(renewalWorkbook.worksheets[0].getColumn(3).values.includes('Renovacion de licencia'));
  const carReport = await Reports.universal(manager, { ...renewalFilters, courseType: 'carro' });
  assert.ok(carReport.rows.every(row => row.course !== 'Renovacion de licencia'));
  const sample = (await originalQuery(`SELECT ap.created_at::date::text AS report_day,ap.branch_id,
    s.identification,LOWER(ip.practice_area) vehicle_type
    FROM additional_driving_practices ap JOIN students s ON s.id=ap.student_id
    JOIN instructor_profiles ip ON ip.id=ap.instructor_id
    WHERE s.status <> 'inhabilitado' ORDER BY ap.created_at DESC LIMIT 1`)).rows[0];
  assert.ok(sample, 'A historical practice is needed for this read-only test');
  assert.match(sample.report_day, /^\d{4}-\d{2}-\d{2}$/);
  // Simulate the reporting day without updating any database record.
  db.query = (sql, params) => originalQuery(sql.replace(/CURRENT_DATE/g, `DATE '${sample.report_day}'`), params);
  const filters = { type: 'today_enrollments', branchId: sample.branch_id, limit: 1000 };
  const report = await Reports.universal(manager, filters);
  assert.equal(report.rows.length, report.summary.today_enrollments);
  const practice = report.rows.find(row => row.identification === sample.identification && row.course.startsWith('Practicas adicionales'));
  assert.ok(practice);
  assert.ok(practice.registered_by);
  assert.ok(Number(practice.amount) > 0);
  assert.ok(Number(practice.balance) >= 0);
  const vehicleReport = await Reports.universal(manager, { ...filters, courseType: sample.vehicle_type });
  assert.ok(vehicleReport.rows.some(row => row.identification === sample.identification && row.course.startsWith('Practicas adicionales')));
  const restricted = await Reports.universal({ branchId: sample.branch_id, roles: ['SECRETARY'] }, filters);
  assert.ok(restricted.rows.every(row => !('amount' in row) && !('balance' in row)));
  const exported = await Reports.exportUniversal(manager, filters);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(exported.buffer);
  assert.equal(workbook.worksheets[0].getCell('A3').value, 'REGISTRADOS HOY');
  assert.ok(!workbook.worksheets[0].getRow(6).values.includes('ESTADO'));
  const courses = workbook.worksheets[0].getColumn(3).values;
  assert.ok(courses.some(value => String(value).startsWith('Practicas adicionales')));
  console.log('PASS: renewals and practices, matching summary, branch/vehicle filters, financial permissions and Excel');
}

main().catch(error => { console.error(error.stack); process.exitCode = 1; })
  .finally(() => { db.query = originalQuery; return db.pool.end(); });
