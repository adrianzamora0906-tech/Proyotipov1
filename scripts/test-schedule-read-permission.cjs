const assert = require('node:assert/strict');
const authorizationPath = require.resolve('../backend/services/AuthorizationService');
let permissions = [];
require.cache[authorizationPath] = { id: authorizationPath, filename: authorizationPath, loaded: true,
  exports: { getUserAuthorizationContext: async () => ({ permissions, global: false,
    roleAssignments: [{ branch_id: 'branch' }], roles: ['CASHIER'], branchId: 'branch' }) } };
const requirePermission = require('../backend/middleware/requirePermission');
async function check(permission, options) {
  let result;
  const req = { user: { id: 'cashier', branch_id: 'branch' }, requestContext: {} };
  const res = { status(code) { result = code; return this; }, json() {} };
  await requirePermission(permission, options)(req, res, error => { if (error) throw error; result = 200; });
  return result;
}
(async () => {
  permissions = ['SCHEDULE_VIEW'];
  assert.equal(await check('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }), 200);
  assert.equal(await check('INSTRUCTOR_ASSIGN'), 403);
  assert.equal(await check('SCHEDULE_CHANGE'), 403);
  permissions = [];
  assert.equal(await check('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }), 403);
  permissions = ['INSTRUCTOR_VIEW'];
  assert.equal(await check('INSTRUCTOR_VIEW', { anyOf: ['SCHEDULE_VIEW'] }), 200);
  console.log('5 comprobaciones: lectura independiente y escritura denegada.');
})().catch(error => { console.error(error); process.exitCode = 1; });
