/**
 * People & lending ledger domain types (migration 004 tables: people,
 * ledger_entries).
 *
 * Money model (pinned): every person has ONE virtual account of type
 * 'person' (archived, hidden from pickers). Lending/borrowing moves money as
 * real transfer transactions between a payment account and the person's
 * account; ledger_entries holds the metadata (status, due date, reminder)
 * and links the original transfer via transaction_id. Person account balance
 * positive = they owe me; negative = I owe them.
 */

/** 'lent' = I gave money (they owe me); 'borrowed' = I took money (I owe them). */
export type LedgerDirection = 'lent' | 'borrowed';

export type LedgerStatus = 'pending' | 'partial' | 'completed';

/** Reminder delivery slot; scheduling itself lives in the reminders feature. */
export type ReminderSlot = 'morning' | 'evening';

export interface Person {
  id: string;
  name: string;
  phone: string | null;
  contactRef: string | null;
  notes: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface LedgerEntry {
  id: string;
  personId: string;
  direction: LedgerDirection;
  amountMinor: number;
  currency: string;
  /** Real payment account the money moved through. */
  accountId: string;
  /** The person's virtual account (type 'person'). */
  personAccountId: string;
  /** The original transfer transaction; replaced on financial edits. */
  transactionId: string | null;
  occurredAt: number;
  expectedReturnAt: number | null;
  notes: string | null;
  status: LedgerStatus;
  repaidMinor: number;
  reminderEnabled: boolean;
  reminderSlot: ReminderSlot | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

/** Per-person rollup for the People list. */
export interface PersonSummary {
  person: Person;
  /** Virtual account balance: positive = they owe me, negative = I owe them. */
  balanceMinor: number;
  /** Entries not yet completed. */
  openEntryCount: number;
  /** Open entries past their expected return date. */
  overdueCount: number;
}

/** Amount still outstanding on an entry. */
export function remainingMinor(entry: LedgerEntry): number {
  return Math.max(entry.amountMinor - entry.repaidMinor, 0);
}

/**
 * Overdue = expected return before the start of today and not completed.
 * `todayStart` is epoch ms at local start of day.
 */
export function isEntryOverdue(entry: LedgerEntry, todayStart: number): boolean {
  return (
    entry.deletedAt === null &&
    entry.status !== 'completed' &&
    entry.expectedReturnAt !== null &&
    entry.expectedReturnAt < todayStart
  );
}
