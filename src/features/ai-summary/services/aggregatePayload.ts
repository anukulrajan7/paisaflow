/**
 * Builds the aggregate payload sent to the AI provider — computed entirely
 * on-device via repositories. Transfers and soft-deleted rows are excluded by
 * the repository layer. Notes are never included; merchant strings are
 * truncated and treated as untrusted data downstream.
 */
import {
  getBudgetsRepository,
  getCategoriesRepository,
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import {dayjs, monthPeriod, shiftMonthPeriod} from '../../../utils/date';
import type {Period} from '../../../database/types';
import type {AiAggregatePayload} from '../types';

const MAX_TOP_CATEGORIES = 8;
const MAX_LARGEST_TRANSACTIONS = 5;
const MAX_MERCHANT_LENGTH = 60;

/** Current monthly budget-cycle period. Exported for cache lookups. */
export async function getCurrentAiPeriod(now: number = Date.now()): Promise<Period> {
  const cycleStartDay = await getSettingsRepository().getBudgetCycleStartDay();
  return monthPeriod(dayjs(now), cycleStartDay);
}

function sanitizeMerchant(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > MAX_MERCHANT_LENGTH
    ? trimmed.slice(0, MAX_MERCHANT_LENGTH)
    : trimmed;
}

export async function buildAggregatePayload(
  now: number = Date.now(),
): Promise<AiAggregatePayload> {
  const settings = getSettingsRepository();
  const transactions = getTransactionsRepository();
  const budgets = getBudgetsRepository();
  const categories = getCategoriesRepository();

  const period = await getCurrentAiPeriod(now);
  const previousPeriod = shiftMonthPeriod(period, -1);

  const [
    currency,
    totals,
    previousTotals,
    categoryTotals,
    dailyTotals,
    activeBudgets,
    expenseTransactions,
    expenseCategories,
  ] = await Promise.all([
    settings.getCurrency(),
    transactions.getMonthlyTotals(period),
    transactions.getMonthlyTotals(previousPeriod),
    transactions.getCategoryTotals(period, 'expense'),
    transactions.getDailyTotals(period),
    budgets.listBudgetsActiveAt(now),
    transactions.listTransactions({
      type: 'expense',
      from: period.start,
      to: period.end,
    }),
    categories.listCategories({type: 'expense'}),
  ]);

  const categoryNameById = new Map(expenseCategories.map(c => [c.id, c.name]));

  const topCategories = categoryTotals
    .slice(0, MAX_TOP_CATEGORIES)
    .map(entry => ({
      name: entry.name,
      amountMinor: entry.totalMinor,
      share:
        totals.expenseMinor > 0
          ? Math.round((entry.totalMinor / totals.expenseMinor) * 1000) / 1000
          : 0,
    }));

  const largestTransactions = [...expenseTransactions]
    .sort((a, b) => b.amountMinor - a.amountMinor)
    .slice(0, MAX_LARGEST_TRANSACTIONS)
    .map(txn => ({
      amountMinor: txn.amountMinor,
      merchant: sanitizeMerchant(txn.merchant),
      category: txn.categoryId
        ? categoryNameById.get(txn.categoryId) ?? 'Uncategorized'
        : 'Uncategorized',
    }));

  const overallBudget = activeBudgets.find(b => b.categoryId === null) ?? null;

  return {
    currency,
    period: {
      start: new Date(period.start).toISOString(),
      end: new Date(period.end).toISOString(),
    },
    incomeMinor: totals.incomeMinor,
    expenseMinor: totals.expenseMinor,
    budgetMinor: overallBudget?.limitMinor ?? null,
    previousPeriodExpenseMinor: previousTotals.expenseMinor,
    topCategories,
    dailyTotals: dailyTotals.map(day => ({
      date: dayjs(day.dayStart).format('YYYY-MM-DD'),
      incomeMinor: day.incomeMinor,
      expenseMinor: day.expenseMinor,
    })),
    largestTransactions,
    transactionCount: totals.count,
  };
}
