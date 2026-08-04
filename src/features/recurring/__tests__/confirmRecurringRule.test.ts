import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../../../database/seeds';
import {createTransactionsRepository} from '../../../database/repositories/transactionsRepository';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';
import {confirmRecurringRule} from '../services/confirmRecurringRule';
import {
  createRecurringRulesRepository,
  type RecurringRulesRepository,
} from '../services/recurringRulesRepository';

function at(iso: string): number {
  return dayjs(iso).valueOf();
}

describe('confirmRecurringRule', () => {
  let db: FakeDb;
  let rules: RecurringRulesRepository;
  let deps: {
    rules: RecurringRulesRepository;
    transactions: ReturnType<typeof createTransactionsRepository>;
  };

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    rules = createRecurringRulesRepository(db);
    deps = {rules, transactions: createTransactionsRepository(db)};
  });

  it('creates a real transaction from the rule fields with occurred_at = now', async () => {
    const rule = await rules.createRule({
      type: 'expense',
      amountMinor: 24_900,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.bills,
      merchant: 'Netflix',
      frequency: 'monthly',
      nextDueAt: at('2025-06-05T09:00:00'),
    });
    const now = at('2025-06-05T12:30:00');

    const result = await confirmRecurringRule(rule.id, now, deps);

    expect(result.transaction).toMatchObject({
      type: 'expense',
      amountMinor: 24_900,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      categoryId: SYSTEM_CATEGORY_IDS.bills,
      merchant: 'Netflix',
      occurredAt: now,
      deletedAt: null,
    });
    // And it is really in the ledger.
    const stored = await deps.transactions.getTransactionById(
      result.transaction.id,
    );
    expect(stored?.amountMinor).toBe(24_900);
  });

  it('stamps last_confirmed_at and advances next_due_at by one period', async () => {
    const rule = await rules.createRule({
      type: 'expense',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      frequency: 'monthly',
      nextDueAt: at('2025-06-05T09:00:00'),
    });
    const now = at('2025-06-05T12:00:00');

    const result = await confirmRecurringRule(rule.id, now, deps);

    expect(result.rule.lastConfirmedAt).toBe(now);
    expect(result.rule.nextDueAt).toBe(at('2025-07-05T09:00:00'));
    expect(result.overdueDays).toBe(0);
  });

  it('catches up multiple missed periods so the next due date is in the future', async () => {
    const rule = await rules.createRule({
      type: 'expense',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      frequency: 'monthly',
      nextDueAt: at('2025-03-05T09:00:00'), // ~3 months behind
    });
    const now = at('2025-06-02T12:00:00');

    const result = await confirmRecurringRule(rule.id, now, deps);

    // Mar → Apr → May → Jun 5 is the first occurrence after now.
    expect(result.rule.nextDueAt).toBe(at('2025-06-05T09:00:00'));
    expect(result.rule.nextDueAt).toBeGreaterThan(now);
  });

  it('keeps the schedule anchored on the due time, not the confirmation time', async () => {
    const rule = await rules.createRule({
      type: 'expense',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      frequency: 'weekly',
      nextDueAt: at('2025-06-02T08:00:00'), // Monday 08:00
    });
    const now = at('2025-06-04T19:45:00'); // confirmed Wednesday evening

    const result = await confirmRecurringRule(rule.id, now, deps);

    expect(result.rule.nextDueAt).toBe(at('2025-06-09T08:00:00'));
    expect(result.overdueDays).toBe(2);
  });

  it('reports how many days late a card bill payment was confirmed', async () => {
    const rule = await rules.createRule({
      type: 'transfer',
      amountMinor: 150_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.creditCard,
      frequency: 'monthly',
      nextDueAt: at('2025-05-31T09:00:00'),
    });
    const now = at('2025-06-05T12:00:00');

    const result = await confirmRecurringRule(rule.id, now, deps);

    expect(result.overdueDays).toBe(5);
    // The bill payment is a transfer onto the card, category nulled.
    expect(result.transaction).toMatchObject({
      type: 'transfer',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.creditCard,
      categoryId: null,
    });
    // Month-end anchor: May 31 → next due clamps to Jun 30.
    expect(result.rule.nextDueAt).toBe(at('2025-06-30T09:00:00'));
  });

  it('rejects paused or missing rules without writing anything', async () => {
    const rule = await rules.createRule({
      type: 'expense',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      frequency: 'daily',
      nextDueAt: at('2025-06-01T09:00:00'),
    });
    await rules.setRuleActive(rule.id, false);

    await expect(
      confirmRecurringRule(rule.id, at('2025-06-05T12:00:00'), deps),
    ).rejects.toThrow('paused');
    await expect(
      confirmRecurringRule('missing', at('2025-06-05T12:00:00'), deps),
    ).rejects.toThrow('not found');
    expect(await deps.transactions.listTransactions()).toHaveLength(0);
  });
});
