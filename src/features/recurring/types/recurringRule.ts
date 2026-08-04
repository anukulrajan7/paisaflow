/**
 * Domain model for recurring payment rules (migration 003).
 *
 * A rule is a TEMPLATE: confirming a due rule materializes a real transaction
 * (see services/confirmRecurringRule). Rules never affect totals directly.
 * A 'transfer' rule into a credit_card account is a credit card bill payment.
 */

export type RecurringRuleType = 'expense' | 'income' | 'transfer';

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurringRule {
  id: string;
  type: RecurringRuleType;
  /** Integer minor units, always > 0. */
  amountMinor: number;
  currency: string;
  accountId: string;
  /** Set only for transfers: the receiving account. */
  destinationAccountId: string | null;
  /** Null for transfers; optional for expense/income. */
  categoryId: string | null;
  merchant: string | null;
  note: string | null;
  paymentMethod: string | null;
  frequency: RecurringFrequency;
  /** Every N days/weeks/months/years; positive integer, default 1. */
  intervalCount: number;
  /** epoch ms of the next occurrence awaiting confirmation. */
  nextDueAt: number;
  /** epoch ms of the last confirmation; null when never confirmed. */
  lastConfirmedAt: number | null;
  /** Paused rules stay in the list but never come due. */
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}
