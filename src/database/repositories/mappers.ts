import type {
  Account,
  AccountType,
  AiPeriodType,
  AiSummary,
  Budget,
  Category,
  CategoryType,
  Transaction,
  TransactionType,
} from '../types';
import type {
  AccountRow,
  AiSummaryRow,
  BudgetRow,
  CategoryRow,
  TransactionRow,
} from '../types/rows';

/** Row (snake_case) → domain model (camelCase) mappers. */

export function mapAccountRow(row: AccountRow): Account {
  return {
    id: row.id,
    name: row.name,
    type: row.type as AccountType,
    currency: row.currency,
    openingBalanceMinor: row.opening_balance_minor,
    isDefault: row.is_default === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapCategoryRow(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    type: row.type as CategoryType,
    icon: row.icon,
    color: row.color,
    isSystem: row.is_system === 1,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTransactionRow(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type as TransactionType,
    amountMinor: row.amount_minor,
    currency: row.currency,
    accountId: row.account_id,
    destinationAccountId: row.destination_account_id,
    categoryId: row.category_id,
    merchant: row.merchant,
    note: row.note,
    paymentMethod: row.payment_method,
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export function mapBudgetRow(row: BudgetRow): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    limitMinor: row.limit_minor,
    currency: row.currency,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapAiSummaryRow(row: AiSummaryRow): AiSummary {
  return {
    id: row.id,
    periodType: row.period_type as AiPeriodType,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    inputHash: row.input_hash,
    model: row.model,
    summaryJson: row.summary_json,
    createdAt: row.created_at,
  };
}

/**
 * Escape LIKE wildcards in user input so searches match literally.
 * Pair with `ESCAPE '\'` in the SQL statement.
 */
export function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, ch => `\\${ch}`);
}

/** Build a parenthesized `?, ?, …` placeholder list for IN clauses. */
export function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}
