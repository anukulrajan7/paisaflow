import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {
  DEFAULT_ACCOUNT_IDS,
  seedDefaultData,
  SYSTEM_CATEGORY_IDS,
} from '../../../database/seeds';
import {getInsightsRawData} from '../../../database/queries/insightsQueries';
import {createBudgetsRepository} from '../../../database/repositories/budgetsRepository';
import {createTransactionsRepository} from '../../../database/repositories/transactionsRepository';
import type {TransactionsRepository} from '../../../database/repositories/interfaces';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';

const NOW = dayjs('2025-06-15T15:00:00').valueOf();
const WINDOW = {
  start: dayjs('2025-01-01T00:00:00').valueOf(),
  end: dayjs('2025-07-01T00:00:00').valueOf(),
};

describe('getInsightsRawData', () => {
  let db: FakeDb;
  let transactions: TransactionsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    transactions = createTransactionsRepository(db);
  });

  it('returns income/expense rows in the window, categories and budget usage', async () => {
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 60_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: NOW - 3_600_000,
    });
    await transactions.createTransaction({
      type: 'income',
      amountMinor: 900_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.salary,
      occurredAt: NOW - 7_200_000,
    });
    // Transfer: excluded from insights.
    await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 100_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.cash,
      occurredAt: NOW - 1_800_000,
    });
    // Soft-deleted: excluded.
    const deleted = await transactions.createTransaction({
      type: 'expense',
      amountMinor: 50_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: NOW - 900_000,
    });
    await transactions.softDeleteTransaction(deleted.id);
    // Outside the window: excluded.
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 70_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: dayjs('2024-12-15T12:00:00').valueOf(),
    });
    await createBudgetsRepository(db).createBudget({
      categoryId: null,
      limitMinor: 200_000,
      currency: 'INR',
      periodStart: dayjs('2025-06-01T00:00:00').valueOf(),
      periodEnd: dayjs('2025-07-01T00:00:00').valueOf(),
    });

    const raw = await getInsightsRawData(db, WINDOW.start, WINDOW.end, NOW);

    expect(raw.transactions).toHaveLength(2);
    expect(
      raw.transactions.reduce((sum, row) => sum + row.amount_minor, 0),
    ).toBe(960_000);
    expect(raw.categories.length).toBeGreaterThan(0);
    expect(raw.categories.every(c => c.name && c.icon && c.color)).toBe(true);
    expect(raw.overallBudgetUsage?.limitMinor).toBe(200_000);
    // Budget spending counts only the live expense in the budget period.
    expect(raw.overallBudgetUsage?.spentMinor).toBe(60_000);
  });

  it('returns empty rows and null budget usage on an empty database', async () => {
    const raw = await getInsightsRawData(db, WINDOW.start, WINDOW.end, NOW);
    expect(raw.transactions).toEqual([]);
    expect(raw.overallBudgetUsage).toBeNull();
  });
});
