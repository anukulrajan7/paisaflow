import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {BudgetUsage, CategoryTotal, Period, Transaction} from '../types';
import type {BudgetRow, TransactionRow} from '../types/rows';
import {dayPeriod, dayjs, shiftMonthPeriod} from '../../utils/date';
import {mapBudgetRow, mapTransactionRow} from '../repositories/mappers';
import {createBudgetsRepository} from '../repositories/budgetsRepository';

const TRANSACTION_COLUMNS =
  'id, type, amount_minor, currency, account_id, destination_account_id, category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at';

/** Everything the Home screen needs for one monthly budget-cycle period. */
export interface DashboardSummary {
  monthIncomeMinor: number;
  monthExpenseMinor: number;
  /** Income + expense count; transfers and soft-deleted rows excluded. */
  monthTransactionCount: number;
  previousMonthExpenseMinor: number;
  todayExpenseMinor: number;
  /** Expense totals per category for the month, totalMinor DESC. */
  categoryTotals: CategoryTotal[];
  recentTransactions: Transaction[];
  /** Usage of the overall (category-less) budget active in this month. */
  overallBudgetUsage: BudgetUsage | null;
}

interface LeanMonthRow {
  type: string;
  amount_minor: number;
  category_id: string | null;
}

/**
 * Optimized dashboard fetch: one parallel batch of lean queries, with all
 * aggregation done in-process. Avoids N+1 patterns — totals, category
 * breakdown, recent activity and budget status land in ~7 round trips total.
 */
export async function getDashboardSummary(
  db: SqlDb,
  monthPeriod: Period,
  now: number = Date.now(),
): Promise<DashboardSummary> {
  const previousPeriod = shiftMonthPeriod(monthPeriod, -1);
  const todayPeriod = dayPeriod(dayjs(now));

  const [
    monthRows,
    previousExpenseRows,
    todayExpenseRows,
    recentRows,
    overallBudgetRow,
    categoryMeta,
  ] = await Promise.all([
    queryRows<LeanMonthRow>(
      db,
      `SELECT type, amount_minor, category_id FROM transactions
       WHERE deleted_at IS NULL AND type IN ('income', 'expense')
         AND occurred_at >= ? AND occurred_at < ?`,
      [monthPeriod.start, monthPeriod.end],
    ),
    queryRows<{amount_minor: number}>(
      db,
      `SELECT amount_minor FROM transactions
       WHERE deleted_at IS NULL AND type = 'expense'
         AND occurred_at >= ? AND occurred_at < ?`,
      [previousPeriod.start, previousPeriod.end],
    ),
    queryRows<{amount_minor: number}>(
      db,
      `SELECT amount_minor FROM transactions
       WHERE deleted_at IS NULL AND type = 'expense'
         AND occurred_at >= ? AND occurred_at < ?`,
      [todayPeriod.start, todayPeriod.end],
    ),
    queryRows<TransactionRow>(
      db,
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions
       WHERE deleted_at IS NULL
       ORDER BY occurred_at DESC, created_at DESC LIMIT 5`,
    ),
    queryFirst<BudgetRow>(
      db,
      `SELECT id, category_id, limit_minor, currency, period_start, period_end, created_at, updated_at
       FROM budgets
       WHERE category_id IS NULL AND period_start <= ? AND period_end > ?`,
      [now, now],
    ),
    queryRows<{id: string; name: string; icon: string; color: string}>(
      db,
      'SELECT id, name, icon, color FROM categories',
    ),
  ]);

  let monthIncomeMinor = 0;
  let monthExpenseMinor = 0;
  const expenseByCategory = new Map<
    string | null,
    {totalMinor: number; count: number}
  >();
  for (const row of monthRows) {
    if (row.type === 'income') {
      monthIncomeMinor += row.amount_minor;
    } else {
      monthExpenseMinor += row.amount_minor;
      const entry = expenseByCategory.get(row.category_id) ?? {
        totalMinor: 0,
        count: 0,
      };
      entry.totalMinor += row.amount_minor;
      entry.count += 1;
      expenseByCategory.set(row.category_id, entry);
    }
  }

  const metaById = new Map(categoryMeta.map(c => [c.id, c]));
  const categoryTotals: CategoryTotal[] = [...expenseByCategory.entries()]
    .map(([categoryId, entry]) => {
      const meta = categoryId ? metaById.get(categoryId) : undefined;
      return {
        categoryId,
        name: meta?.name ?? 'Uncategorized',
        icon: meta?.icon ?? 'Shapes',
        color: meta?.color ?? '#8B8175',
        totalMinor: entry.totalMinor,
        count: entry.count,
      };
    })
    .sort((a, b) => b.totalMinor - a.totalMinor);

  // Budget usage needs the budget row first, so it runs after the batch.
  let overallBudgetUsage: BudgetUsage | null = null;
  if (overallBudgetRow) {
    overallBudgetUsage = await createBudgetsRepository(db).getBudgetUsage(
      mapBudgetRow(overallBudgetRow).id,
    );
  }

  return {
    monthIncomeMinor,
    monthExpenseMinor,
    monthTransactionCount: monthRows.length,
    previousMonthExpenseMinor: previousExpenseRows.reduce(
      (sum, row) => sum + row.amount_minor,
      0,
    ),
    todayExpenseMinor: todayExpenseRows.reduce(
      (sum, row) => sum + row.amount_minor,
      0,
    ),
    categoryTotals,
    recentTransactions: recentRows.map(mapTransactionRow),
    overallBudgetUsage,
  };
}
