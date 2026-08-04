import type {Period} from '../../database/types';

/**
 * The ONLY data ever sent to the AI provider: pre-computed local aggregates.
 * The raw database (and notes) never leave the device.
 *
 * All money is integer minor units.
 */
export interface AiAggregatePayload {
  currency: string;
  /** ISO 8601 bounds of the analysed period [start, end). */
  period: {start: string; end: string};
  incomeMinor: number;
  expenseMinor: number;
  /** Overall (category-less) budget limit for the period, if one exists. */
  budgetMinor: number | null;
  previousPeriodExpenseMinor: number;
  /** Top expense categories, largest first. `share` is a 0..1 fraction. */
  topCategories: {name: string; amountMinor: number; share: number}[];
  dailyTotals: {date: string; incomeMinor: number; expenseMinor: number}[];
  /** Up to 5 largest expenses — amount + merchant/category only, never notes. */
  largestTransactions: {
    amountMinor: number;
    merchant: string | null;
    category: string;
  }[];
  transactionCount: number;
}

/** A cached summary together with the period it describes. */
export interface CachedInsight {
  summaryJson: string;
  model: string;
  createdAt: number;
  period: Period;
}
