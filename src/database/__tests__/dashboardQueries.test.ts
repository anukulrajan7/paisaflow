import {MIGRATIONS, runMigrations} from '../migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../seeds';
import {getDashboardSummary} from '../queries/dashboardQueries';
import {createBudgetsRepository} from '../repositories/budgetsRepository';
import {createTransactionsRepository} from '../repositories/transactionsRepository';
import type {TransactionsRepository} from '../repositories/interfaces';
import {dayjs} from '../../utils/date';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

const NOW = dayjs('2025-06-15T15:00:00').valueOf();
const MONTH = {
  start: dayjs('2025-06-01T00:00:00').valueOf(),
  end: dayjs('2025-07-01T00:00:00').valueOf(),
};
const PREV_MONTH = {
  start: dayjs('2025-05-01T00:00:00').valueOf(),
  end: dayjs('2025-06-01T00:00:00').valueOf(),
};

describe('getDashboardSummary', () => {
  let db: FakeDb;
  let transactions: TransactionsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    transactions = createTransactionsRepository(db);
  });

  it('aggregates month, previous month, today, categories, recents and budget in one call', async () => {
    // This month: salary + two expenses (one today) + one transfer (excluded).
    await transactions.createTransaction({
      type: 'income',
      amountMinor: 900_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.salary,
      occurredAt: MONTH.start + 3_600_000,
    });
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 60_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: NOW - 3_600_000, // today
    });
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 40_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.transport,
      occurredAt: MONTH.start + 86_400_000,
    });
    await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 100_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.cash,
      occurredAt: NOW - 7_200_000,
    });
    // Previous month expense.
    await transactions.createTransaction({
      type: 'expense',
      amountMinor: 75_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: PREV_MONTH.start + 86_400_000,
    });
    // Overall budget covering "now".
    await createBudgetsRepository(db).createBudget({
      categoryId: null,
      limitMinor: 200_000,
      currency: 'INR',
      periodStart: MONTH.start,
      periodEnd: MONTH.end,
    });

    const summary = await getDashboardSummary(db, MONTH, NOW);

    expect(summary.monthIncomeMinor).toBe(900_000);
    expect(summary.monthExpenseMinor).toBe(100_000);
    expect(summary.monthTransactionCount).toBe(3);
    expect(summary.previousMonthExpenseMinor).toBe(75_000);
    expect(summary.todayExpenseMinor).toBe(60_000);

    expect(summary.categoryTotals.map(t => [t.name, t.totalMinor])).toEqual([
      ['Food', 60_000],
      ['Transport', 40_000],
    ]);

    // Recent 5, newest first — includes the transfer.
    expect(summary.recentTransactions).toHaveLength(5);
    expect(summary.recentTransactions[0].type).toBe('expense');
    expect(summary.recentTransactions[1].type).toBe('transfer');

    expect(summary.overallBudgetUsage?.limitMinor).toBe(200_000);
    expect(summary.overallBudgetUsage?.spentMinor).toBe(100_000);
  });

  it('returns null budget usage and zero totals on an empty database', async () => {
    const summary = await getDashboardSummary(db, MONTH, NOW);
    expect(summary.monthIncomeMinor).toBe(0);
    expect(summary.monthExpenseMinor).toBe(0);
    expect(summary.monthTransactionCount).toBe(0);
    expect(summary.previousMonthExpenseMinor).toBe(0);
    expect(summary.todayExpenseMinor).toBe(0);
    expect(summary.categoryTotals).toEqual([]);
    expect(summary.recentTransactions).toEqual([]);
    expect(summary.overallBudgetUsage).toBeNull();
  });
});
