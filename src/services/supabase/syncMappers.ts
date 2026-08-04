/**
 * Pure mapping between local SQLite rows (snake_case, INTEGER booleans,
 * epoch-ms timestamps — see src/database/types/rows.ts) and remote Supabase
 * rows (same snake_case names, real booleans, plus `user_id`).
 *
 * Money stays integer minor units end to end; timestamps stay epoch ms
 * (bigint remotely). Remote tables mirror the local schema 1:1, so mapping
 * is field-by-field with only boolean and nullability normalisation.
 *
 * These functions are pure and unit-tested without any database or network.
 */
import type {
  AccountRow,
  BudgetRow,
  CategoryRow,
  TransactionRow,
} from '../../database/types/rows';

/**
 * Local row shape for recurring_rules. The table + migration are owned by
 * the recurring feature; sync maps against this structural contract and
 * skips the table gracefully when it does not exist locally yet.
 */
export interface RecurringRuleRow {
  id: string;
  type: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  frequency: string;
  interval_count: number;
  next_due_at: number;
  last_confirmed_at: number | null;
  is_active: number;
  created_at: number;
  updated_at: number;
}

// ---------------------------------------------------------------------------
// Remote row shapes (mirror supabase/schema.sql; every table has user_id).
// ---------------------------------------------------------------------------

// These are `type` aliases (not interfaces) so they keep an implicit index
// signature — the sync engine erases them to Record<string, unknown>.
export type RemoteAccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  currency: string;
  opening_balance_minor: number;
  is_default: boolean;
  is_archived: boolean;
  created_at: number;
  updated_at: number;
};

export type RemoteCategoryRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  is_system: boolean;
  is_archived: boolean;
  created_at: number;
  updated_at: number;
};

