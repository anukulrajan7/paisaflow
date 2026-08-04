import {getDb} from '../../../database/connection/connection';
import type {SqlDb, SqlExecutor} from '../../../database/connection/types';
import {createTransactionsRepository} from '../../../database/repositories';
import {SYSTEM_CATEGORY_IDS} from '../../../database/seeds';
import type {Transaction} from '../../../database/types';
import type {
  SalaryConfig,
  SalaryRecord,
  SalaryRecordStatus,
} from '../types/salary';
import {
  ALREADY_RECORDED_MESSAGE,
  createSalaryRepository,
} from './salaryRepository';

export interface ConfirmSalaryInput {
  config: SalaryConfig;
  /** 'YYYY-MM' period being confirmed (usually the current month). */
  periodKey: string;
  status: SalaryRecordStatus;
  /**
   * Received amount in minor units. Required for credited/partial/bonus;
   * ignored for 'delayed' (the expected amount is stored instead).
   */
  amountMinor?: number;
  note?: string | null;
  /** epoch ms of the income transaction; defaults to now. */
  now?: number;
}

export interface ConfirmSalaryResult {
  record: SalaryRecord;
  /** Null when status is 'delayed' — no money moved. */
  transaction: Transaction | null;
}

interface ConfirmDeps {
  db: SqlDb;
}

function defaultDeps(): ConfirmDeps {
  return {db: getDb()};
}

/**
 * Repositories only call execute/executeAsync, so a transaction's executor
 * can be re-wrapped as a SqlDb to run the shared repositories atomically.
 * Nested transaction attempts fail loudly instead of escaping the boundary.
 */
function executorAsDb(executor: SqlExecutor): SqlDb {
  return {
    execute: (sql, params) => executor.execute(sql, params),
    executeAsync: (sql, params) => executor.executeAsync(sql, params),
    transaction: () =>
      Promise.reject(new Error('Nested transactions are not supported')),
  };
}

/**
 * Records a month's salary outcome.
 *
 * - credited / partial / bonus: creates a real income transaction (salary
 *   category, employer as merchant, occurred_at = now) and links it from the
 *   salary_records row — atomically, so a failed insert never leaves an
 *   orphan transaction behind.
 * - delayed: stores a status-only row with the expected amount and NO
 *   transaction; when the salary later arrives, a credited/partial/bonus
 *   confirmation UPGRADES that row in place (UNIQUE(config_id, period_key)
 *   still allows only one row per month).
 *
 * Any other repeat for the same period throws ALREADY_RECORDED_MESSAGE.
 * The caller bumps dataVersion after a successful confirm.
 */
export async function confirmSalary(
  input: ConfirmSalaryInput,
  deps: ConfirmDeps = defaultDeps(),
): Promise<ConfirmSalaryResult> {
  const {config, periodKey, status} = input;
  const now = input.now ?? Date.now();
  const note = input.note?.trim() ? input.note.trim() : null;
  const amountMinor =
    status === 'delayed' ? config.amountMinor : input.amountMinor;
  if (
    typeof amountMinor !== 'number' ||
    !Number.isSafeInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    throw new Error('amountMinor must be a positive integer (minor units)');
  }
  const amount = amountMinor;

  try {
    return await deps.db.transaction(async tx => {
      const txDb = executorAsDb(tx);
      const salary = createSalaryRepository(txDb);

      const existing = await salary.getRecordForPeriod(config.id, periodKey);
      // Only an unpaid delayed record may be re-confirmed (upgraded below).
      if (
        existing &&
        !(existing.status === 'delayed' && existing.transactionId === null)
      ) {
        throw new Error(ALREADY_RECORDED_MESSAGE);
      }

      if (status === 'delayed') {
        if (existing) {
          throw new Error(ALREADY_RECORDED_MESSAGE);
        }
        const record = await salary.createRecord({
          configId: config.id,
          periodKey,
          amountMinor: amount,
          status,
          transactionId: null,
          note,
        });
        return {record, transaction: null};
      }

      const transactions = createTransactionsRepository(txDb);
      const transaction = await transactions.createTransaction({
        type: 'income',
        amountMinor: amount,
        currency: config.currency,
        accountId: config.accountId,
        categoryId: SYSTEM_CATEGORY_IDS.salary,
        merchant: config.employer,
        note,
        occurredAt: now,
      });

      const record = existing
        ? await salary.updateRecord(existing.id, {
            amountMinor: amount,
            status,
            transactionId: transaction.id,
            note,
          })
        : await salary.createRecord({
            configId: config.id,
            periodKey,
            amountMinor: amount,
            status,
            transactionId: transaction.id,
            note,
          });
      return {record, transaction};
    });
  } catch (error) {
    // Backstop: a raced duplicate hits UNIQUE(config_id, period_key) and
    // rolls the whole transaction back, orphan transaction included.
    if (error instanceof Error && /unique/i.test(error.message)) {
      throw new Error(ALREADY_RECORDED_MESSAGE);
    }
    throw error;
  }
}
