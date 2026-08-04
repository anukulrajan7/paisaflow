import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {
  ALREADY_RECORDED_MESSAGE,
  createSalaryRepository,
} from '../services/salaryRepository';
import type {
  SalaryConfigInput,
  SalaryRepository,
} from '../services/salaryRepository';

function baseConfig(overrides: Partial<SalaryConfigInput> = {}): SalaryConfigInput {
  return {
    amountMinor: 8_500_000,
    currency: 'INR',
    accountId: DEFAULT_ACCOUNT_IDS.bank,
    employer: 'Acme Corp',
    expectedDay: 5,
    reminderTime: '09:00',
    ...overrides,
  };
}

describe('SalaryRepository', () => {
  let db: FakeDb;
  let salary: SalaryRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    salary = createSalaryRepository(db);
  });

  it('creates the active config and reads it back', async () => {
    expect(await salary.getActiveConfig()).toBeNull();

    const created = await salary.saveConfig(baseConfig());
    expect(created.id).toBeTruthy();
    expect(created.isActive).toBe(true);
    expect(created.reminderTime).toBe('09:00');
    expect(created.employer).toBe('Acme Corp');

    const active = await salary.getActiveConfig();
    expect(active).toEqual(created);
    expect(await salary.getConfigById(created.id)).toEqual(created);
  });

  it('saveConfig upserts: there is only ever one active config', async () => {
    const first = await salary.saveConfig(baseConfig());
    const second = await salary.saveConfig(
      baseConfig({amountMinor: 9_000_000, expectedDay: 7}),
    );
    expect(second.id).toBe(first.id);
    expect(second.amountMinor).toBe(9_000_000);
    expect(second.expectedDay).toBe(7);
    expect(db.getRows('salary_configs')).toHaveLength(1);
  });

  it('trims a blank employer to null and allows no reminder time', async () => {
    const created = await salary.saveConfig(
      baseConfig({employer: '   ', reminderTime: null}),
    );
    expect(created.employer).toBeNull();
    expect(created.reminderTime).toBeNull();
  });

  it('validates the config input', async () => {
    await expect(salary.saveConfig(baseConfig({amountMinor: 0}))).rejects.toThrow(
      'positive integer',
    );
    await expect(
      salary.saveConfig(baseConfig({amountMinor: 10.5})),
    ).rejects.toThrow('positive integer');
    await expect(salary.saveConfig(baseConfig({accountId: ''}))).rejects.toThrow(
      'accountId',
    );
    await expect(salary.saveConfig(baseConfig({currency: ''}))).rejects.toThrow(
      'currency',
    );
    await expect(salary.saveConfig(baseConfig({expectedDay: 0}))).rejects.toThrow(
      'expectedDay',
    );
    await expect(salary.saveConfig(baseConfig({expectedDay: 29}))).rejects.toThrow(
      'expectedDay',
    );
    await expect(salary.saveConfig(baseConfig({expectedDay: 1.5}))).rejects.toThrow(
      'expectedDay',
    );
    await expect(
      salary.saveConfig(baseConfig({reminderTime: '25:00'})),
    ).rejects.toThrow('HH:mm');
    await expect(
      salary.saveConfig(baseConfig({reminderTime: '9:00'})),
    ).rejects.toThrow('HH:mm');
  });

  it('creates records and lists them newest period first', async () => {
    const config = await salary.saveConfig(baseConfig());
    const may = await salary.createRecord({
      configId: config.id,
      periodKey: '2025-05',
      amountMinor: 8_500_000,
      status: 'credited',
      transactionId: 'txn_may',
    });
    await salary.createRecord({
      configId: config.id,
      periodKey: '2025-04',
      amountMinor: 8_000_000,
      status: 'partial',
      transactionId: 'txn_apr',
      note: 'Notice period',
    });

    const records = await salary.listRecords(config.id);
    expect(records.map(record => record.periodKey)).toEqual([
      '2025-05',
      '2025-04',
    ]);
    expect(records[0]).toEqual(may);
    expect(records[1].note).toBe('Notice period');
  });

  it('prevents duplicate records for the same month', async () => {
    const config = await salary.saveConfig(baseConfig());
    await salary.createRecord({
      configId: config.id,
      periodKey: '2025-06',
      amountMinor: 8_500_000,
      status: 'credited',
    });
    await expect(
      salary.createRecord({
        configId: config.id,
        periodKey: '2025-06',
        amountMinor: 8_500_000,
        status: 'credited',
      }),
    ).rejects.toThrow(ALREADY_RECORDED_MESSAGE);
    expect(db.getRows('salary_records')).toHaveLength(1);
  });

  it('validates record input', async () => {
    const config = await salary.saveConfig(baseConfig());
    await expect(
      salary.createRecord({
        configId: config.id,
        periodKey: '2025-13',
        amountMinor: 1,
        status: 'credited',
      }),
    ).rejects.toThrow('YYYY-MM');
    await expect(
      salary.createRecord({
        configId: config.id,
        periodKey: '2025-06',
        amountMinor: 0,
        status: 'credited',
      }),
    ).rejects.toThrow('positive integer');
    await expect(
      salary.createRecord({
        configId: config.id,
        periodKey: '2025-06',
        amountMinor: 1,
        status: 'late' as never,
      }),
    ).rejects.toThrow('status');
    await expect(
      salary.createRecord({
        configId: '',
        periodKey: '2025-06',
        amountMinor: 1,
        status: 'credited',
      }),
    ).rejects.toThrow('configId');
  });

  it('updates a record (the delayed -> credited upgrade path)', async () => {
    const config = await salary.saveConfig(baseConfig());
    const delayed = await salary.createRecord({
      configId: config.id,
      periodKey: '2025-06',
      amountMinor: 8_500_000,
      status: 'delayed',
    });
    expect(delayed.transactionId).toBeNull();

    const updated = await salary.updateRecord(delayed.id, {
      status: 'credited',
      transactionId: 'txn_1',
      note: 'Arrived on the 8th',
    });
    expect(updated.status).toBe('credited');
    expect(updated.transactionId).toBe('txn_1');
    expect(updated.note).toBe('Arrived on the 8th');
    expect(updated.amountMinor).toBe(8_500_000); // untouched fields survive

    await expect(
      salary.updateRecord('missing', {status: 'credited'}),
    ).rejects.toThrow('not found');
  });
});
