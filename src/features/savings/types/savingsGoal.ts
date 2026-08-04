/**
 * Savings-goals domain types (migration 004: savings_goals + savings_contributions).
 *
 * Money model: a goal's money lives in a REAL user account (savingsAccountId).
 * Recording a contribution moves money into it via a real transfer transaction;
 * these tables hold the goal metadata and the per-period contribution log.
 */

export type ContributionFrequency = 'daily' | 'weekly' | 'monthly';

export type ReminderSlot = 'morning' | 'evening';

export interface SavingsGoal {
  id: string;
  name: string;
  /** Integer minor units. */
  targetMinor: number;
  /** Integer minor units; only ever advanced by recorded contributions. */
  savedMinor: number;
  currency: string;
  /** epoch ms; null = no deadline. */
  targetDate: number | null;
  /** Real account holding this goal's money (contributions transfer into it). */
  savingsAccountId: string;
  /** Optional schedule: pre-fill amount + cadence for contributions. */
  contributionAmountMinor: number | null;
  contributionFrequency: ContributionFrequency | null;
  reminderSlot: ReminderSlot | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SavingsContribution {
  id: string;
  goalId: string;
  /**
   * Bucket the contribution belongs to: 'YYYY-MM-DD' (daily), ISO 'YYYY-Www'
   * (weekly) or 'YYYY-MM' (monthly). UNIQUE(goal_id, period_key) in SQLite
   * blocks double-recording a scheduled period.
   */
  periodKey: string;
  amountMinor: number;
  /** The transfer transaction that moved the money; kept if the goal is deleted. */
  transactionId: string | null;
  createdAt: number;
}
