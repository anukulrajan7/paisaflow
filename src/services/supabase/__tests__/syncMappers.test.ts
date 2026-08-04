import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  TransactionRow,
} from '../../../database/types/rows';
import {
  accountToLocal,
  accountToRemote,
  budgetToLocal,
  budgetToRemote,
  categoryToLocal,
  categoryToRemote,
  recurringRuleToLocal,
  recurringRuleToRemote,
  shouldApplyRemote,
  transactionToLocal,
  transactionToRemote,
} from '../syncMappers';
import type {
  RecurringRuleRow,
  RemoteAccountRow,
  RemoteBudgetRow,
  RemoteRecurringRuleRow,
} from '../syncMappers';

const USER_ID = 'user-123';

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: 'acc-1',
    name: 'HDFC Savings',
    type: 'bank',
    currency: 'INR',
    opening_balance_minor: 150_000,
    is_default: 1,
    is_archived: 0,
    created_at: 1_000,
    updated_at: 2_000,
    ...overrides,
  };
}

function makeCategory(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return {
    id: 'cat-1',
    name: 'Groceries',
    type: 'expense',
    icon: 'shopping-basket',
    color: '#2E7D5B',
    is_system: 1,
    is_archived: 0,
    created_at: 1_000,
    updated_at: 2_000,
    ...overrides,
  };
}

function makeTransaction(
  overrides: Partial<TransactionRow> = {},
): TransactionRow {
  return {
    id: 'txn-1',
    type: 'expense',
    amount_minor: 45_050,
    currency: 'INR',
    account_id: 'acc-1',
    destination_account_id: null,
    category_id: 'cat-1',
    merchant: 'Big Bazaar',
    note: null,
    payment_method: 'upi',
    occurred_at: 1_500,
    created_at: 1_600,
    updated_at: 2_000,
    deleted_at: null,
    ...overrides,
  };
}

function makeBudget(overrides: Partial<BudgetRow> = {}): BudgetRow {
  return {
    id: 'bud-1',
    category_id: 'cat-1',
    limit_minor: 500_000,
    currency: 'INR',
    period_start: 10_000,
    period_end: 20_000,
    created_at: 1_000,
    updated_at: 2_000,
    ...overrides,
  };
}

function makeRecurringRule(
  overrides: Partial<RecurringRuleRow> = {},
): RecurringRuleRow {
  return {
    id: 'rule-1',
    type: 'expense',
    amount_minor: 129_900,
    currency: 'INR',
    account_id: 'acc-1',
    destination_account_id: null,
    category_id: 'cat-1',
    merchant: 'Netflix',
    note: null,
    payment_method: 'card',
    frequency: 'monthly',
    interval_count: 1,
    next_due_at: 30_000,
    last_confirmed_at: null,
    is_active: 1,
    created_at: 1_000,
    updated_at: 2_000,
    ...overrides,
  };
}

