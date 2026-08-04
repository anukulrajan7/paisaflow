import type {Period} from '../../../utils/date';
import {
  dayjs,
  daysInPeriod,
  monthPeriod,
  shiftMonthPeriod,
  weekPeriod,
} from '../../../utils/date';

/** Camel-case lean transaction, mapped from InsightsTransactionRow. */
export interface InsightsTransaction {
  type: 'income' | 'expense';
  amountMinor: number;
  categoryId: string | null;
  occurredAt: number;
}

export interface CategoryMeta {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export type TrendMode = 'daily' | 'weekly' | 'monthly';

/** One bucket of a spending-trend chart. */
export interface TrendPoint {
  /** epoch ms at the start of the bucket (day / week / budget cycle). */
  bucketStart: number;
  /** Short axis label, e.g. '15', '8 Jun', 'Jun'. */
  label: string;
  /** Full spoken label, e.g. '15 June 2025'. */
  fullLabel: string;
  /** Expense total in integer minor units. */
  expenseMinor: number;
  /** True when the bucket contains `now`. */
  isCurrent: boolean;
}

export interface CategoryShare {
  /** Null for transactions without a category ('Uncategorized'). */
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  totalMinor: number;
  count: number;
  /** Share of period expenses, 0..1. */
  fraction: number;
}

export interface SpendingStats {
  /** Expense total for the current budget cycle, minor units. */
  totalExpenseMinor: number;
  /** Income + expense count for the current cycle (transfers excluded upstream). */
  transactionCount: number;
  /** totalExpenseMinor / days elapsed in the cycle, rounded to minor units. */
  averageDailyMinor: number;
  /** Highest-spending day in the cycle; null when nothing was spent. */
  highestDay: {dayStart: number; label: string; totalMinor: number} | null;
}

export interface MonthComparison {
  currentMinor: number;
  previousMinor: number;
  deltaMinor: number;
  /** Whole-percent change vs the previous cycle; null when previous is 0. */
  deltaPercent: number | null;
}

const UNCATEGORIZED_COLOR = '#8B8175'; // matches dashboardQueries fallback

function expenses(transactions: InsightsTransaction[]): InsightsTransaction[] {
  return transactions.filter(t => t.type === 'expense');
}

function sumMinor(transactions: InsightsTransaction[]): number {
  return transactions.reduce((sum, t) => sum + t.amountMinor, 0);
}

function inPeriod(occurredAt: number, period: Period): boolean {
  return occurredAt >= period.start && occurredAt < period.end;
}

function buildTrend(
  transactions: InsightsTransaction[],
  buckets: Array<{period: Period; label: string; fullLabel: string}>,
  now: number,
): TrendPoint[] {
  const points = buckets.map<TrendPoint>(bucket => ({
    bucketStart: bucket.period.start,
    label: bucket.label,
    fullLabel: bucket.fullLabel,
    expenseMinor: 0,
    isCurrent: inPeriod(now, bucket.period),
  }));
  for (const t of expenses(transactions)) {
    const index = buckets.findIndex(bucket =>
      inPeriod(t.occurredAt, bucket.period),
    );
    if (index >= 0) {
      points[index].expenseMinor += t.amountMinor;
    }
  }
  return points;
}

/** Per-day expense totals for the given budget cycle. */
export function buildDailyTrend(
  transactions: InsightsTransaction[],
  cycle: Period,
  now: number,
): TrendPoint[] {
  const buckets = daysInPeriod(cycle).map(dayStart => {
    const day = dayjs(dayStart);
    return {
      period: {start: dayStart, end: day.add(1, 'day').valueOf()},
      label: day.format('D'),
      fullLabel: day.format('D MMMM YYYY'),
    };
  });
  return buildTrend(transactions, buckets, now);
}

/** Per-week expense totals for the last `weekCount` weeks (ending this week). */
export function buildWeeklyTrend(
  transactions: InsightsTransaction[],
  now: number,
  weekCount = 6,
): TrendPoint[] {
  const currentWeek = weekPeriod(dayjs(now));
  const buckets: Array<{period: Period; label: string; fullLabel: string}> =
    [];
  for (let i = weekCount - 1; i >= 0; i -= 1) {
    const start = dayjs(currentWeek.start).subtract(i, 'week');
    const end = start.add(1, 'week');
    const lastDay = end.subtract(1, 'day');
    buckets.push({
      period: {start: start.valueOf(), end: end.valueOf()},
      label: start.format('D MMM'),
      fullLabel: `${start.format('D MMM')} – ${lastDay.format('D MMM YYYY')}`,
    });
  }
  return buildTrend(transactions, buckets, now);
}

/** Per-cycle expense totals for the last `monthCount` monthly budget cycles. */
export function buildMonthlyTrend(
  transactions: InsightsTransaction[],
  cycleStartDay: number,
  now: number,
  monthCount = 6,
): TrendPoint[] {
  const currentCycle = monthPeriod(dayjs(now), cycleStartDay);
  const buckets: Array<{period: Period; label: string; fullLabel: string}> =
    [];
  for (let i = monthCount - 1; i >= 0; i -= 1) {
    const period = shiftMonthPeriod(currentCycle, -i);
    const start = dayjs(period.start);
    buckets.push({
      period,
      label: start.format('MMM'),
      fullLabel: start.format('MMMM YYYY'),
    });
  }
  return buildTrend(transactions, buckets, now);
}

/** Total + peak of a trend, for chart captions and accessibility summaries. */
export function summarizeTrend(points: TrendPoint[]): {
  totalMinor: number;
  peak: TrendPoint | null;
} {
  let totalMinor = 0;
  let peak: TrendPoint | null = null;
  for (const point of points) {
    totalMinor += point.expenseMinor;
    if (point.expenseMinor > 0 && (peak === null || point.expenseMinor > peak.expenseMinor)) {
      peak = point;
    }
  }
  return {totalMinor, peak};
}

/** Expense totals per category for the period, totalMinor DESC, with shares. */
export function buildCategoryShares(
  transactions: InsightsTransaction[],
  categories: CategoryMeta[],
): CategoryShare[] {
  const metaById = new Map(categories.map(c => [c.id, c]));
  const byCategory = new Map<string | null, {totalMinor: number; count: number}>();
  let totalMinor = 0;
  for (const t of expenses(transactions)) {
    const entry = byCategory.get(t.categoryId) ?? {totalMinor: 0, count: 0};
    entry.totalMinor += t.amountMinor;
    entry.count += 1;
    byCategory.set(t.categoryId, entry);
    totalMinor += t.amountMinor;
  }
  return [...byCategory.entries()]
    .map(([categoryId, entry]) => {
      const meta = categoryId ? metaById.get(categoryId) : undefined;
      return {
        categoryId,
        name: meta?.name ?? 'Uncategorized',
        icon: meta?.icon ?? 'Shapes',
        color: meta?.color ?? UNCATEGORIZED_COLOR,
        totalMinor: entry.totalMinor,
        count: entry.count,
        fraction: totalMinor > 0 ? entry.totalMinor / totalMinor : 0,
      };
    })
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Headline numbers for the current budget cycle. */
export function computeSpendingStats(
  transactions: InsightsTransaction[],
  cycle: Period,
  now: number,
): SpendingStats {
  const cycleTransactions = transactions.filter(t =>
    inPeriod(t.occurredAt, cycle),
  );
  const cycleExpenses = expenses(cycleTransactions);
  const totalExpenseMinor = sumMinor(cycleExpenses);

  const daysElapsed = Math.max(dayjs(now).diff(dayjs(cycle.start), 'day') + 1, 1);
  const averageDailyMinor = Math.round(totalExpenseMinor / daysElapsed);

  const byDay = new Map<number, number>();
  for (const t of cycleExpenses) {
    const dayStart = dayjs(t.occurredAt).startOf('day').valueOf();
    byDay.set(dayStart, (byDay.get(dayStart) ?? 0) + t.amountMinor);
  }
  let highestDay: SpendingStats['highestDay'] = null;
  for (const [dayStart, dayTotal] of byDay) {
    if (dayTotal > 0 && (highestDay === null || dayTotal > highestDay.totalMinor)) {
      highestDay = {
        dayStart,
        label: dayjs(dayStart).format('D MMMM YYYY'),
        totalMinor: dayTotal,
      };
    }
  }

  return {
    totalExpenseMinor,
    transactionCount: cycleTransactions.length,
    averageDailyMinor,
    highestDay,
  };
}

/** Current-cycle vs previous-cycle expense comparison. */
export function buildMonthComparison(
  transactions: InsightsTransaction[],
  currentCycle: Period,
  previousCycle: Period,
): MonthComparison {
  const currentMinor = sumMinor(
    expenses(transactions.filter(t => inPeriod(t.occurredAt, currentCycle))),
  );
  const previousMinor = sumMinor(
    expenses(transactions.filter(t => inPeriod(t.occurredAt, previousCycle))),
  );
  const deltaMinor = currentMinor - previousMinor;
  return {
    currentMinor,
    previousMinor,
    deltaMinor,
    deltaPercent:
      previousMinor > 0
        ? Math.round((deltaMinor / previousMinor) * 100)
        : null,
  };
}
