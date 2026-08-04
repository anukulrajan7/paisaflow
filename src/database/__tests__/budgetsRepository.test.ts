import {MIGRATIONS, runMigrations} from '../migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../seeds';
import {createBudgetsRepository} from '../repositories/budgetsRepository';
import {createTransactionsRepository} from '../repositories/transactionsRepository';
import type {
  BudgetsRepository,
  TransactionsRepository,
} from '../repositories/interfaces';
import {dayjs} from '../../utils/date';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

const BUDGET_PERIOD = {
  periodStart: dayjs('2025-06-01T00:00:00').valueOf(),
  periodEnd: dayjs('2025-07-01T00:00:00').valueOf(),
};
const INSIDE = BUDGET_PERIOD.periodStart + 86_400_000;
const OUTSIDE = BUDGET_PERIOD.periodEnd + 86_400_000;

describe('BudgetsRepository', () => {
  let db: FakeDb;
  let budgets: BudgetsRepository;
  let transactions: TransactionsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    budgets = createBudgetsRepository(db);
    transactions = createTransactionsRepository(db);
  });

  async function addExpense(
    amountMinor: number,
    categoryId: string,
    occurredAt = INSIDE,
  ) {
    await transactions.createTransaction({
      type: 'expense',
      amountMinor,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId,
      occurredAt,
    });
  }

  it('validates limit and period on create', async () => {
    await expect(
      budgets.createBudget({limitMinor: 0, currency: 'INR', ...BUDGET_PERIOD}),
    ).rejects.toThrow('positive integer');
    await expect(
      budgets.createBudget({
        limitMinor: 100_000,
        currency: 'INR',
        periodStart: BUDGET_PERIOD.periodEnd,
        periodEnd: BUDGET_PERIOD.periodStart,
      }),
    ).rejects.toThrow('periodStart < periodEnd');
  });

  it('computes usage for a category budget, transfers excluded', async () => {
    const budget = await budgets.createBudget({
      categoryId: SYSTEM_CATEGORY_IDS.food,
      limitMinor: 100_000,
      currency: 'INR',
      ...BUDGET_PERIOD,
    });

    await addExpense(40_000, SYSTEM_CATEGORY_IDS.food);
    await addExpense(15_000, SYSTEM_CATEGORY_IDS.transport); // other category
    await addExpense(25_000, SYSTEM_CATEGORY_IDS.food, OUTSIDE); // other period
    await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 60_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: null,
      occurredAt: INSIDE,
    });

    const usage = await budgets.getBudgetUsage(budget.id);
    expect(usage.limitMinor).toBe(100_000);
    expect(usage.spentMinor).toBe(40_000);
    expect(usage.remainingMinor).toBe(60_000);
    expect(usage.usedFraction).toBeCloseTo(0.4);
  });

  it('overall budget (null category) sums all expense categories and can exceed 100%', async () => {
    const budget = await budgets.createBudget({
      categoryId: null,
      limitMinor: 50_000,
      currency: 'INR',
      ...BUDGET_PERIOD,
    });
    await addExpense(40_000, SYSTEM_CATEGORY_IDS.food);
    await addExpense(30_000, SYSTEM_CATEGORY_IDS.transport);

    const usage = await budgets.getBudgetUsage(budget.id);
    expect(usage.spentMinor).toBe(70_000);
    expect(usage.remainingMinor).toBe(-20_000);
    expect(usage.usedFraction).toBeCloseTo(1.4);
  });

  it('soft-deleted expenses do not count toward usage', async () => {
    const budget = await budgets.createBudget({
      limitMinor: 100_000,
      currency: 'INR',
      ...BUDGET_PERIOD,
    });
    const tx = await transactions.createTransaction({
      type: 'expense',
      amountMinor: 80_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      categoryId: SYSTEM_CATEGORY_IDS.food,
      occurredAt: INSIDE,
    });
    await transactions.softDeleteTransaction(tx.id);

    const usage = await budgets.getBudgetUsage(budget.id);
    expect(usage.spentMinor).toBe(0);
  });

  it('updates, lists active budgets and deletes', async () => {
    const budget = await budgets.createBudget({
      limitMinor: 100_000,
      currency: 'INR',
      ...BUDGET_PERIOD,
    });
    const updated = await budgets.updateBudget(budget.id, {limitMinor: 150_000});
    expect(updated.limitMinor).toBe(150_000);

    expect(await budgets.listBudgetsActiveAt(INSIDE)).toHaveLength(1);
    expect(await budgets.listBudgetsActiveAt(OUTSIDE)).toHaveLength(0);

    await budgets.deleteBudget(budget.id);
    expect(await budgets.getBudgetById(budget.id)).toBeNull();
  });
});
