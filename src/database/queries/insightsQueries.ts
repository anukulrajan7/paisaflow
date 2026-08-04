import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {BudgetUsage} from '../types';
import type {BudgetRow} from '../types/rows';
import {mapBudgetRow} from '../repositories/mappers';
import {createBudgetsRepository} from '../repositories/budgetsRepository';

/**
 * Lean transaction row for insights aggregation (snake_case, as returned by
 * the driver). Deliberately minimal: aggregation happens in-process in the
 * insights feature's pure helpers.
 */
export interface InsightsTransactionRow {
  type: string;
  amount_minor: number;
  category_id: string | null;
  occurred_at: number;
}

export interface InsightsCategoryMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
}

/** Raw inputs the Insights screen needs; all aggregation is done by the caller. */
export interface InsightsRawData {
  /**
   * Income + expense rows with occurred_at in [windowStart, windowEnd).
   * Transfers and soft-deleted rows are excluded.
   */
  transactions: InsightsTransactionRow[];
  categories: InsightsCategoryMeta[];
  /** Usage of the overall (category-less) budget active at `now`, if any. */
  overallBudgetUsage: BudgetUsage | null;
}

/**
 * One parallel batch of lean queries for the Insights screen. The window
 * should cover every period the screen can display (e.g. the last 6 monthly
 * budget cycles); bucketing/aggregation happens in-process, which keeps the
 * SQL trivially simple and unit-testable.
 */
export async function getInsightsRawData(
  db: SqlDb,
  windowStart: number,
  windowEnd: number,
  now: number = Date.now(),
): Promise<InsightsRawData> {
  const [transactions, categories, overallBudgetRow] = await Promise.all([
    queryRows<InsightsTransactionRow>(
      db,
      `SELECT type, amount_minor, category_id, occurred_at FROM transactions
       WHERE deleted_at IS NULL AND type IN ('income', 'expense')
         AND occurred_at >= ? AND occurred_at < ?`,
      [windowStart, windowEnd],
    ),
    queryRows<InsightsCategoryMeta>(
      db,
      'SELECT id, name, icon, color FROM categories',
    ),
    queryFirst<BudgetRow>(
      db,
      `SELECT id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at
       FROM budgets
       WHERE category_id IS NULL AND period_start <= ? AND period_end > ?`,
      [now, now],
    ),
  ]);

  // Budget usage needs the budget row first, so it runs after the batch.
  let overallBudgetUsage: BudgetUsage | null = null;
  if (overallBudgetRow) {
    overallBudgetUsage = await createBudgetsRepository(db).getBudgetUsage(
      mapBudgetRow(overallBudgetRow).id,
    );
  }

  return {transactions, categories, overallBudgetUsage};
}
