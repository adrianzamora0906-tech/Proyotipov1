jest.mock('../config/database', () => ({ query: jest.fn() }));
jest.mock('../services/AuditService', () => ({ log: jest.fn() }));
const db = require('../config/database');
const Cash = require('../services/CashOperationsService');

describe('renewal transfers collected from another branch', () => {
  beforeEach(() => jest.clearAllMocks());
  const data = () => ({ serviceTransactionId: 'service', cedula: '1312529561', amount: 16, reference: 'reference', transferDate: '2026-10-08' });
  test('uses service identity and original branch after checking collection scope', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ amount: '16.00', student_id: 'student', branch_id: 'destination' }] })
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'transfer', status: 'PENDING' }] });
    expect(await Cash.createTransfer(data(), { id: 'cashier', branch_id: 'collector' }, {})).toMatchObject({ status: 'PENDING' });
    expect(db.query.mock.calls[0][0]).toContain('registrar.branch_id=$4');
    expect(db.query.mock.calls[0][1]).toEqual(['service', '1312529561', false, 'collector']);
    expect(db.query.mock.calls[2][1].slice(0, 3)).toEqual(['destination', 'student', 'service']);
  });
  test('rejects inaccessible services without inserting a transfer', async () => {
    db.query.mockResolvedValue({ rows: [] });
    await expect(Cash.createTransfer(data(), { id: 'cashier', branch_id: 'other' }, {})).rejects.toMatchObject({ status: 404 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  test('rejects an amount different from the service price', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ amount: 20, student_id: 'student', branch_id: 'destination' }] });
    await expect(Cash.createTransfer(data(), { id: 'cashier', branch_id: 'collector' }, {})).rejects.toMatchObject({ status: 422 });
  });
  test('rejects a second pending transfer for the same service', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ amount: 16, student_id: 'student', branch_id: 'destination' }] })
      .mockResolvedValueOnce({ rows: [{ total: '16' }] });
    await expect(Cash.createTransfer(data(), { id: 'cashier', branch_id: 'collector' }, {})).rejects.toMatchObject({ status: 409 });
  });
});
