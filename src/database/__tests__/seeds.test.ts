import {MIGRATIONS, runMigrations} from '../migrations';
import {
  DEFAULT_ACCOUNT_IDS,
  seedDefaultData,
  seedDevSampleData,
  SYSTEM_CATEGORY_IDS,
} from '../seeds';
import {dayjs} from '../../utils/date';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

async function bootedDb(): Promise<FakeDb> {
  const db = createFakeDb();
  await runMigrations(db, MIGRATIONS);
  await seedDefaultData(db);
  return db;
}

describe('seeds', () => {
  it('default seed is idempotent and marks Cash as default', async () => {
    const db = await bootedDb();
    await seedDefaultData(db);
    await seedDefaultData(db);

    const accounts = db.getRows('accounts');
    expect(accounts).toHaveLength(4);
    expect(
      accounts.filter(row => row.is_default === 1).map(row => row.id),
    ).toEqual([DEFAULT_ACCOUNT_IDS.cash]);

    const categories = db.getRows('categories');
    expect(categories).toHaveLength(18);
    expect(categories.every(row => row.is_system === 1)).toBe(true);
    expect(
      categories.filter(row => row.type === 'expense'),
    ).toHaveLength(12);
    expect(categories.filter(row => row.type === 'income')).toHaveLength(6);
    expect(categories.every(row => typeof row.color === 'string')).toBe(true);
    expect(categories.every(row => typeof row.icon === 'string')).toBe(true);
  });

  it('DEV seed adds transactions across months plus near-limit and exceeded budgets, idempotently', async () => {
    const db = await bootedDb();
    await seedDevSampleData(db);
    const txCount = db.getRows('transactions').length;
    expect(txCount).toBeGreaterThan(20);

    // Spread across at least two months.
    const months = new Set(
      db
        .getRows('transactions')
        .map(row => dayjs(row.occurred_at as number).format('YYYY-MM')),
    );
    expect(months.size).toBeGreaterThanOrEqual(2);

    const budgetRows = db.getRows('budgets');
    const overall = budgetRows.find(row => row.id === 'dev_budget_overall');
    const food = budgetRows.find(row => row.id === 'dev_budget_food');
    expect(overall?.category_id ?? null).toBeNull();
    expect(food?.category_id).toBe(SYSTEM_CATEGORY_IDS.food);

    const thisMonth = {
      start: dayjs().startOf('month').valueOf(),
      end: dayjs().add(1, 'month').startOf('month').valueOf(),
    };
    const spent = (categoryId: string | null) =>
      db
        .getRows('transactions')
        .filter(
          row =>
            row.type === 'expense' &&
            row.deleted_at == null &&
            (categoryId == null || row.category_id === categoryId) &&
            (row.occurred_at as number) >= thisMonth.start &&
            (row.occurred_at as number) < thisMonth.end,
        )
        .reduce((sum, row) => sum + (row.amount_minor as number), 0);

    // Overall: spent should be roughly 90% of the limit (near limit).
    const overallSpent = spent(null);
    const overallLimit = overall?.limit_minor as number;
    expect(overallSpent).toBeGreaterThan(overallLimit * 0.8);
    expect(overallSpent).toBeLessThanOrEqual(overallLimit);

    // Food: spent exceeds the limit.
    expect(spent(SYSTEM_CATEGORY_IDS.food)).toBeGreaterThan(
      food?.limit_minor as number,
    );

    // Idempotent re-run.
    await seedDevSampleData(db);
    expect(db.getRows('transactions')).toHaveLength(txCount);
    expect(db.getRows('budgets')).toHaveLength(budgetRows.length);
  });
});
