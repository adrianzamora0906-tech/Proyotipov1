jest.mock('../config/database', () => ({ query:jest.fn() }));
jest.mock('../services/StudentAccountService', () => ({createForStudent:jest.fn().mockResolvedValue({created:true})}));
jest.mock('../services/ReferralCampaignService', () => ({findPendingAttribution:jest.fn().mockResolvedValue(null)}));
const db = require('../config/database');
const StudentService = require('../services/StudentService');

describe('Registration without an office pickup', () => {
  beforeEach(() => jest.clearAllMocks());
  function prepare(pickupEnabled) {
    db.query.mockImplementation(async (sql,params) => {
      if (sql.includes('SELECT city_id,pickup_enabled')) return {rows:[{city_id:'city',pickup_enabled:pickupEnabled}]};
      if (sql.includes('SELECT name,price FROM courses')) return {rows:[{name:'Clase B - Automovil',price:190}]};
      if (sql.includes('SELECT id FROM branches WHERE id=')) return {rows:[{id:params[0]}]};
      if (sql.includes('INSERT INTO students')) return {rows:[{id:'student',pickup_branch_id:params[15]}]};
      if (sql.includes('INSERT INTO enrollments')) return {rows:[{id:'enrollment'}]};
      return {rows:[]};
    });
  }
  test('mobile branch saves a null pickup and keeps enrollment and price', async () => {
    prepare(false);
    const student = await StudentService.create({identification:'fixture',firstName:'Test',lastName:'Student',branch_id:'branch',course_id:'course',pickupBranchId:'ignored'},'orlando');
    expect(student.pickup_branch_id).toBeNull();
    expect(student.enrollment_id).toBe('enrollment');
    expect(db.query.mock.calls.some(([sql])=>sql.includes('SELECT id FROM branches WHERE id='))).toBe(false);
    const payment = db.query.mock.calls.find(([sql])=>sql.includes('INSERT INTO payments'));
    expect(payment[1]).toEqual(['enrollment','course',0]);
  });
  test('ordinary branches preserve explicit pickup', async () => {
    prepare(true);
    const student = await StudentService.create({identification:'fixture',firstName:'Test',lastName:'Student',branch_id:'branch',pickupBranchId:'office'},'secretary');
    expect(student.pickup_branch_id).toBe('office');
  });
  test('ordinary branch uses enrollment branch as fallback', async () => {
    prepare(true);
    const student = await StudentService.create({identification:'fixture',firstName:'Test',lastName:'Student',branch_id:'branch'},'secretary');
    expect(student.pickup_branch_id).toBe('branch');
  });
});