describe('syncMappers: local -> remote', () => {
  it('maps accounts, converting int flags to booleans and adding user_id', () => {
    const remote = accountToRemote(makeAccount(), USER_ID);
    expect(remote).toEqual<RemoteAccountRow>({
      id: 'acc-1',
      user_id: USER_ID,
      name: 'HDFC Savings',
      type: 'bank',
      currency: 'INR',
      opening_balance_minor: 150_000,
      is_default: true,
      is_archived: false,
      created_at: 1_000,
      updated_at: 2_000,
    });
  });

  it('maps categories with both flags set', () => {
    const remote = categoryToRemote(
      makeCategory({is_system: 1, is_archived: 1}),
      USER_ID,
    );
    expect(remote.is_system).toBe(true);
    expect(remote.is_archived).toBe(true);
    expect(remote.user_id).toBe(USER_ID);
  });

  it('maps transactions including soft deletes and money as minor units', () => {
    const remote = transactionToRemote(
      makeTransaction({deleted_at: 9_999, amount_minor: 1}),
      USER_ID,
    );
    expect(remote.deleted_at).toBe(9_999);
    expect(remote.amount_minor).toBe(1);
    expect(remote.user_id).toBe(USER_ID);
    expect(remote.note).toBeNull();
    expect(remote.destination_account_id).toBeNull();
  });

  it('maps budgets', () => {
    const remote = budgetToRemote(makeBudget({category_id: null}), USER_ID);
    expect(remote).toEqual<RemoteBudgetRow>({
      id: 'bud-1',
      user_id: USER_ID,
      category_id: null,
      limit_minor: 500_000,
      currency: 'INR',
      period_start: 10_000,
      period_end: 20_000,
      created_at: 1_000,
      updated_at: 2_000,
    });
  });

  it('maps recurring rules against the agreed remote shape', () => {
    const remote = recurringRuleToRemote(makeRecurringRule(), USER_ID);
    expect(remote).toEqual<RemoteRecurringRuleRow>({
      id: 'rule-1',
      user_id: USER_ID,
      type: 'expense',
      amount_minor: 129_900,
      currency: 'INR',
      account_id: 'acc-1',
      destination_account_id: null,
      category_id: 'cat-1',
      merchant: 'Netflix',
      note: null,
      payment_method: 'card',
      frequency: 'monthly',
      interval_count: 1,
      next_due_at: 30_000,
      last_confirmed_at: null,
      is_active: true,
      created_at: 1_000,
      updated_at: 2_000,
    });
  });
});

describe('syncMappers: remote -> local', () => {
  it('round-trips an account through both mappers', () => {
    const local = makeAccount();
    const back = accountToLocal(accountToRemote(local, USER_ID));
    expect(back).toEqual(local);
  });

  it('round-trips a category', () => {
    const local = makeCategory({is_archived: 1});
    expect(categoryToLocal(categoryToRemote(local, USER_ID))).toEqual(local);
  });

  it('round-trips a soft-deleted transaction', () => {
    const local = makeTransaction({deleted_at: 5_000, merchant: null});
    expect(transactionToLocal(transactionToRemote(local, USER_ID))).toEqual(local);
  });

  it('round-trips a budget', () => {
    const local = makeBudget();
    expect(budgetToLocal(budgetToRemote(local, USER_ID))).toEqual(local);
  });

  it('round-trips a recurring rule', () => {
    const local = makeRecurringRule({last_confirmed_at: 25_000, is_active: 0});
    expect(recurringRuleToLocal(recurringRuleToRemote(local, USER_ID))).toEqual(local);
  });

  it('strips user_id and normalises booleans to 0/1', () => {
    const remote: RemoteAccountRow = {
      id: 'acc-9',
      user_id: USER_ID,
      name: 'Wallet',
      type: 'cash',
      currency: 'INR',
      opening_balance_minor: 0,
      is_default: false,
      is_archived: true,
      created_at: 1,
      updated_at: 2,
    };
    const local = accountToLocal(remote);
    expect(local).not.toHaveProperty('user_id');
    expect(local.is_default).toBe(0);
    expect(local.is_archived).toBe(1);
  });

  it('never produces floats for money or timestamps', () => {
    const local = transactionToLocal(
      transactionToRemote(makeTransaction({amount_minor: 7, occurred_at: 42}), USER_ID),
    );
    expect(Number.isInteger(local.amount_minor)).toBe(true);
    expect(Number.isInteger(local.occurred_at)).toBe(true);
  });
});

describe('shouldApplyRemote (last-write-wins)', () => {
  it('applies when the row does not exist locally', () => {
    expect(shouldApplyRemote(null, 100)).toBe(true);
  });

  it('applies when the remote row is strictly newer', () => {
    expect(shouldApplyRemote(100, 101)).toBe(true);
  });

  it('keeps the local row when it is newer', () => {
    expect(shouldApplyRemote(200, 100)).toBe(false);
  });

  it('keeps the local row on ties (push already sent it)', () => {
    expect(shouldApplyRemote(100, 100)).toBe(false);
  });
});
