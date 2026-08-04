import {getDb} from '../../../database/connection/connection';
import type {SqlDb} from '../../../database/connection/types';
import {
  getTransactionsRepository,
  type TransactionsRepository,
} from '../../../database/repositories';
import type {Transaction} from '../../../database/types';
import type {SavingsContribution, SavingsGoal} from '../types/savingsGoal';
import {goalPeriodKey} from '../utils/savingsGoalMath';
import {
  getSavingsGoalsRepository,
  type SavingsGoalsRepository,
} from './savingsGoalsRepository';

/**
 * Thrown when a contribution already exists for the goal's current period
 * (UNIQUE(goal_id, period_key)). The UI toasts 'Already recorded for this
 * period' — exactly this message.
 */
export class DuplicateContributionError extends Error {
  constructor() {
    super('Already recorded for this period');
    this.name = 'DuplicateContributionError';
  }
}

export function isDuplicateContributionError(
  error: unknown,
): error is DuplicateContributionError {
  return (
    error instanceof DuplicateContributionError ||
    (error instanceof Error && error.name === 'DuplicateContributionError')
  );
}

export interface RecordContributionInput {
  goalId: string;
  amountMinor: number;
  /** Real account the money moves OUT of. */
  sourceAccountId: string;
  note?: string | null;
  /** epoch ms; defaults to now. */
  occurredAt?: number;
}

export interface RecordContributionResult {
  /** The real transfer: source account → the goal's savings account. */
  transaction: Transaction;
  contribution: SavingsContribution;
  /** The goal with saved_minor advanced. */
  goal: SavingsGoal;
  periodKey: string;
}

interface RecordDeps {
  db: SqlDb;
  goals: SavingsGoalsRepository;
  transactions: TransactionsRepository;
}

function defaultDeps(): RecordDeps {
  return {
    db: getDb(),
    goals: getSavingsGoalsRepository(),
    transactions: getTransactionsRepository(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Error && /unique/i.test(error.message);
}

/**
 * Records a contribution to a savings goal, atomically in ONE db transaction:
 * 1. guards the period bucket (UNIQUE(goal_id, period_key) is the DB backstop),
 * 2. creates a REAL transfer transaction from the chosen source account into
 *    the goal's savings account — a transfer, so it never counts as an expense,
 * 3. inserts the savings_contributions metadata row linked to that transfer,
 * 4. advances saved_minor by the same amount.
 *
 * Any failure rolls all of it back. The caller bumps dataVersion afterwards.
 */
export async function recordSavingsContribution(
  input: RecordContributionInput,
  deps: RecordDeps = defaultDeps(),
): Promise<RecordContributionResult> {
  const goal = await deps.goals.getGoalById(input.goalId);
  if (!goal) {
    throw new Error('Savings goal not found');
  }
  if (!goal.isActive) {
    throw new Error('Savings goal is paused');
  }
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  if (!input.sourceAccountId) {
    throw new Error('sourceAccountId is required');
  }
  if (input.sourceAccountId === goal.savingsAccountId) {
    throw new Error('Source account must differ from the savings account');
  }

  const at = input.occurredAt ?? Date.now();
  const periodKey = goalPeriodKey(goal, at);

  let transaction: Transaction | null = null;
  let contribution: SavingsContribution | null = null;
  try {
    await deps.db.transaction(async () => {
      const existing = await deps.goals.getContributionForPeriod(
        goal.id,
        periodKey,
      );
      if (existing) {
        throw new DuplicateContributionError();
      }
      transaction = await deps.transactions.createTransaction({
        type: 'transfer',
        amountMinor: input.amountMinor,
        currency: goal.currency,
        accountId: input.sourceAccountId,
        destinationAccountId: goal.savingsAccountId,
        note: input.note?.trim() || `Savings: ${goal.name}`,
        occurredAt: at,
      });
      contribution = await deps.goals.insertContribution({
        goalId: goal.id,
        periodKey,
        amountMinor: input.amountMinor,
        transactionId: transaction.id,
      });
      await deps.goals.addToSaved(goal.id, input.amountMinor);
    });
  } catch (error) {
    if (isDuplicateContributionError(error) || isUniqueViolation(error)) {
      throw new DuplicateContributionError();
    }
    throw error;
  }

  if (!transaction || !contribution) {
    throw new Error('Contribution was not recorded');
  }
  const updated = await deps.goals.getGoalById(goal.id);
  if (!updated) {
    throw new Error('Savings goal not found after contribution');
  }
  return {
    transaction,
    contribution,
    goal: updated,
    periodKey,
  };
}
