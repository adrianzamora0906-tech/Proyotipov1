const assert = require('node:assert/strict');
const db = require('../backend/config/database');
const Students = require('../backend/controllers/studentController');
const Documents = require('../backend/controllers/documentController');
const Payments = require('../backend/controllers/paymentController');
const StudentService = require('../backend/services/StudentService');
const DocumentService = require('../backend/services/DocumentService');
const { errorHandler } = require('../backend/middleware/errorHandler');

(async () => {
  const originals = { query: db.query, access: StudentService.assertReadAccess };
  const branch = '20857100-415d-4072-94cb-7ad8635d9dc4';
  const req = { user: { id: 'owner', role: 'secretaria', branch_id: branch }, authorization: {}, query: {}, params: { id: branch, studentId: branch } };
  try {
    db.query = async () => ({ rows: [{ city_id: null }] });
    assert.equal((await Students.readScope(req)).branch_id, branch);
    assert.deepEqual(await Students.readScope({ ...req, query: { scope: 'all' } }), { branch_id: branch });
    await assert.rejects(Students.readScope({ ...req, user: { ...req.user, branch_id: null } }), { status: 403 });
    db.query = async () => ({ rows: [] });
    await assert.rejects(Students.readScope(req), { status: 403 });
    db.query = async () => ({ rows: [{ city_id: null }] });
    let checks = 0;
    StudentService.assertReadAccess = async () => { checks++; throw Object.assign(new Error('Denied'), { status: 403 }); };
    const res = { json() { throw new Error('Unauthorized data returned'); } };
    for (const handler of [Documents.getByStudent, Payments.getStudentPayments, Payments.getStudentBalance, Students.getHistory]) {
      let rejection;
      await handler(req, res, error => { rejection = error; });
      assert.equal(rejection?.status, 403, handler.name);
    }
    assert.equal(checks, 4, 'Legacy requests without metadata/pagination must check scope');
    const token = 'a'.repeat(64);
    let row = { created_by: 'owner', expiresAt: new Date(Date.now() + 60000), fileUrl: 'private', usedAt: new Date() };
    db.query = async () => ({ rows: [row] });
    await assert.rejects(DocumentService.getMobileUploadResult(token, { id: 'other' }), { status: 404 });
    assert.equal((await DocumentService.getMobileUploadResult(token, req.user)).fileUrl, 'private');
    row = { ...row, expiresAt: new Date(0) };
    await assert.rejects(DocumentService.getMobileUploadResult(token, req.user), { status: 410 });
    const headers = {};
    require('../backend/middleware/privateApiResponses')({}, { setHeader: (key, value) => { headers[key] = value; } }, () => {});
    assert.match(headers['Cache-Control'], /no-store/);
    let body;
    const oldLog = console.error;
    try {
      console.error = () => {};
      errorHandler(Object.assign(new Error('SQL password secret'), { details: 'private' }), {}, { status() { return this; }, json(value) { body = value; } });
    } finally { console.error = oldLog; }
    assert.equal(body.error.message, 'Error interno del servidor');
    assert.equal(body.error.details, undefined);
    assert.equal(body.error.stack, undefined);
    console.log('PASS: scope fails closed, legacy endpoints deny before reading, capture owner/expiry, no-store and private server errors. No database connection or writes.');
  } finally {
    db.query = originals.query;
    StudentService.assertReadAccess = originals.access;
    await db.pool.end();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
