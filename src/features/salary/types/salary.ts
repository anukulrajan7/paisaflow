/**
 * Salary tracking domain types (migration 004: salary_configs, salary_records).
 *
 * Conventions (see AGENTS.md):
 * - Money is ALWAYS integer minor units (`*Minor`). Never floats.
 * - Timestamps are epoch milliseconds (`*At`).
 * - A period is a calendar month keyed 'YYYY-MM'.
 */

/** What actually happened with a month's salary. */
export type SalaryRecordStatus = 'credited' | 'partial' | 'bonus' | 'delayed';

/**
 * Derived display state for a period. Without a record the period is either
 * 'expected' (not yet due) or 'delayed' (past the expected day); a record
 * decides the state outright.
 */
export type SalaryState = 'expected' | SalaryRecordStatus;

/** The single active salary setup. */
export interface SalaryConfig {
  id: string;
  amountMinor: number;
  currency: string;
  /** Destination account — always a REAL account, never a virtual one. */
  accountId: string;
  /** Employer / income source; becomes the transaction merchant. */
  employer: string | null;
  /** Day of the month the salary is expected, 1-28. */
  expectedDay: number;
  /** 'HH:mm' local reminder time, or null. Persisted only — scheduling is composed elsewhere. */
  reminderTime: string | null;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** One month's outcome. UNIQUE(config_id, period_key) in the schema. */
export interface SalaryRecord {
  id: string;
  configId: string;
  /** 'YYYY-MM' calendar month the record belongs to. */
  periodKey: string;
  /** Received amount; the EXPECTED amount when status is 'delayed'. */
  amountMinor: number;
  status: SalaryRecordStatus;
  /** Linked income transaction; null for 'delayed' (no money moved yet). */
  transactionId: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}
