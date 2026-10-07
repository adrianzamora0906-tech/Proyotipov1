jest.mock('../config/database', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('../services/AuditService', () => ({ log: jest.fn() }));
const db = require('../config/database');
const PaymentService = require('../services/PaymentService');
const CashOperationsService = require('../services/CashOperationsService');

describe('transfer review transaction ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  test('confirmation registers payment on the same client and commits once', async () => {
    const client = { query: jest.fn(async sql => {
      if (sql.includes('SELECT 1 FROM settings')) return { rows: [{}] };
      if (sql.includes('SELECT tv.*')) return { rows: [{ identification: '123', branch_id: 'branch', amount: 20 }] };
      return { rows: [{}] };
    }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const payment = jest.spyOn(PaymentService, 'registerPayment').mockResolvedValue({ newBalance: 0 });
    await CashOperationsService.reviewTransfer('transfer', 'CONFIRMED', null, { id: 'gema' }, {});
    expect(payment).toHaveBeenCalledWith(expect.any(Object), client);
    expect(client.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF tv'), expect.any(Array));
  });

  test.each(['registerPayment', 'registerServicePayment'])('%s leaves rollback and release to caller on failure', async method => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    await expect(PaymentService[method]({ cedula: 'missing' }, client)).rejects.toBeDefined();
    expect(client.query.mock.calls.some(([sql]) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql))).toBe(false);
    expect(client.release).not.toHaveBeenCalled();
  });
});
