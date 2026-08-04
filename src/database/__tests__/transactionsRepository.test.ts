import {MIGRATIONS, runMigrations} from '../migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../seeds';
import {createTransactionsRepository} from '../repositories/transactionsRepository';
import type {
  CreateTransactionInput,
  TransactionsRepository,
} from '../repositories/interfaces';
import {dayjs} from '../../utils/date';
import {createFakeDb} from './fakeDb';
import type {FakeDb} from './fakeDb';

const T0 = dayjs('2025-06-10T12:00:00').valueOf();
const PERIOD = {start: T0 - 1_000, end: T0 + 1_000};

function expenseInput(
  overrides: Partial<CreateTransactionInput> = {},
): CreateTransactionInput {
  return {
    type: 'expense',
    amountMinor: 10_000,
    currency: 'INR',
    accountId: DEFAULT_ACCOUNT_IDS.cash,
    categoryId: SYSTEM_CATEGORY_IDS.food,
    occurredAt: T0,
    ...overrides,
  };
}

describe('TransactionsRepository', () => {
  let db: FakeDb;
  let repo: TransactionsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    repo = createTransactionsRepository(db);
  });

  it('creates an expense and reads it back as a domain object', async () => {
    const created = await repo.createTransaction(
      expenseInput({merchant: 'Chai Point', note: 'morning chai'}),
    );
    expect(created.id).toBeTruthy();
    expect(created.deletedAt).toBeNull();

    const fetched = await repo.getTransactionById(created.id);
    expect(fetched).toEqual(created);
    expect(fetched?.merchant).toBe('Chai Point');
  });

  it('rejects non-positive or non-integer amounts for every type', async () => {
    await expect(
      repo.createTransaction(expenseInput({amountMinor: 0})),
    ).rejects.toThrow('positive integer');
    await expect(
      repo.createTransaction(expenseInput({amountMinor: -500})),
    ).rejects.toThrow('positive integer');
    await expect(
      repo.createTransaction(expenseInput({amountMinor: 10.5})),
    ).rejects.toThrow('positive integer');
    await expect(
      repo.createTransaction(
        expenseInput({type: 'income', amountMinor: 0}),
      ),
    ).rejects.toThrow('positive integer');
  });

  it('requires a destination account for transfers', async () => {
    await expect(
      repo.createTransaction(
        expenseInput({type: 'transfer', destinationAccountId: null}),
      ),
    ).rejects.toThrow('destinationAccountId');
    await expect(
      repo.createTransaction(
        expenseInput({
          type: 'transfer',
          destinationAccountId: DEFAULT_ACCOUNT_IDS.cash,
        }),
      ),
    ).rejects.toThrow('differ from the source');
  });

  it('forces category to null for transfers and destination to null otherwise', async () => {
    const transfer = await repo.createTransaction(
      expenseInput({
        type: 'transfer',
        destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
        categoryId: SYSTEM_CATEGORY_IDS.food,
      }),
    );
    expect(transfer.categoryId).toBeNull();
    expect(transfer.destinationAccountId).toBe(DEFAULT_ACCOUNT_IDS.bank);

    const expense = await repo.createTransaction(
      expenseInput({destinationAccountId: DEFAULT_ACCOUNT_IDS.bank}),
    );
    expect(expense.destinationAccountId).toBeNull();
    expect(expense.categoryId).toBe(SYSTEM_CATEGORY_IDS.food);
  });

  it('validates the merged input on update', async () => {
    const created = await repo.createTransaction(expenseInput());
    const updated = await repo.updateTransaction(created.id, {
      amountMinor: 25_000,
      note: 'updated',
    });
    expect(updated.amountMinor).toBe(25_000);
    expect(updated.note).toBe('updated');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);

    // Changing to a transfer without a destination must fail.
    await expect(
      repo.updateTransaction(created.id, {type: 'transfer'}),
    ).rejects.toThrow('destinationAccountId');
  });

  it('soft-deleted rows are hidden from lists and totals; restore brings them back', async () => {
    const kept = await repo.createTransaction(expenseInput({amountMinor: 10_000}));
    const deleted = await repo.createTransaction(
      expenseInput({amountMinor: 20_000}),
    );
    await repo.softDeleteTransaction(deleted.id);

    const visible = await repo.listTransactions();
    expect(visible.map(t => t.id)).toEqual([kept.id]);

    const withDeleted = await repo.listTransactions({includeDeleted: true});
    expect(withDeleted).toHaveLength(2);

    const totals = await repo.getMonthlyTotals(PERIOD);
    expect(totals.expenseMinor).toBe(10_000);
    expect(totals.count).toBe(1);

    await repo.restoreTransaction(deleted.id);
    const restoredTotals = await repo.getMonthlyTotals(PERIOD);
    expect(restoredTotals.expenseMinor).toBe(30_000);
    expect(restoredTotals.count).toBe(2);
  });

  it('getMonthlyTotals excludes transfers', async () => {
    await repo.createTransaction(
      expenseInput({type: 'income', categoryId: SYSTEM_CATEGORY_IDS.salary, amountMinor: 100_000}),
    );
    await repo.createTransaction(expenseInput({amountMinor: 40_000}));
    await repo.createTransaction(
      expenseInput({
        type: 'transfer',
        amountMinor: 70_000,
        destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
      }),
    );

    const totals = await repo.getMonthlyTotals(PERIOD);
    expect(totals).toEqual({incomeMinor: 100_000, expenseMinor: 40_000, count: 2});
  });

  it('listTransactions filters by type, category, account, date range and paginates newest-first', async () => {
    const older = await repo.createTransaction(
      expenseInput({occurredAt: T0 - 10_000, amountMinor: 1_000}),
    );
    const newer = await repo.createTransaction(
      expenseInput({occurredAt: T0, amountMinor: 2_000}),
    );
    const income = await repo.createTransaction(
      expenseInput({
        type: 'income',
        categoryId: SYSTEM_CATEGORY_IDS.salary,
        occurredAt: T0 - 5_000,
      }),
    );

    const expenses = await repo.listTransactions({type: 'expense'});
    expect(expenses.map(t => t.id)).toEqual([newer.id, older.id]);

    const byCategory = await repo.listTransactions({
      categoryId: SYSTEM_CATEGORY_IDS.salary,
    });
    expect(byCategory).toHaveLength(1);

    const byRange = await repo.listTransactions({from: T0 - 1_000, to: T0 + 1});
    expect(byRange.map(t => t.id)).toEqual([newer.id]);

    // Newest-first order overall: newer (T0), income (T0-5s), older (T0-10s).
    const page = await repo.listTransactions({limit: 1, offset: 1});
    expect(page.map(t => t.id)).toEqual([income.id]);
    const lastPage = await repo.listTransactions({limit: 1, offset: 2});
    expect(lastPage.map(t => t.id)).toEqual([older.id]);
  });

  it('searchTransactions matches merchant, note and category name', async () => {
    const byMerchant = await repo.createTransaction(
      expenseInput({merchant: 'Chai Point'}),
    );
    const byNote = await repo.createTransaction(
      expenseInput({note: 'team lunch at chaitanya'}),
    );
    const byCategory = await repo.createTransaction(
      expenseInput({categoryId: SYSTEM_CATEGORY_IDS.groceries}),
    );

    expect((await repo.searchTransactions('chai')).map(t => t.id)).toEqual(
      expect.arrayContaining([byMerchant.id, byNote.id]),
    );
    expect((await repo.searchTransactions('grocer')).map(t => t.id)).toEqual([
      byCategory.id,
    ]);
    // Wildcards in user input are literal, not LIKE syntax.
    expect(await repo.searchTransactions('100%')).toEqual([]);
    expect(await repo.searchTransactions('   ')).toEqual([]);
  });

  it('getDailyTotals fills every day of the period and excludes transfers', async () => {
    const start = dayjs('2025-06-10T00:00:00').valueOf();
    const period = {start, end: dayjs('2025-06-13T00:00:00').valueOf()};

    await repo.createTransaction(
      expenseInput({amountMinor: 5_000, occurredAt: start + 3_600_000}),
    );
    await repo.createTransaction(
      expenseInput({amountMinor: 7_000, occurredAt: start + 7_200_000}),
    );
    await repo.createTransaction(
      expenseInput({
        type: 'transfer',
        amountMinor: 9_000,
        destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: start + 7_200_000,
      }),
    );

    const daily = await repo.getDailyTotals(period);
    expect(daily).toHaveLength(3);
    expect(daily[0]).toEqual({
      dayStart: start,
      incomeMinor: 0,
      expenseMinor: 12_000,
    });
    expect(daily[1].expenseMinor).toBe(0);
    expect(daily[2].expenseMinor).toBe(0);
  });

  it('getCategoryTotals groups by category with metadata, sorted desc', async () => {
    await repo.createTransaction(
      expenseInput({amountMinor: 10_000, categoryId: SYSTEM_CATEGORY_IDS.food}),
    );
    await repo.createTransaction(
      expenseInput({amountMinor: 35_000, categoryId: SYSTEM_CATEGORY_IDS.transport}),
    );
    await repo.createTransaction(
      expenseInput({amountMinor: 20_000, categoryId: SYSTEM_CATEGORY_IDS.food}),
    );

    const totals = await repo.getCategoryTotals(PERIOD, 'expense');
    expect(totals.map(t => [t.name, t.totalMinor])).toEqual([
      ['Transport', 35_000],
      ['Food', 30_000],
    ]);
    expect(totals[1].categoryId).toBe(SYSTEM_CATEGORY_IDS.food);
    expect(totals[1].count).toBe(2);
    expect(totals[1].icon).toBeTruthy();
  });
});
