import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {newId} from '../../../utils/id';
import type {
  ContributionFrequency,
  ReminderSlot,
  SavingsContribution,
  SavingsGoal,
} from '../types/savingsGoal';

/**
 * Repository for savings_goals + savings_contributions (migration 004).
 * Feature-local (mirrors features/recurring/services/recurringRulesRepository):
 * goals are metadata — recording a contribution moves real money through the
 * shared transactions repository (see services/recordSavingsContribution).
 *
 * All queries use bound parameters; every write revalidates the full row.
 */

const FREQUENCIES: ReadonlyArray<ContributionFrequency> = [
  'daily',
  'weekly',
  'monthly',
];

const REMINDER_SLOTS: ReadonlyArray<ReminderSlot> = ['morning', 'evening'];

export interface SavingsGoalInput {
  name: string;
  targetMinor: number;
  /** Amount already set aside when the goal is created; defaults to 0. */
  savedMinor?: number;
  currency: string;
  targetDate?: number | null;
  savingsAccountId: string;
  contributionAmountMinor?: number | null;
  contributionFrequency?: ContributionFrequency | null;
  reminderSlot?: ReminderSlot | null;
}

export type UpdateSavingsGoalInput = Partial<SavingsGoalInput>;

export interface SavingsContributionInput {
  goalId: string;
  periodKey: string;
  amountMinor: number;
  transactionId?: string | null;
}

