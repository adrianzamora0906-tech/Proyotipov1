jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed-password') }));
const db = require('../config/database');
const Accounts = require('../services/StudentAccountService');

describe('new student usernames', () => {
  beforeEach(() => jest.clearAllMocks());
  test.each(['REGULAR', 'ADDITIONAL_PRACTICE'])('%s uses the entire identification including leading zero', async type => {
    db.query.mockImplementation(async (sql, params) => {
      if (sql.includes('SELECT s.*')) return { rows: [{ id: 'student', identification: '0123456789', registration_type: type, first_name: 'Ana', last_name: 'Perez' }] };
      if (sql.includes('INSERT INTO users')) return { rows: [{ id: 'account', username: params[4] }] };
      if (sql.includes('SELECT id FROM roles')) return { rows: [{ id: 'role' }] };
      return { rows: [] };
    });
    const access = await Accounts.createForStudent('student');
    expect(access).toMatchObject({ created: true, username: '0123456789', mustChangePassword: true });
    expect(access.temporaryPassword).toBe('0123456789');
  });
  test('existing account remains unchanged', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'account', username: 'old-user' }] });
    expect(await Accounts.createForStudent('student')).toEqual({ created: false, username: 'old-user' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  test('a username collision is rejected instead of inventing a suffix', async () => {
    db.query.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ identification: '0123456789' }] })
      .mockResolvedValueOnce({ rows: [{}] });
    await expect(Accounts.createForStudent('student')).rejects.toMatchObject({ status: 409 });
  });
});
