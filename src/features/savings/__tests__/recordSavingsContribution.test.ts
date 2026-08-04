import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {
  createAccountsRepository,
  createTransactionsRepository,
} from '../../../database/repositories';
import type {
  AccountsRepository,
  TransactionsRepository,
} from '../../../database/repositories';
import {monthPeriod, dayjs} from '../../../utils/date';
import {
  DuplicateContributionError,
  recordSavingsContribution,
} from '../services/recordSavingsContribution';
import {
  createSavingsGoalsRepository,
  type SavingsGoalsRepository,
} from '../services/savingsGoalsRepository';
import type {SavingsGoal} from '../types/savingsGoal';

const NOW = dayjs('2025-08-10T12:00:00').valueOf();

describe('recordSavingsContribution', () => {
  let db: FakeDb;
  let goals: SavingsGoalsRepository;
  let transactions: TransactionsRepository;
  let accounts: AccountsRepository;
  let goal: SavingsGoal;

  function deps() {
    return {db, goals, transactions};
  }

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    goals = createSavingsGoalsRepository(db);
    transactions = createTransactionsRepository(db);
    accounts = createAccountsRepository(db);

    // Fund the source account so balance math is easy to read.
    await transactions.createTransaction({
      type: 'income',
      amountMinor: 100_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.bank,
      occurredAt: NOW,
    });
    goal = await goals.createGoal({
      name: 'Emergency fund',
      targetMinor: 500_000,
      currency: 'INR',
      savingsAccountId: DEFAULT_ACCOUNT_IDS.cash,
      contributionAmountMinor: 25_000,
      contributionFrequency: 'monthly',
    });
  });

  it('moves money: transfer out of source, into savings account, saved_minor up', async () => {
    const result = await recordSavingsContribution(
      {
        goalId: goal.id,
        amountMinor: 25_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: NOW,
      },
      deps(),
    );

    // A real transfer transaction, not an expense.
    expect(result.transaction.type).toBe('transfer');
    expect(result.transaction.accountId).toBe(DEFAULT_ACCOUNT_IDS.bank);
    expect(result.transaction.destinationAccountId).toBe(
      DEFAULT_ACCOUNT_IDS.cash,
    );
    expect(result.transaction.amountMinor).toBe(25_000);

    // Metadata row links the transfer and the monthly period key.
    expect(result.contribution.transactionId).toBe(result.transaction.id);
    expect(result.periodKey).toBe('2025-08');

    // saved_minor advanced exactly once.
    expect(result.goal.savedMinor).toBe(25_000);

    // Balances reflect the move.
    expect(await accounts.getAccountBalance(DEFAULT_ACCOUNT_IDS.bank)).toBe(
      75_000,
    );
    expect(await accounts.getAccountBalance(DEFAULT_ACCOUNT_IDS.cash)).toBe(
      25_000,
    );
  });

  it('is a transfer, so income/expense reports are unaffected', async () => {
    await recordSavingsContribution(
      {
        goalId: goal.id,
        amountMinor: 25_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: NOW,
      },
      deps(),
    );
    const totals = await transactions.getMonthlyTotals(
      monthPeriod(dayjs(NOW)),
    );
    // Only the seeding income counts; the contribution transfer is excluded.
    expect(totals).toEqual({
      incomeMinor: 100_000,
      expenseMinor: 0,
      count: 1,
    });
  });

  it('uses the goal currency and a default note naming the goal', async () => {
    const result = await recordSavingsContribution(
      {
        goalId: goal.id,
        amountMinor: 25_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: NOW,
      },
      deps(),
    );
    expect(result.transaction.currency).toBe('INR');
    expect(result.transaction.note).toBe('Savings: Emergency fund');
  });

  it('blocks a second contribution in the same period and writes nothing', async () => {
    const input = {
      goalId: goal.id,
      amountMinor: 25_000,
      sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
      occurredAt: NOW,
    };
    await recordSavingsContribution(input, deps());

    await expect(recordSavingsContribution(input, deps())).rejects.toThrow(
      'Already recorded for this period',
    );
    await expect(recordSavingsContribution(input, deps())).rejects.toBeInstanceOf(
      DuplicateContributionError,
    );

    // All-or-nothing: still exactly one transfer, one row, one advance.
    expect(await goals.listContributions(goal.id)).toHaveLength(1);
    expect((await goals.getGoalById(goal.id))?.savedMinor).toBe(25_000);
    expect(await accounts.getAccountBalance(DEFAULT_ACCOUNT_IDS.bank)).toBe(
      75_000,
    );
    const transfers = await transactions.listTransactions({type: 'transfer'});
    expect(transfers).toHaveLength(1);
  });

  it('allows the next period and buckets weekly goals by ISO week', async () => {
    const weeklyGoal = await goals.createGoal({
      name: 'Bike',
      targetMinor: 200_000,
      currency: 'INR',
      savingsAccountId: DEFAULT_ACCOUNT_IDS.cash,
      contributionFrequency: 'weekly',
    });
    // Monday 4 Aug and Wednesday 6 Aug 2025 share ISO week 2025-W32.
    const first = await recordSavingsContribution(
      {
        goalId: weeklyGoal.id,
        amountMinor: 5_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: dayjs('2025-08-04T09:00:00').valueOf(),
      },
      deps(),
    );
    expect(first.periodKey).toBe('2025-W32');
    await expect(
      recordSavingsContribution(
        {
          goalId: weeklyGoal.id,
          amountMinor: 5_000,
          sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
          occurredAt: dayjs('2025-08-06T09:00:00').valueOf(),
        },
        deps(),
      ),
    ).rejects.toThrow('Already recorded for this period');

    // Next ISO week works.
    const second = await recordSavingsContribution(
      {
        goalId: weeklyGoal.id,
        amountMinor: 5_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: dayjs('2025-08-11T09:00:00').valueOf(),
      },
      deps(),
    );
    expect(second.periodKey).toBe('2025-W33');
    expect(second.goal.savedMinor).toBe(10_000);
  });

  it('buckets unscheduled goals by day', async () => {
    const looseGoal = await goals.createGoal({
      name: 'Rainy day',
      targetMinor: 50_000,
      currency: 'INR',
      savingsAccountId: DEFAULT_ACCOUNT_IDS.cash,
    });
    const input = {
      goalId: looseGoal.id,
      amountMinor: 1_000,
      sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
    };
    const first = await recordSavingsContribution(
      {...input, occurredAt: NOW},
      deps(),
    );
    expect(first.periodKey).toBe('2025-08-10');
    await expect(
      recordSavingsContribution({...input, occurredAt: NOW}, deps()),
    ).rejects.toThrow('Already recorded for this period');
    const nextDay = await recordSavingsContribution(
      {...input, occurredAt: dayjs('2025-08-11T08:00:00').valueOf()},
      deps(),
    );
    expect(nextDay.periodKey).toBe('2025-08-11');
  });

  it('rejects invalid input before writing anything', async () => {
    await expect(
      recordSavingsContribution(
        {goalId: 'missing', amountMinor: 100, sourceAccountId: 'x'},
        deps(),
      ),
    ).rejects.toThrow('not found');
    await expect(
      recordSavingsContribution(
        {
          goalId: goal.id,
          amountMinor: 0,
          sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        },
        deps(),
      ),
    ).rejects.toThrow('positive integer');
    await expect(
      recordSavingsContribution(
        {
          goalId: goal.id,
          amountMinor: 10.5,
          sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        },
        deps(),
      ),
    ).rejects.toThrow('positive integer');
    await expect(
      recordSavingsContribution(
        {goalId: goal.id, amountMinor: 100, sourceAccountId: ''},
        deps(),
      ),
    ).rejects.toThrow('sourceAccountId');
    // Source must differ from the goal's own savings account.
    await expect(
      recordSavingsContribution(
        {
          goalId: goal.id,
          amountMinor: 100,
          sourceAccountId: DEFAULT_ACCOUNT_IDS.cash,
        },
        deps(),
      ),
    ).rejects.toThrow('differ from the savings account');

    expect(await goals.listContributions(goal.id)).toHaveLength(0);
    expect((await goals.getGoalById(goal.id))?.savedMinor).toBe(0);
  });

  it('refuses contributions to a paused goal', async () => {
    await goals.setGoalActive(goal.id, false);
    await expect(
      recordSavingsContribution(
        {
          goalId: goal.id,
          amountMinor: 100,
          sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        },
        deps(),
      ),
    ).rejects.toThrow('paused');
    expect(await goals.listContributions(goal.id)).toHaveLength(0);
  });

  it('completes the goal when saved reaches the target', async () => {
    const small = await goals.createGoal({
      name: 'Small',
      targetMinor: 10_000,
      currency: 'INR',
      savingsAccountId: DEFAULT_ACCOUNT_IDS.cash,
      savedMinor: 6_000,
    });
    const result = await recordSavingsContribution(
      {
        goalId: small.id,
        amountMinor: 4_000,
        sourceAccountId: DEFAULT_ACCOUNT_IDS.bank,
        occurredAt: NOW,
      },
      deps(),
    );
    expect(result.goal.savedMinor).toBe(10_000);
    expect(result.goal.savedMinor).toBeGreaterThanOrEqual(
      result.goal.targetMinor,
    );
  });
});
