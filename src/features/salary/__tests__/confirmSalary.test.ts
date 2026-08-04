import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import type {SqlDb, SqlExecutor} from '../../../database/connection/types';
import {
  createAccountsRepository,
  createTransactionsRepository,
} from '../../../database/repositories';
import {
  DEFAULT_ACCOUNT_IDS,
  seedDefaultData,
  SYSTEM_CATEGORY_IDS,
} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';
import {confirmSalary} from '../services/confirmSalary';
import {
  ALREADY_RECORDED_MESSAGE,
  createSalaryRepository,
} from '../services/salaryRepository';
import type {SalaryConfig} from '../types/salary';

const NOW = dayjs('2025-06-06T10:30:00').valueOf();

describe('confirmSalary', () => {
  let db: FakeDb;
  let config: SalaryConfig;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    config = await createSalaryRepository(db).saveConfig({
      amountMinor: 8_500_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      employer: 'Acme Corp',
      expectedDay: 5,
      reminderTime: '09:00',
    });
  });

  it('credited: creates a linked income transaction atomically', async () => {
    const {record, transaction} = await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'credited',
        amountMinor: config.amountMinor,
        now: NOW,
      },
      {db},
    );

    expect(transaction).not.toBeNull();
    expect(record.transactionId).toBe(transaction!.id);
    expect(record.status).toBe('credited');
    expect(record.amountMinor).toBe(8_500_000);

    const stored = await createTransactionsRepository(db).getTransactionById(
      transaction!.id,
    );
    expect(stored).toMatchObject({
      type: 'income',
      amountMinor: 8_500_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.salary,
      merchant: 'Acme Corp',
      note: null,
      occurredAt: NOW,
    });

    // Real money movement: the destination account balance goes up.
    await expect(
      createAccountsRepository(db).getAccountBalance(DEFAULT_ACCOUNT_IDS.bank),
    ).resolves.toBe(8_500_000);
  });

  it('partial: records only the received amount', async () => {
    const {record, transaction} = await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'partial',
        amountMinor: 5_000_000,
        note: 'Notice period',
        now: NOW,
      },
      {db},
    );
    expect(record.status).toBe('partial');
    expect(record.amountMinor).toBe(5_000_000);
    expect(record.note).toBe('Notice period');
    expect(transaction!.amountMinor).toBe(5_000_000);
  });

  it('bonus: an amount above the expected salary is allowed and noted', async () => {
    const {record, transaction} = await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'bonus',
        amountMinor: 10_000_000,
        note: 'Diwali bonus',
        now: NOW,
      },
      {db},
    );
    expect(record.status).toBe('bonus');
    expect(record.amountMinor).toBe(10_000_000);
    expect(record.note).toBe('Diwali bonus');
    expect(transaction!.amountMinor).toBe(10_000_000);
  });

  it('delayed: records the miss without creating a transaction', async () => {
    const {record, transaction} = await confirmSalary(
      {config, periodKey: '2025-06', status: 'delayed', now: NOW},
      {db},
    );
    expect(transaction).toBeNull();
    expect(record.status).toBe('delayed');
    expect(record.transactionId).toBeNull();
    // The expected amount is stored for reference; no money moved.
    expect(record.amountMinor).toBe(config.amountMinor);
    expect(db.getRows('transactions')).toHaveLength(0);
    await expect(
      createAccountsRepository(db).getAccountBalance(DEFAULT_ACCOUNT_IDS.bank),
    ).resolves.toBe(0);
  });

  it('upgrades a delayed record in place when the salary later arrives', async () => {
    const delayed = await confirmSalary(
      {config, periodKey: '2025-06', status: 'delayed'},
      {db},
    );
    const credited = await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'credited',
        amountMinor: config.amountMinor,
        now: NOW,
      },
      {db},
    );

    expect(credited.record.id).toBe(delayed.record.id); // same row, upgraded
    expect(credited.record.status).toBe('credited');
    expect(credited.record.transactionId).toBe(credited.transaction!.id);
    expect(db.getRows('salary_records')).toHaveLength(1);
    expect(db.getRows('transactions')).toHaveLength(1);
  });

  it('rejects a second confirmation for an already-recorded month', async () => {
    await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'credited',
        amountMinor: config.amountMinor,
      },
      {db},
    );
    await expect(
      confirmSalary(
        {
          config,
          periodKey: '2025-06',
          status: 'credited',
          amountMinor: config.amountMinor,
        },
        {db},
      ),
    ).rejects.toThrow(ALREADY_RECORDED_MESSAGE);

    // The failed confirm left no orphan transaction behind.
    expect(db.getRows('transactions')).toHaveLength(1);
    expect(db.getRows('salary_records')).toHaveLength(1);
  });

  it('does not let different months collide', async () => {
    await confirmSalary(
      {
        config,
        periodKey: '2025-05',
        status: 'credited',
        amountMinor: config.amountMinor,
      },
      {db},
    );
    await confirmSalary(
      {
        config,
        periodKey: '2025-06',
        status: 'credited',
        amountMinor: config.amountMinor,
      },
      {db},
    );
    expect(db.getRows('salary_records')).toHaveLength(2);
  });

  it('requires a positive amount for money-moving statuses', async () => {
    await expect(
      confirmSalary({config, periodKey: '2025-06', status: 'credited'}, {db}),
    ).rejects.toThrow('positive integer');
    await expect(
      confirmSalary(
        {config, periodKey: '2025-06', status: 'partial', amountMinor: 0},
        {db},
      ),
    ).rejects.toThrow('positive integer');
    await expect(
      confirmSalary(
        {config, periodKey: '2025-06', status: 'bonus', amountMinor: 10.5},
        {db},
      ),
    ).rejects.toThrow('positive integer');
  });

  it('rolls the transaction back when the record insert hits the unique constraint', async () => {
    // Sabotage only the salary_records insert, inside the same transaction.
    const sabotage = (executor: SqlExecutor): SqlDb => ({
      execute: (sql, params) => executor.execute(sql, params),
      executeAsync: (sql, params) =>
        /^INSERT INTO salary_records/i.test(sql.replace(/\s+/g, ' ').trim())
          ? Promise.reject(
              new Error(
                'UNIQUE constraint failed: salary_records.config_id, salary_records.period_key',
              ),
            )
          : executor.executeAsync(sql, params),
      transaction: fn => db.transaction(tx => fn(sabotage(tx))),
    });

    await expect(
      confirmSalary(
        {
          config,
          periodKey: '2025-06',
          status: 'credited',
          amountMinor: config.amountMinor,
        },
        {db: sabotage(db)},
      ),
    ).rejects.toThrow(ALREADY_RECORDED_MESSAGE);

    // Atomic: the income transaction was rolled back with the failed insert.
    expect(db.getRows('transactions')).toHaveLength(0);
    expect(db.getRows('salary_records')).toHaveLength(0);
  });
});
