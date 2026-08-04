/**
 * Domain model types for the PaisaFlow database layer.
 *
 * Conventions:
 * - Money is ALWAYS integer minor units (`*Minor`). Never floats.
 * - Timestamps are epoch milliseconds (`*At`, `periodStart`/`periodEnd`).
 * - Ids are strings (UUIDs for user data, stable slugs for seeded rows).
 * - Periods are [start, end) — start inclusive, end exclusive.
 */

export type TransactionType = 'expense' | 'income' | 'transfer';

export type AccountType = 'cash' | 'bank' | 'credit_card' | 'upi_wallet';

export type CategoryType = 'expense' | 'income';

export type AiPeriodType = 'daily' | 'weekly' | 'monthly';

/** Half-open time range [start, end), epoch ms. */
export interface Period {
  /** epoch ms, inclusive */
  start: number;
  /** epoch ms, exclusive */
  end: number;
}

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  openingBalanceMinor: number;
  isDefault: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  /** lucide icon name, e.g. 'UtensilsCrossed'. */
  icon: string;
  /** Hex color from CATEGORY_COLORS (design-system tokens). */
  color: string;
  isSystem: boolean;
  isArchived: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Transaction {
  id: string;
  type: TransactionType;
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
  occurredAt: number;
  createdAt: number;
  updatedAt: number;
  /** Soft delete marker; null when active. */
  deletedAt: number | null;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: number;
}

export interface Budget {
  id: string;
  /** Null = overall budget (all expense categories). */
  categoryId: string | null;
  limitMinor: number;
  currency: string;
  periodStart: number;
  periodEnd: number;
  createdAt: number;
  updatedAt: number;
}

export interface AiSummary {
  id: string;
  periodType: AiPeriodType;
  periodStart: number;
  periodEnd: number;
  /** Hash of the aggregate input payload; used for cache hits. */
  inputHash: string;
  model: string;
  summaryJson: string;
  createdAt: number;
}

export interface SettingEntry {
  key: string;
  value: string;
  updatedAt: number;
}

/** Aggregates for a period, EXCLUDING transfers and soft-deleted rows. */
export interface PeriodTotals {
  incomeMinor: number;
  expenseMinor: number;
  /** Number of income + expense transactions in the period. */
  count: number;
}

/** Per-day aggregates, EXCLUDING transfers and soft-deleted rows. */
export interface DailyTotal {
  /** epoch ms at local start of day. */
  dayStart: number;
  incomeMinor: number;
  expenseMinor: number;
}

export interface CategoryTotal {
  /** Null for transactions without a category ('Uncategorized'). */
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  totalMinor: number;
  count: number;
}

export interface BudgetUsage {
  budget: Budget;
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  /** spent / limit; can exceed 1 when over budget. */
  usedFraction: number;
}
