jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../services/AutomaticCycleService', () => ({ ensureForBranch: jest.fn() }));
const db = require('../config/database');
const Service = require('../services/InstructorAdminService');

describe('instructor weekend calendar', () => {
  beforeEach(() => {
    jest.spyOn(Service, 'resolveScheduleBranchId').mockResolvedValue('branch');
    jest.spyOn(Service, 'getAvailabilityOverrides').mockResolvedValue([]);
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT ip.id, u.first_name')) return { rows: [{ id: 'instructor', branch_id: 'branch', first_name: 'Carlos', last_name: 'Velez' }] };
      if (sql.includes('FROM course_cycles cc')) return { rows: [{ id: 'cycle', code: 'WEEKEND', course_id: 'course', branch_id: 'branch', start_date: new Date('2026-10-10'), end_date: new Date('2026-10-18'), today: new Date('2026-10-08'), modality: params[2], vehicle_type: 'carro' }] };
      return { rows: [] };
    });
  });
  afterEach(() => jest.restoreAllMocks());
  test('weekend car cycle includes both Saturdays and Sundays with configured intensive slots', async () => {
    const calendar = await Service.getInstructorCalendar({ branch_id: 'branch' }, 'instructor', null, 'intensivo');
    expect(calendar.days.map(day => day.date)).toEqual(['2026-10-10', '2026-10-11', '2026-10-17', '2026-10-18']);
    expect(calendar.days.map(day => day.day)).toEqual(['Sabado', 'Domingo', 'Sabado', 'Domingo']);
    expect(calendar.slots).toHaveLength(12);
    expect(calendar.slots[0]).toMatchObject({ startTime: '07:00', endTime: '10:10', status: 'disponible' });
  });
  test('regular calendar still excludes weekends', async () => {
    const calendar = await Service.getInstructorCalendar({ branch_id: 'branch' }, 'instructor');
    expect(calendar.days.map(day => day.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']);
  });
  test('unknown modality is rejected', async () => {
    await expect(Service.getInstructorCalendar({}, 'instructor', null, 'invalid')).rejects.toMatchObject({ status: 422 });
  });
});
