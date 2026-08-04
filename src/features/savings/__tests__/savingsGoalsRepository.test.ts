import {MIGRATIONS, runMigrations} from '../../../database/migrations';
import {DEFAULT_ACCOUNT_IDS, seedDefaultData} from '../../../database/seeds';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {createTransactionsRepository} from '../../../database/repositories';
import {dayjs} from '../../../utils/date';
import {
  createSavingsGoalsRepository,
  type SavingsGoalInput,
  type SavingsGoalsRepository,
} from '../services/savingsGoalsRepository';

const TARGET_DATE = dayjs('2026-06-30T00:00:00').valueOf();

function baseInput(
  overrides: Partial<SavingsGoalInput> = {},
): SavingsGoalInput {
  return {
    name: 'Emergency fund',
    targetMinor: 500_000,
    currency: 'INR',
    savingsAccountId: DEFAULT_ACCOUNT_IDS.bank,
    ...overrides,
  };
}

describe('SavingsGoalsRepository', () => {
  let db: FakeDb;
  let goals: SavingsGoalsRepository;

  beforeEach(async () => {
    db = createFakeDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);
    goals = createSavingsGoalsRepository(db);
  });

  it('creates a goal with defaults and reads it back', async () => {
    const created = await goals.createGoal(baseInput());
    expect(created.id).toBeTruthy();
    expect(created.savedMinor).toBe(0);
    expect(created.isActive).toBe(true);
    expect(created.targetDate).toBeNull();
    expect(created.contributionAmountMinor).toBeNull();
    expect(created.contributionFrequency).toBeNull();
    expect(created.reminderSlot).toBeNull();

    const fetched = await goals.getGoalById(created.id);
    expect(fetched).toEqual(created);
  });

  it('creates a fully specified goal', async () => {
    const created = await goals.createGoal(
      baseInput({
        savedMinor: 50_000,
        targetDate: TARGET_DATE,
        contributionAmountMinor: 10_000,
        contributionFrequency: 'monthly',
        reminderSlot: 'evening',
      }),
    );
    expect(created.savedMinor).toBe(50_000);
    expect(created.targetDate).toBe(TARGET_DATE);
    expect(created.contributionAmountMinor).toBe(10_000);
    expect(created.contributionFrequency).toBe('monthly');
    expect(created.reminderSlot).toBe('evening');
  });

  it('validates name, target, saved, account, amounts and enums', async () => {
    await expect(goals.createGoal(baseInput({name: '  '}))).rejects.toThrow(
      'name',
    );
    await expect(goals.createGoal(baseInput({targetMinor: 0}))).rejects.toThrow(
      'positive integer',
    );
    await expect(
      goals.createGoal(baseInput({targetMinor: 10.5})),
    ).rejects.toThrow('positive integer');
    await expect(goals.createGoal(baseInput({savedMinor: -1}))).rejects.toThrow(
      'non-negative',
    );
    await expect(goals.createGoal(baseInput({currency: ''}))).rejects.toThrow(
      'currency',
    );
    await expect(
      goals.createGoal(baseInput({savingsAccountId: ''})),
    ).rejects.toThrow('savingsAccountId');
    await expect(
      goals.createGoal(baseInput({targetDate: Number.NaN})),
    ).rejects.toThrow('targetDate');
    await expect(
      goals.createGoal(baseInput({contributionAmountMinor: -100})),
    ).rejects.toThrow('contributionAmountMinor');
    await expect(
      goals.createGoal(baseInput({contributionFrequency: 'hourly' as never})),
    ).rejects.toThrow('contributionFrequency');
    await expect(
      goals.createGoal(baseInput({reminderSlot: 'noon' as never})),
    ).rejects.toThrow('reminderSlot');
  });

  it('updates with merge semantics and never patches savedMinor', async () => {
    const created = await goals.createGoal(
      baseInput({savedMinor: 5_000, contributionFrequency: 'weekly'}),
    );
    const updated = await goals.updateGoal(created.id, {
      name: 'Renamed',
      targetMinor: 600_000,
      contributionFrequency: null,
      savedMinor: 999_999, // ignored: saved only moves via contributions
    });
    expect(updated.name).toBe('Renamed');
    expect(updated.targetMinor).toBe(600_000);
    expect(updated.contributionFrequency).toBeNull();
    expect(updated.savedMinor).toBe(5_000);

    await expect(goals.updateGoal('missing', {name: 'x'})).rejects.toThrow(
      'not found',
    );
    await expect(
      goals.updateGoal(created.id, {targetMinor: -1}),
    ).rejects.toThrow('positive integer');
  });

  it('pauses and resumes', async () => {
    const created = await goals.createGoal(baseInput());
    await goals.setGoalActive(created.id, false);
    expect((await goals.getGoalById(created.id))?.isActive).toBe(false);
    await goals.setGoalActive(created.id, true);
    expect((await goals.getGoalById(created.id))?.isActive).toBe(true);
  });

  it('lists active goals first, oldest created first', async () => {
    const first = await goals.createGoal(baseInput({name: 'First'}));
    const second = await goals.createGoal(baseInput({name: 'Second'}));
    await goals.setGoalActive(first.id, false);

    const all = await goals.listGoals();
    expect(all.map(goal => goal.id)).toEqual([second.id, first.id]);
  });

  it('inserts contributions and finds them by period', async () => {
    const goal = await goals.createGoal(
      baseInput({contributionFrequency: 'monthly'}),
    );
    const contribution = await goals.insertContribution({
      goalId: goal.id,
      periodKey: '2025-08',
      amountMinor: 10_000,
      transactionId: null,
    });
    expect(contribution.id).toBeTruthy();

    expect(
      await goals.getContributionForPeriod(goal.id, '2025-08'),
    ).toEqual(contribution);
    expect(await goals.getContributionForPeriod(goal.id, '2025-09')).toBeNull();

    const history = await goals.listContributions(goal.id);
    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(contribution);
  });

  it('validates contribution inserts', async () => {
    const goal = await goals.createGoal(baseInput());
    await expect(
      goals.insertContribution({goalId: goal.id, periodKey: '', amountMinor: 1}),
    ).rejects.toThrow('periodKey');
    await expect(
      goals.insertContribution({
        goalId: goal.id,
        periodKey: '2025-08',
        amountMinor: 0,
      }),
    ).rejects.toThrow('positive integer');
  });

  it('lists contributions across goals for given period keys', async () => {
    const a = await goals.createGoal(baseInput({name: 'A'}));
    const b = await goals.createGoal(baseInput({name: 'B'}));
    await goals.insertContribution({
      goalId: a.id,
      periodKey: '2025-08',
      amountMinor: 1_000,
    });
    await goals.insertContribution({
      goalId: b.id,
      periodKey: '2025-W32',
      amountMinor: 2_000,
    });
    await goals.insertContribution({
      goalId: b.id,
      periodKey: '2025-W31',
      amountMinor: 3_000,
    });

    const rows = await goals.listContributionsForPeriods(['2025-08', '2025-W32']);
    expect(rows.map(row => row.periodKey).sort()).toEqual(['2025-08', '2025-W32']);
    expect(await goals.listContributionsForPeriods([])).toEqual([]);
  });

  it('addToSaved advances saved_minor', async () => {
    const goal = await goals.createGoal(baseInput({savedMinor: 1_000}));
    await goals.addToSaved(goal.id, 2_500);
    expect((await goals.getGoalById(goal.id))?.savedMinor).toBe(3_500);
    await expect(goals.addToSaved(goal.id, 0)).rejects.toThrow(
      'positive integer',
    );
    await expect(goals.addToSaved('missing', 1)).rejects.toThrow('not found');
  });

  it('deletes the goal and its contributions but keeps linked transfers', async () => {
    const transactions = createTransactionsRepository(db);
    const goal = await goals.createGoal(baseInput());
    const transfer = await transactions.createTransaction({
      type: 'transfer',
      amountMinor: 10_000,
      currency: 'INR',
      accountId: DEFAULT_ACCOUNT_IDS.cash,
      destinationAccountId: DEFAULT_ACCOUNT_IDS.bank,
      occurredAt: Date.now(),
    });
    await goals.insertContribution({
      goalId: goal.id,
      periodKey: '2025-08',
      amountMinor: 10_000,
      transactionId: transfer.id,
    });

    await goals.deleteGoal(goal.id);

    expect(await goals.getGoalById(goal.id)).toBeNull();
    expect(await goals.listContributions(goal.id)).toEqual([]);
    // The money movement is NOT deleted with the goal.
    expect(await transactions.getTransactionById(transfer.id)).not.toBeNull();
  });
});