interface SavingsGoalRow {
  id: string;
  name: string;
  target_minor: number;
  saved_minor: number;
  currency: string;
  target_date: number | null;
  savings_account_id: string;
  contribution_amount_minor: number | null;
  contribution_frequency: string | null;
  reminder_slot: string | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

interface SavingsContributionRow {
  id: string;
  goal_id: string;
  period_key: string;
  amount_minor: number;
  transaction_id: string | null;
  created_at: number;
}

const GOAL_COLUMNS =
  'id, name, target_minor, saved_minor, currency, target_date, savings_account_id, contribution_amount_minor, contribution_frequency, reminder_slot, is_active, created_at, updated_at';

const CONTRIBUTION_COLUMNS =
  'id, goal_id, period_key, amount_minor, transaction_id, created_at';

function mapGoalRow(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    name: row.name,
    targetMinor: row.target_minor,
    savedMinor: row.saved_minor,
    currency: row.currency,
    targetDate: row.target_date,
    savingsAccountId: row.savings_account_id,
    contributionAmountMinor: row.contribution_amount_minor,
    contributionFrequency:
      (row.contribution_frequency as ContributionFrequency | null) ?? null,
    reminderSlot: (row.reminder_slot as ReminderSlot | null) ?? null,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContributionRow(row: SavingsContributionRow): SavingsContribution {
  return {
    id: row.id,
    goalId: row.goal_id,
    periodKey: row.period_key,
    amountMinor: row.amount_minor,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
  };
}

interface NormalizedGoal {
  name: string;
  targetMinor: number;
  savedMinor: number;
  currency: string;
  targetDate: number | null;
  savingsAccountId: string;
  contributionAmountMinor: number | null;
  contributionFrequency: ContributionFrequency | null;
  reminderSlot: ReminderSlot | null;
}

/** Shared create/update validation. Pure — throws on invalid input. */
function normalizeInput(input: SavingsGoalInput): NormalizedGoal {
  const name = input.name.trim();
  if (!name) {
    throw new Error('name is required');
  }
  if (!Number.isSafeInteger(input.targetMinor) || input.targetMinor <= 0) {
    throw new Error('targetMinor must be a positive integer (minor units)');
  }
  const savedMinor = input.savedMinor ?? 0;
  if (!Number.isSafeInteger(savedMinor) || savedMinor < 0) {
    throw new Error('savedMinor must be a non-negative integer (minor units)');
  }
  if (!input.currency) {
    throw new Error('currency is required');
  }
  if (!input.savingsAccountId) {
    throw new Error('savingsAccountId is required');
  }
  const targetDate = input.targetDate ?? null;
  if (targetDate !== null && !Number.isFinite(targetDate)) {
    throw new Error('targetDate must be a valid epoch-ms timestamp');
  }
  const contributionAmountMinor = input.contributionAmountMinor ?? null;
  if (
    contributionAmountMinor !== null &&
    (!Number.isSafeInteger(contributionAmountMinor) ||
      contributionAmountMinor <= 0)
  ) {
    throw new Error(
      'contributionAmountMinor must be a positive integer (minor units)',
    );
  }
  const contributionFrequency = input.contributionFrequency ?? null;
  if (
    contributionFrequency !== null &&
    !FREQUENCIES.includes(contributionFrequency)
  ) {
    throw new Error('contributionFrequency must be daily, weekly or monthly');
  }
  const reminderSlot = input.reminderSlot ?? null;
  if (reminderSlot !== null && !REMINDER_SLOTS.includes(reminderSlot)) {
    throw new Error('reminderSlot must be morning or evening');
  }
  return {
    name,
    targetMinor: input.targetMinor,
    savedMinor,
    currency: input.currency,
    targetDate,
    savingsAccountId: input.savingsAccountId,
    contributionAmountMinor,
    contributionFrequency,
    reminderSlot,
  };
}

export function createSavingsGoalsRepository(db: SqlDb) {
  async function getGoalById(id: string): Promise<SavingsGoal | null> {
    const row = await queryFirst<SavingsGoalRow>(
      db,
      `SELECT ${GOAL_COLUMNS} FROM savings_goals WHERE id = ?`,
      [id],
    );
    return row ? mapGoalRow(row) : null;
  }

  async function getContributionById(
    id: string,
  ): Promise<SavingsContribution | null> {
    const row = await queryFirst<SavingsContributionRow>(
      db,
      `SELECT ${CONTRIBUTION_COLUMNS} FROM savings_contributions WHERE id = ?`,
      [id],
    );
    return row ? mapContributionRow(row) : null;
  }

  return {
    async createGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
      const goal = normalizeInput(input);
      const id = newId();
      const now = Date.now();
      await db.executeAsync(
        `INSERT INTO savings_goals
          (id, name, target_minor, saved_minor, currency, target_date,
           savings_account_id, contribution_amount_minor, contribution_frequency,
           reminder_slot, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          goal.name,
          goal.targetMinor,
          goal.savedMinor,
          goal.currency,
          goal.targetDate,
          goal.savingsAccountId,
          goal.contributionAmountMinor,
          goal.contributionFrequency,
          goal.reminderSlot,
          1,
          now,
          now,
        ],
      );
      const created = await getGoalById(id);
      if (!created) {
        throw new Error(`Savings goal not found after create: ${id}`);
      }
      return created;
    },

    async updateGoal(
      id: string,
      patch: UpdateSavingsGoalInput,
    ): Promise<SavingsGoal> {
      const existing = await getGoalById(id);
      if (!existing) {
        throw new Error(`Savings goal not found: ${id}`);
      }
      // savedMinor only moves via contributions; it is not patchable.
      const goal = normalizeInput({
        name: patch.name ?? existing.name,
        targetMinor: patch.targetMinor ?? existing.targetMinor,
        savedMinor: existing.savedMinor,
        currency: patch.currency ?? existing.currency,
        targetDate:
          patch.targetDate !== undefined ? patch.targetDate : existing.targetDate,
        savingsAccountId: patch.savingsAccountId ?? existing.savingsAccountId,
        contributionAmountMinor:
          patch.contributionAmountMinor !== undefined
            ? patch.contributionAmountMinor
            : existing.contributionAmountMinor,
        contributionFrequency:
          patch.contributionFrequency !== undefined
            ? patch.contributionFrequency
            : existing.contributionFrequency,
        reminderSlot:
          patch.reminderSlot !== undefined
            ? patch.reminderSlot
            : existing.reminderSlot,
      });
      await db.executeAsync(
        `UPDATE savings_goals SET
          name = ?, target_minor = ?, currency = ?, target_date = ?,
          savings_account_id = ?, contribution_amount_minor = ?,
          contribution_frequency = ?, reminder_slot = ?, updated_at = ?
         WHERE id = ?`,
        [
          goal.name,
          goal.targetMinor,
          goal.currency,
          goal.targetDate,
          goal.savingsAccountId,
          goal.contributionAmountMinor,
          goal.contributionFrequency,
          goal.reminderSlot,
          Date.now(),
          id,
        ],
      );
      const updated = await getGoalById(id);
      if (!updated) {
        throw new Error(`Savings goal not found after update: ${id}`);
      }
      return updated;
    },

    /** Pause/resume. Paused goals keep their data but accept no contributions. */
    async setGoalActive(id: string, isActive: boolean): Promise<void> {
      await db.executeAsync(
        'UPDATE savings_goals SET is_active = ?, updated_at = ? WHERE id = ?',
        [isActive ? 1 : 0, Date.now(), id],
      );
    },

    /**
     * Hard delete. Contribution rows go with the goal (FK), but the linked
     * transfer transactions are deliberately left untouched — the money
     * already moved stays moved.
     */
    async deleteGoal(id: string): Promise<void> {
      await db.transaction(async tx => {
        await tx.executeAsync(
          'DELETE FROM savings_contributions WHERE goal_id = ?',
          [id],
        );
        await tx.executeAsync('DELETE FROM savings_goals WHERE id = ?', [id]);
      });
    },

    getGoalById,

    /** All goals: active first, then oldest created. */
    async listGoals(): Promise<SavingsGoal[]> {
      const rows = await queryRows<SavingsGoalRow>(
        db,
        `SELECT ${GOAL_COLUMNS} FROM savings_goals
         ORDER BY is_active DESC, created_at ASC`,
      );
      return rows.map(mapGoalRow);
    },

    /** Contribution history for a goal, newest first. */
    async listContributions(goalId: string): Promise<SavingsContribution[]> {
      const rows = await queryRows<SavingsContributionRow>(
        db,
        `SELECT ${CONTRIBUTION_COLUMNS} FROM savings_contributions
         WHERE goal_id = ?
         ORDER BY created_at DESC`,
        [goalId],
      );
      return rows.map(mapContributionRow);
    },

    /** The contribution already recorded for a (goal, period), if any. */
    async getContributionForPeriod(
      goalId: string,
      periodKey: string,
    ): Promise<SavingsContribution | null> {
      const row = await queryFirst<SavingsContributionRow>(
        db,
        `SELECT ${CONTRIBUTION_COLUMNS} FROM savings_contributions
         WHERE goal_id = ? AND period_key = ?`,
        [goalId, periodKey],
      );
      return row ? mapContributionRow(row) : null;
    },

    /**
     * Contributions across all goals whose period_key is one of the given
     * keys — one query for the list screen's "recorded this period" flags.
     */
    async listContributionsForPeriods(
      periodKeys: ReadonlyArray<string>,
    ): Promise<SavingsContribution[]> {
      if (periodKeys.length === 0) {
        return [];
      }
      const placeholders = periodKeys.map(() => '?').join(', ');
      const rows = await queryRows<SavingsContributionRow>(
        db,
        `SELECT ${CONTRIBUTION_COLUMNS} FROM savings_contributions
         WHERE period_key IN (${placeholders})`,
        [...periodKeys],
      );
      return rows.map(mapContributionRow);
    },

    /**
     * Inserts the contribution log row. UNIQUE(goal_id, period_key) throws on
     * a duplicate period — callers map that to a friendly message.
     */
    async insertContribution(
      input: SavingsContributionInput,
    ): Promise<SavingsContribution> {
      if (!input.goalId) {
        throw new Error('goalId is required');
      }
      if (!input.periodKey) {
        throw new Error('periodKey is required');
      }
      if (
        !Number.isSafeInteger(input.amountMinor) ||
        input.amountMinor <= 0
      ) {
        throw new Error('amountMinor must be a positive integer (minor units)');
      }
      const id = newId();
      await db.executeAsync(
        `INSERT INTO savings_contributions
          (id, goal_id, period_key, amount_minor, transaction_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          id,
          input.goalId,
          input.periodKey,
          input.amountMinor,
          input.transactionId ?? null,
          Date.now(),
        ],
      );
      const created = await getContributionById(id);
      if (!created) {
        throw new Error(`Savings contribution not found after create: ${id}`);
      }
      return created;
    },

    /** Advances saved_minor; only called with a matching contribution insert. */
    async addToSaved(id: string, amountMinor: number): Promise<void> {
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
        throw new Error('amountMinor must be a positive integer (minor units)');
      }
      const existing = await getGoalById(id);
      if (!existing) {
        throw new Error(`Savings goal not found: ${id}`);
      }
      await db.executeAsync(
        'UPDATE savings_goals SET saved_minor = ?, updated_at = ? WHERE id = ?',
        [existing.savedMinor + amountMinor, Date.now(), id],
      );
    },
  };
}

export type SavingsGoalsRepository = ReturnType<
  typeof createSavingsGoalsRepository
>;

let instance: SavingsGoalsRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getSavingsGoalsRepository(): SavingsGoalsRepository {
  if (!instance) {
    instance = createSavingsGoalsRepository(getDb());
  }
  return instance;
}
