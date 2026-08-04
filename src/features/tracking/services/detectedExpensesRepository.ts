import {getDb} from '../../../database/connection/connection';
import {queryFirst, queryRows} from '../../../database/connection/helpers';
import type {SqlDb} from '../../../database/connection/types';
import {newId} from '../../../utils/id';

/**
 * Repository for the detected_expenses review inbox (migration 002).
 * Feature-local (not part of the shared repository interfaces) — rows are
 * staging data, not ledger data, until the user approves them.
 */

export type DetectedExpenseSource = 'sms' | 'manual';
export type DetectedExpenseStatus = 'pending' | 'approved' | 'dismissed';

export interface DetectedExpense {
  id: string;
  source: DetectedExpenseSource;
  rawBody: string;
  parsedJson: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  merchant: string | null;
  accountHint: string | null;
  occurredAt: number;
  categoryId: string | null;
  dedupeHash: string;
  status: DetectedExpenseStatus;
  transactionId: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface NewDetectedExpense {
  source: DetectedExpenseSource;
  rawBody: string;
  parsedJson: string;
  amountMinor: number;
  direction: 'debit' | 'credit';
  merchant: string | null;
  accountHint: string | null;
  occurredAt: number;
  categoryId: string | null;
  dedupeHash: string;
}

/** 'inserted' | 'duplicate' — callers surface both to the user. */
export type InsertResult = 'inserted' | 'duplicate';

interface DetectedExpenseRow {
  id: string;
  source: string;
  raw_body: string;
  parsed_json: string;
  amount_minor: number;
  direction: string;
  merchant: string | null;
  account_hint: string | null;
  occurred_at: number;
  category_id: string | null;
  dedupe_hash: string;
  status: string;
  transaction_id: string | null;
  created_at: number;
  updated_at: number;
}

const COLUMNS =
  'id, source, raw_body, parsed_json, amount_minor, direction, merchant, account_hint, occurred_at, category_id, dedupe_hash, status, transaction_id, created_at, updated_at';

function mapRow(row: DetectedExpenseRow): DetectedExpense {
  return {
    id: row.id,
    source: row.source as DetectedExpenseSource,
    rawBody: row.raw_body,
    parsedJson: row.parsed_json,
    amountMinor: row.amount_minor,
    direction: row.direction as DetectedExpense['direction'],
    merchant: row.merchant,
    accountHint: row.account_hint,
    occurredAt: row.occurred_at,
    categoryId: row.category_id,
    dedupeHash: row.dedupe_hash,
    status: row.status as DetectedExpenseStatus,
    transactionId: row.transaction_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createDetectedExpensesRepository(db: SqlDb) {
  return {
    /** Idempotent insert: dedupe_hash is UNIQUE; re-imports are skipped. */
    async insertDetected(input: NewDetectedExpense): Promise<InsertResult> {
      const existing = await queryFirst<{id: string}>(
        db,
        'SELECT id FROM detected_expenses WHERE dedupe_hash = ?',
        [input.dedupeHash],
      );
      if (existing) {
        return 'duplicate';
      }
      const now = Date.now();
      await db.executeAsync(
        `INSERT OR IGNORE INTO detected_expenses
          (id, source, raw_body, parsed_json, amount_minor, direction, merchant,
           account_hint, occurred_at, category_id, dedupe_hash, status,
           transaction_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          input.source,
          input.rawBody,
          input.parsedJson,
          input.amountMinor,
          input.direction,
          input.merchant,
          input.accountHint,
          input.occurredAt,
          input.categoryId,
          input.dedupeHash,
          'pending',
          null,
          now,
          now,
        ],
      );
      return 'inserted';
    },

    /** Pending rows, newest first. */
    async listPending(): Promise<DetectedExpense[]> {
      const rows = await queryRows<DetectedExpenseRow>(
        db,
        `SELECT ${COLUMNS} FROM detected_expenses
         WHERE status = ?
         ORDER BY occurred_at DESC, created_at DESC`,
        ['pending'],
      );
      return rows.map(mapRow);
    },

    async countPending(): Promise<number> {
      return (await this.listPending()).length;
    },

    async markApproved(id: string, transactionId: string): Promise<void> {
      await db.executeAsync(
        `UPDATE detected_expenses
         SET status = ?, transaction_id = ?, updated_at = ?
         WHERE id = ?`,
        ['approved', transactionId, Date.now(), id],
      );
    },

    async markDismissed(id: string): Promise<void> {
      await db.executeAsync(
        `UPDATE detected_expenses
         SET status = ?, updated_at = ?
         WHERE id = ?`,
        ['dismissed', Date.now(), id],
      );
    },
  };
}

export type DetectedExpensesRepository = ReturnType<
  typeof createDetectedExpensesRepository
>;

let instance: DetectedExpensesRepository | null = null;

/** Lazy singleton over the default connection (mirrors database/repositories). */
export function getDetectedExpensesRepository(): DetectedExpensesRepository {
  if (!instance) {
    instance = createDetectedExpensesRepository(getDb());
  }
  return instance;
}
