/**
 * Raw SQLite row shapes (snake_case, as returned by the driver).
 * Repositories map these to the camelCase domain models in ./index.
 */
export interface AccountRow {
  id: string;
  name: string;
  type: string;
  currency: string;
  opening_balance_minor: number;
  is_default: number;
  is_archived: number;
  created_at: number;
  updated_at: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  is_system: number;
  is_archived: number;
  created_at: number;
  updated_at: number;
}

export interface TransactionRow {
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
  occurred_at: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface TagRow {
  id: string;
  name: string;
  created_at: number;
}

export interface BudgetRow {
  id: string;
  category_id: string | null;
  limit_minor: number;
  currency: string;
  period_start: number;
  period_end: number;
  created_at: number;
  updated_at: number;
}

export interface SettingRow {
  key: string;
  value: string;
  updated_at: number;
}

export interface AiSummaryRow {
  id: string;
  period_type: string;
  period_start: number;
  period_end: number;
  input_hash: string;
  model: string;
  summary_json: string;
  created_at: number;
}
