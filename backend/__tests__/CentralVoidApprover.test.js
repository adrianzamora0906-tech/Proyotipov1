jest.mock('../config/database', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('../services/AuditService', () => ({ log: jest.fn() }));
const db = require('../config/database');
const Payment = require('../services/PaymentService');

describe('central payment void approval', () => {
  afterEach(() => jest.restoreAllMocks());
  test('other users have no approval inbox', async () => {
    db.query.mockResolvedValue({ rows: [] });
    expect(await Payment.getPendingVoidRequests({ id: 'gema' })).toEqual([]);
  });
  test('Dayana sees requests without branch filtering', async () => {
    db.query.mockResolvedValueOnce({ rows: [{}] }).mockResolvedValueOnce({ rows: [{ branch_name: 'Other branch' }] });
    expect(await Payment.getPendingVoidRequests({ id: 'dayana' })).toHaveLength(1);
    expect(db.query.mock.calls.at(-1)[0]).not.toContain('r.branch_id=$1');
  });
  test.each(['APPROVED', 'REJECTED'])('%s uses original branch and one transaction', async decision => {
    const client = { query: jest.fn(async sql => {
      if (sql.includes('SELECT 1 FROM settings')) return { rows: [{}] };
      if (sql.includes('SELECT * FROM payment_void_requests')) return { rows: [{ requested_by: 'gema', branch_id: 'other-branch', payment_detail_id: 'detail', reason: 'error' }] };
      return { rows: [{}] };
    }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const cancel = jest.spyOn(Payment, 'cancelPayment').mockResolvedValue({});
    await Payment.reviewPaymentVoid('request', decision, null, { id: 'dayana', branch_id: 'home' });
    if (decision === 'APPROVED') expect(cancel).toHaveBeenCalledWith('detail', 'error', expect.objectContaining({ id: 'dayana', branch_id: 'other-branch' }), undefined, client);
    else expect(cancel).not.toHaveBeenCalled();
    expect(client.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
  });
  test('another approver is rejected before modifying payment', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    await expect(Payment.reviewPaymentVoid('request', 'APPROVED', null, { id: 'other' })).rejects.toMatchObject({ status: 403 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });
});
