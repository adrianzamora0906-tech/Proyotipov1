jest.mock('../config/database', () => ({ query: jest.fn(), getClient: jest.fn() }));
jest.mock('../services/AuditService', () => ({ log: jest.fn() }));
const db = require('../config/database');
const PaymentService = require('../services/PaymentService');
const CashOperationsService = require('../services/CashOperationsService');

describe('transfer review transaction ownership', () => {
  afterEach(() => jest.restoreAllMocks());

  test('approval registers payment on the same client and commits once', async () => {
    const client = { query: jest.fn(async sql => {
      if (sql.includes('SELECT 1 FROM settings')) return { rows: [{}] };
      if (sql.includes('SELECT tv.*')) return { rows: [{ identification: '123', branch_id: 'branch', amount: 20, reviewed_by: 'gema' }] };
      return { rows: [{}] };
    }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const payment = jest.spyOn(PaymentService, 'registerPayment').mockResolvedValue({ newBalance: 0 });
    await CashOperationsService.reviewTransfer('transfer', 'APPROVED', null, { id: 'yuny' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true });
    expect(payment).toHaveBeenCalledWith(expect.any(Object), client);
    expect(client.query.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF tv'), expect.any(Array));
  });

  test('confirmation queues approval without applying payment', async () => {
    const client = { query: jest.fn(async sql => {
      if (sql.includes('SELECT 1 FROM settings')) return { rows: [{}] };
      if (sql.includes('SELECT tv.*')) return { rows: [{ branch_id: 'branch' }] };
      return { rows: [{}] };
    }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const payment = jest.spyOn(PaymentService, 'registerPayment');
    await CashOperationsService.reviewTransfer('transfer', 'CONFIRMED', null, { id: 'gema' }, { permissions: ['TRANSFER_VERIFY'] });
    expect(payment).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('reviewed_at=NOW()'), ['transfer', 'AWAITING_APPROVAL', 'gema', null, 'PENDING']);
  });

  test('a confirmer cannot approve their own transfer', async () => {
    const client = { query: jest.fn(async sql => ({ rows: sql.includes('SELECT tv.*') ? [{ reviewed_by: 'gema' }] : [] })), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    await expect(CashOperationsService.reviewTransfer('transfer', 'APPROVED', null, { id: 'gema' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true })).rejects.toMatchObject({ status: 403 });
    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  test('requires the permission of the requested stage', async () => {
    await expect(CashOperationsService.reviewTransfer('transfer', 'APPROVED', null, { id: 'gema' }, { permissions: ['TRANSFER_VERIFY'], transferApproval: true })).rejects.toMatchObject({ status: 403 });
  });

  test('approval of an older applied transfer does not repeat payment', async () => {
    const client = { query: jest.fn(async sql => ({ rows: sql.includes('SELECT tv.*') ? [{ status: 'CONFIRMED', reviewed_by: 'gema', branch_id: 'branch' }] : [{}] })), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const payment = jest.spyOn(PaymentService, 'registerPayment');
    await CashOperationsService.reviewTransfer('transfer', 'APPROVED', null, { id: 'yuny' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true });
    expect(payment).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('approved_at=NOW()'), ['transfer', 'CONFIRMED', 'yuny', null, 'CONFIRMED']);
  });

  test('older applied transfers require void workflow for financial rejection', async () => {
    const client = { query: jest.fn(async sql => ({ rows: sql.includes('SELECT tv.*') ? [{ status: 'CONFIRMED', reviewed_by: 'gema' }] : [] })), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    await expect(CashOperationsService.reviewTransfer('transfer', 'REJECTED', null, { id: 'yuny' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true })).rejects.toMatchObject({ status: 409 });
  });

  test('approval only accepts transfers awaiting approval', async () => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    await expect(CashOperationsService.reviewTransfer('transfer', 'APPROVED', null, { id: 'yuny' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true })).rejects.toMatchObject({ status: 404 });
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE OF tv'), ['transfer', null, 'AWAITING_APPROVAL']);
  });

  test('final rejection does not register a payment', async () => {
    const client = { query: jest.fn(async sql => ({ rows: sql.includes('SELECT tv.*') ? [{ reviewed_by: 'gema', branch_id: 'branch' }] : [{}] })), release: jest.fn() };
    db.getClient.mockResolvedValue(client);
    const payment = jest.spyOn(PaymentService, 'registerPayment');
    await CashOperationsService.reviewTransfer('transfer', 'REJECTED', 'No acreditada', { id: 'yuny' }, { permissions: ['TRANSFER_APPROVE'], transferApproval: true });
    expect(payment).not.toHaveBeenCalled();
    expect(client.query).toHaveBeenCalledWith(expect.stringContaining('approved_at=NOW()'), ['transfer', 'REJECTED', 'yuny', 'No acreditada', 'AWAITING_APPROVAL']);
  });

  test.each(['registerPayment', 'registerServicePayment'])('%s leaves rollback and release to caller on failure', async method => {
    const client = { query: jest.fn().mockResolvedValue({ rows: [] }), release: jest.fn() };
    await expect(PaymentService[method]({ cedula: 'missing' }, client)).rejects.toBeDefined();
    expect(client.query.mock.calls.some(([sql]) => ['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql))).toBe(false);
    expect(client.release).not.toHaveBeenCalled();
  });
});