export type RemoteTransactionRow = {
  id: string;
  user_id: string;
  type: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  occurred_at: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type RemoteBudgetRow = {
  id: string;
  user_id: string;
  category_id: string | null;
  limit_minor: number;
  currency: string;
  period_start: number;
  period_end: number;
  created_at: number;
  updated_at: number;
};

export type RemoteRecurringRuleRow = {
  id: string;
  user_id: string;
  type: string;
  amount_minor: number;
  currency: string;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  merchant: string | null;
  note: string | null;
  payment_method: string | null;
  frequency: string;
  interval_count: number;
  next_due_at: number;
  last_confirmed_at: number | null;
  is_active: boolean;
  created_at: number;
  updated_at: number;
};

// ---------------------------------------------------------------------------
// Local -> remote
// ---------------------------------------------------------------------------

export function accountToRemote(row: AccountRow, userId: string): RemoteAccountRow {
  return {
    id: row.id,
    user_id: userId,
    name: row.name,
    type: row.type,
    currency: row.currency,
    opening_balance_minor: row.opening_balance_minor,
    is_default: row.is_default !== 0,
    is_archived: row.is_archived !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function categoryToRemote(row: CategoryRow, userId: string): RemoteCategoryRow {
  return {
    id: row.id,
    user_id: userId,
    name: row.name,
    type: row.type,
    icon: row.icon,
    color: row.color,
    is_system: row.is_system !== 0,
    is_archived: row.is_archived !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function transactionToRemote(
  row: TransactionRow,
  userId: string,
): RemoteTransactionRow {
  return {
    id: row.id,
    user_id: userId,
    type: row.type,
    amount_minor: row.amount_minor,
    currency: row.currency,
    account_id: row.account_id,
    destination_account_id: row.destination_account_id ?? null,
    category_id: row.category_id ?? null,
    merchant: row.merchant ?? null,
    note: row.note ?? null,
    payment_method: row.payment_method ?? null,
    occurred_at: row.occurred_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at ?? null,
  };
}

export function budgetToRemote(row: BudgetRow, userId: string): RemoteBudgetRow {
  return {
    id: row.id,
    user_id: userId,
    category_id: row.category_id ?? null,
    limit_minor: row.limit_minor,
    currency: row.currency,
    period_start: row.period_start,
    period_end: row.period_end,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function recurringRuleToRemote(
  row: RecurringRuleRow,
  userId: string,
): RemoteRecurringRuleRow {
  return {
    id: row.id,
    user_id: userId,
    type: row.type,
    amount_minor: row.amount_minor,
    currency: row.currency,
    account_id: row.account_id,
    destination_account_id: row.destination_account_id ?? null,
    category_id: row.category_id ?? null,
    merchant: row.merchant ?? null,
    note: row.note ?? null,
    payment_method: row.payment_method ?? null,
    frequency: row.frequency,
    interval_count: row.interval_count,
    next_due_at: row.next_due_at,
    last_confirmed_at: row.last_confirmed_at ?? null,
    is_active: row.is_active !== 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Remote -> local
// ---------------------------------------------------------------------------

/** Normalise a remote boolean (PostgREST may hand back true/false or 0/1). */
function toIntFlag(value: unknown): number {
  return value === true || value === 1 ? 1 : 0;
}

/** Normalise a remote value to number | null for nullable columns. */
function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function toString_(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function accountToLocal(remote: RemoteAccountRow): AccountRow {
  return {
    id: toString_(remote.id),
    name: toString_(remote.name),
    type: toString_(remote.type),
    currency: toString_(remote.currency),
    opening_balance_minor: toNumber(remote.opening_balance_minor),
    is_default: toIntFlag(remote.is_default),
    is_archived: toIntFlag(remote.is_archived),
    created_at: toNumber(remote.created_at),
    updated_at: toNumber(remote.updated_at),
  };
}

export function categoryToLocal(remote: RemoteCategoryRow): CategoryRow {
  return {
    id: toString_(remote.id),
    name: toString_(remote.name),
    type: toString_(remote.type),
    icon: toString_(remote.icon),
    color: toString_(remote.color),
    is_system: toIntFlag(remote.is_system),
    is_archived: toIntFlag(remote.is_archived),
    created_at: toNumber(remote.created_at),
    updated_at: toNumber(remote.updated_at),
  };
}

export function transactionToLocal(remote: RemoteTransactionRow): TransactionRow {
  return {
    id: toString_(remote.id),
    type: toString_(remote.type),
    amount_minor: toNumber(remote.amount_minor),
    currency: toString_(remote.currency),
    account_id: toString_(remote.account_id),
    destination_account_id: toNullableString(remote.destination_account_id),
    category_id: toNullableString(remote.category_id),
    merchant: toNullableString(remote.merchant),
    note: toNullableString(remote.note),
    payment_method: toNullableString(remote.payment_method),
    occurred_at: toNumber(remote.occurred_at),
    created_at: toNumber(remote.created_at),
    updated_at: toNumber(remote.updated_at),
    deleted_at: toNullableNumber(remote.deleted_at),
  };
}

export function budgetToLocal(remote: RemoteBudgetRow): BudgetRow {
  return {
    id: toString_(remote.id),
    category_id: toNullableString(remote.category_id),
    limit_minor: toNumber(remote.limit_minor),
    currency: toString_(remote.currency),
    period_start: toNumber(remote.period_start),
    period_end: toNumber(remote.period_end),
    created_at: toNumber(remote.created_at),
    updated_at: toNumber(remote.updated_at),
  };
}

export function recurringRuleToLocal(remote: RemoteRecurringRuleRow): RecurringRuleRow {
  return {
    id: toString_(remote.id),
    type: toString_(remote.type),
    amount_minor: toNumber(remote.amount_minor),
    currency: toString_(remote.currency),
    account_id: toString_(remote.account_id),
    destination_account_id: toNullableString(remote.destination_account_id),
    category_id: toNullableString(remote.category_id),
    merchant: toNullableString(remote.merchant),
    note: toNullableString(remote.note),
    payment_method: toNullableString(remote.payment_method),
    frequency: toString_(remote.frequency),
    interval_count: toNumber(remote.interval_count),
    next_due_at: toNumber(remote.next_due_at),
    last_confirmed_at: toNullableNumber(remote.last_confirmed_at),
    is_active: toIntFlag(remote.is_active),
    created_at: toNumber(remote.created_at),
    updated_at: toNumber(remote.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Merge decision
// ---------------------------------------------------------------------------

/**
 * Last-write-wins: apply a pulled remote row only when it is strictly newer
 * than the local copy (or the row does not exist locally). Ties keep the
 * local row — the push phase already sent it, so both sides converge.
 */
export function shouldApplyRemote(
  localUpdatedAt: number | null,
  remoteUpdatedAt: number,
): boolean {
  if (localUpdatedAt == null) {
    return true;
  }
  return remoteUpdatedAt > localUpdatedAt;
}
