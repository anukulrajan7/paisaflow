import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData, SYSTEM_CATEGORY_IDS} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {dayjs} from '../../../utils/date';
import {
  createRecurringRulesRepository,
  type RecurringRuleInput,
  type RecurringRulesRepository,
} from '../services/recurringRulesRepository';

const NEXT_DUE = dayjs('2025-06-05T09:00:00').valueOf();

function baseInput(overrides: Partial<RecurringRuleInput> = {}): RecurringRuleInput {
  return {
    type: 'expense',
    amountMinor: 24_900,
    currency: 'INR',
    accountId: DEFAULT_ACCOUNT_IDS.bank,
    categoryId: SYSTEM_CATEGORY_IDS.bills,
    merchant: 'Netflix',
    frequency: 'monthly',
    nextDueAt: NEXT_DUE,
    ...overrides,
  };
}

describe('RecurringRulesRepository', () => {
  let db: FakeDb;
  let rules: RecurringRulesRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    rules = createRecurringRulesRepository(db);
  });

  it('creates a rule with defaults and reads it back', async () => {
    const created = await rules.createRule(baseInput());
    expect(created.id).toBeTruthy();
    expect(created.intervalCount).toBe(1);
    expect(created.isActive).toBe(true);
    expect(created.lastConfirmedAt).toBeNull();
    expect(created.nextDueAt).toBe(NEXT_DUE);

    const fetched = await rules.getRuleById(created.id);
    expect(fetched).toEqual(created);
  });

  it('validates amount, account, frequency, interval and nextDueAt', async () => {
    await expect(rules.createRule(baseInput({amountMinor: 0}))).rejects.toThrow(
      'positive integer',
    );
    await expect(
      rules.createRule(baseInput({amountMinor: -500})),
    ).rejects.toThrow('positive integer');
    await expect(
      rules.createRule(baseInput({amountMinor: 10.5})),
    ).rejects.toThrow('positive integer');
    await expect(rules.createRule(baseInput({accountId: ''}))).rejects.toThrow(
      'accountId',
    );
    await expect(rules.createRule(baseInput({currency: ''}))).rejects.toThrow(
      'currency',
    );
    await expect(
      rules.createRule(baseInput({frequency: 'hourly' as never})),
    ).rejects.toThrow('frequency');
    await expect(rules.createRule(baseInput({intervalCount: 0}))).rejects.toThrow(
      'intervalCount',
    );
    await expect(
      rules.createRule(baseInput({nextDueAt: Number.NaN})),
    ).rejects.toThrow('nextDueAt');
  });

  it('requires a distinct destination for transfers and nulls the category', async () => {
    await expect(
      rules.createRule(
        baseInput({type: 'transfer', destinationAccountId: null}),
      ),
    ).rejects.toThrow('destinationAccountId');
    await expect(
      rules.createRule(
        baseInput({
          type: 'transfer',
          destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
        }),
      ),
    ).rejects.toThrow('differ from the source');

    // Credit card bill payment: bank → credit card.
    const bill = await rules.createRule(
      baseInput({
        type: 'transfer',
        destinationAccountId: DEFAULT_ACCOUNT_IDS.creditCard,
        merchant: null,
      }),
    );
    expect(bill.categoryId).toBeNull();
    expect(bill.destinationAccountId).toBe(DEFAULT_ACCOUNT_IDS.creditCard);
  });

  it('nulls the destination for expense/income rules', async () => {
    const income = await rules.createRule(
      baseInput({
        type: 'income',
        categoryId: SYSTEM_CATEGORY_IDS.salary,
        merchant: 'Acme Corp',
        destinationAccountId: DEFAULT_ACCOUNT_IDS.creditCard,
      }),
    );
    expect(income.destinationAccountId).toBeNull();
    expect(income.categoryId).toBe(SYSTEM_CATEGORY_IDS.salary);
  });

  it('updates with merge semantics and revalidates', async () => {
    const created = await rules.createRule(baseInput());
    const updated = await rules.updateRule(created.id, {
      amountMinor: 49_900,
      frequency: 'weekly',
      intervalCount: 2,
    });
    expect(updated.amountMinor).toBe(49_900);
    expect(updated.frequency).toBe('weekly');
    expect(updated.intervalCount).toBe(2);
    expect(updated.merchant).toBe('Netflix'); // untouched fields survive
    expect(updated.nextDueAt).toBe(NEXT_DUE);

    await expect(
      rules.updateRule(created.id, {amountMinor: -1}),
    ).rejects.toThrow('positive integer');
    await expect(rules.updateRule('missing', {amountMinor: 1})).rejects.toThrow(
      'not found',
    );
  });

  it('clears nullable fields when patched to null', async () => {
    const created = await rules.createRule(baseInput());
    const updated = await rules.updateRule(created.id, {
      merchant: null,
      categoryId: null,
    });
    expect(updated.merchant).toBeNull();
    expect(updated.categoryId).toBeNull();
  });

  it('pauses/resumes and stamps confirmations', async () => {
    const created = await rules.createRule(baseInput());

    await rules.setRuleActive(created.id, false);
    expect((await rules.getRuleById(created.id))?.isActive).toBe(false);
    expect(await rules.listActiveRules()).toHaveLength(0);

    await rules.setRuleActive(created.id, true);
    expect((await rules.getRuleById(created.id))?.isActive).toBe(true);

    const confirmedAt = dayjs('2025-06-06T10:00:00').valueOf();
    const nextDue = dayjs('2025-07-05T09:00:00').valueOf();
    await rules.recordConfirmation(created.id, confirmedAt, nextDue);
    const confirmed = await rules.getRuleById(created.id);
    expect(confirmed?.lastConfirmedAt).toBe(confirmedAt);
    expect(confirmed?.nextDueAt).toBe(nextDue);
  });

  it('lists active rules first, soonest due first; paused sink to the bottom', async () => {
    const later = await rules.createRule(
      baseInput({merchant: 'Later', nextDueAt: dayjs('2025-06-20').valueOf()}),
    );
    const sooner = await rules.createRule(
      baseInput({merchant: 'Sooner', nextDueAt: dayjs('2025-06-01').valueOf()}),
    );
    await rules.setRuleActive(later.id, false);

    const all = await rules.listRules();
    expect(all.map(rule => rule.id)).toEqual([sooner.id, later.id]);

    const active = await rules.listActiveRules();
    expect(active.map(rule => rule.id)).toEqual([sooner.id]);
  });

  it('hard-deletes rules', async () => {
    const created = await rules.createRule(baseInput());
    await rules.deleteRule(created.id);
    expect(await rules.getRuleById(created.id)).toBeNull();
    expect(await rules.listRules()).toHaveLength(0);
  });
});
