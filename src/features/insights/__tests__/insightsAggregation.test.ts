import {dayjs, monthPeriod, shiftMonthPeriod} from '../../../utils/date';
import type {CategoryMeta, InsightsTransaction} from '../services/insightsAggregation';
import {
  buildCategoryShares,
  buildDailyTrend,
  buildMonthComparison,
  buildMonthlyTrend,
  buildWeeklyTrend,
  computeSpendingStats,
  summarizeTrend,
} from '../services/insightsAggregation';

const NOW = dayjs('2025-06-15T15:00:00').valueOf();
const CYCLE = monthPeriod(dayjs(NOW), 1); // June 2025
const PREV_CYCLE = shiftMonthPeriod(CYCLE, -1); // May 2025

function tx(partial: Partial<InsightsTransaction>): InsightsTransaction {
  return {
    type: 'expense',
    amountMinor: 10_000,
    categoryId: 'cat_food',
    occurredAt: NOW,
    ...partial,
  };
}

const CATEGORIES: CategoryMeta[] = [
  {id: 'cat_food', name: 'Food', icon: 'UtensilsCrossed', color: '#C96F4A'},
  {id: 'cat_transport', name: 'Transport', icon: 'Car', color: '#6B8EAD'},
];

describe('buildDailyTrend', () => {
  it('creates one bucket per day of the cycle and sums expenses per day', () => {
    const day10 = dayjs('2025-06-10T12:00:00').valueOf();
    const transactions = [
      tx({occurredAt: day10, amountMinor: 5_000}),
      tx({occurredAt: day10 + 3_600_000, amountMinor: 7_000}),
      tx({type: 'income', occurredAt: day10, amountMinor: 99_000}),
    ];

    const points = buildDailyTrend(transactions, CYCLE, NOW);

    expect(points).toHaveLength(30); // June
    const day10Point = points.find(p => p.label === '10');
    expect(day10Point?.expenseMinor).toBe(12_000);
    expect(day10Point?.fullLabel).toBe('10 June 2025');
    // Income is excluded from the trend.
    expect(points.reduce((sum, p) => sum + p.expenseMinor, 0)).toBe(12_000);
    // The bucket containing `now` is flagged.
    expect(points.find(p => p.isCurrent)?.label).toBe('15');
    // Out-of-cycle transactions are ignored.
    const may = tx({occurredAt: dayjs('2025-05-31T12:00:00').valueOf()});
    expect(
      buildDailyTrend([may], CYCLE, NOW).reduce((s, p) => s + p.expenseMinor, 0),
    ).toBe(0);
  });
});

describe('buildWeeklyTrend', () => {
  it('returns 6 week buckets ending with the current week', () => {
    const thisWeek = tx({occurredAt: NOW, amountMinor: 3_000});
    const lastWeek = tx({
      occurredAt: dayjs(NOW).subtract(7, 'day').valueOf(),
      amountMinor: 4_000,
    });
    const eightWeeksAgo = tx({
      occurredAt: dayjs(NOW).subtract(56, 'day').valueOf(),
      amountMinor: 9_000,
    });

    const points = buildWeeklyTrend(
      [thisWeek, lastWeek, eightWeeksAgo],
      NOW,
    );

    expect(points).toHaveLength(6);
    expect(points[5].isCurrent).toBe(true);
    expect(points[5].expenseMinor).toBe(3_000);
    expect(points[4].expenseMinor).toBe(4_000);
    // Outside the 6-week window → excluded.
    expect(points.reduce((s, p) => s + p.expenseMinor, 0)).toBe(7_000);
  });
});

describe('buildMonthlyTrend', () => {
  it('returns 6 budget-cycle buckets respecting the cycle start day', () => {
    const june = tx({occurredAt: NOW, amountMinor: 6_000});
    const may = tx({
      occurredAt: dayjs('2025-05-20T12:00:00').valueOf(),
      amountMinor: 5_000,
    });
    const january = tx({
      occurredAt: dayjs('2025-01-20T12:00:00').valueOf(),
      amountMinor: 4_000,
    });

    const points = buildMonthlyTrend([june, may, january], 1, NOW);

    expect(points).toHaveLength(6);
    expect(points.map(p => p.label)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
    ]);
    expect(points[5].isCurrent).toBe(true);
    expect(points[5].expenseMinor).toBe(6_000);
    expect(points[4].expenseMinor).toBe(5_000);
    expect(points[0].expenseMinor).toBe(4_000);
  });

  it('honours a non-1 cycle start day', () => {
    // Cycle starting on the 15th: 12 June falls in the May 15 – Jun 15 cycle.
    const before = tx({
      occurredAt: dayjs('2025-06-12T12:00:00').valueOf(),
      amountMinor: 2_000,
    });
    const after = tx({
      occurredAt: dayjs('2025-06-16T12:00:00').valueOf(),
      amountMinor: 3_000,
    });
    const now = dayjs('2025-06-20T12:00:00').valueOf();

    const points = buildMonthlyTrend([before, after], 15, now);

    expect(points[4].expenseMinor).toBe(2_000); // May 15 cycle
    expect(points[5].expenseMinor).toBe(3_000); // Jun 15 cycle (current)
  });
});

describe('summarizeTrend', () => {
  it('returns total and peak point', () => {
    const points = buildDailyTrend(
      [
        tx({occurredAt: dayjs('2025-06-03T10:00:00').valueOf(), amountMinor: 5_000}),
        tx({occurredAt: dayjs('2025-06-09T10:00:00').valueOf(), amountMinor: 8_000}),
      ],
      CYCLE,
      NOW,
    );
    const {totalMinor, peak} = summarizeTrend(points);
    expect(totalMinor).toBe(13_000);
    expect(peak?.label).toBe('9');
    expect(peak?.expenseMinor).toBe(8_000);
  });

  it('returns null peak when every bucket is zero', () => {
    const {totalMinor, peak} = summarizeTrend(
      buildDailyTrend([], CYCLE, NOW),
    );
    expect(totalMinor).toBe(0);
    expect(peak).toBeNull();
  });
});

describe('buildCategoryShares', () => {
  it('sums expenses per category, sorted desc, with fractions; income excluded', () => {
    const transactions = [
      tx({categoryId: 'cat_food', amountMinor: 60_000}),
      tx({categoryId: 'cat_transport', amountMinor: 30_000}),
      tx({categoryId: null, amountMinor: 10_000}),
      tx({type: 'income', categoryId: 'cat_salary', amountMinor: 900_000}),
    ];

    const shares = buildCategoryShares(transactions, CATEGORIES);

    expect(shares.map(s => s.name)).toEqual([
      'Food',
      'Transport',
      'Uncategorized',
    ]);
    expect(shares[0].fraction).toBeCloseTo(0.6);
    expect(shares[1].fraction).toBeCloseTo(0.3);
    expect(shares[2].fraction).toBeCloseTo(0.1);
    expect(shares[2].icon).toBe('Shapes');
    expect(shares[0].count).toBe(1);
  });

  it('returns an empty list with no expenses', () => {
    expect(buildCategoryShares([], CATEGORIES)).toEqual([]);
  });
});

describe('computeSpendingStats', () => {
  it('computes total, count, daily average and highest day for the cycle', () => {
    const transactions = [
      tx({occurredAt: dayjs('2025-06-02T10:00:00').valueOf(), amountMinor: 30_000}),
      tx({occurredAt: dayjs('2025-06-14T10:00:00').valueOf(), amountMinor: 20_000}),
      tx({occurredAt: dayjs('2025-06-14T18:00:00').valueOf(), amountMinor: 40_000}),
      tx({type: 'income', occurredAt: dayjs('2025-06-05T10:00:00').valueOf(), amountMinor: 100_000}),
      // Outside the cycle — must not affect anything.
      tx({occurredAt: dayjs('2025-05-20T10:00:00').valueOf(), amountMinor: 999_000}),
    ];

    const stats = computeSpendingStats(transactions, CYCLE, NOW);

    expect(stats.totalExpenseMinor).toBe(90_000);
    expect(stats.transactionCount).toBe(4); // income + expenses in cycle
    // 15 days elapsed (Jun 1 → Jun 15): 90000 / 15 = 6000.
    expect(stats.averageDailyMinor).toBe(6_000);
    expect(stats.highestDay?.label).toBe('14 June 2025');
    expect(stats.highestDay?.totalMinor).toBe(60_000);
  });

  it('returns null highestDay and zeroes for an empty cycle', () => {
    const stats = computeSpendingStats([], CYCLE, NOW);
    expect(stats.totalExpenseMinor).toBe(0);
    expect(stats.transactionCount).toBe(0);
    expect(stats.averageDailyMinor).toBe(0);
    expect(stats.highestDay).toBeNull();
  });
});

describe('buildMonthComparison', () => {
  it('compares current vs previous cycle expenses', () => {
    const transactions = [
      tx({occurredAt: NOW, amountMinor: 120_000}),
      tx({occurredAt: PREV_CYCLE.start + 86_400_000, amountMinor: 100_000}),
    ];

    const comparison = buildMonthComparison(transactions, CYCLE, PREV_CYCLE);

    expect(comparison.currentMinor).toBe(120_000);
    expect(comparison.previousMinor).toBe(100_000);
    expect(comparison.deltaMinor).toBe(20_000);
    expect(comparison.deltaPercent).toBe(20);
  });

  it('returns null deltaPercent when the previous cycle had no spending', () => {
    const comparison = buildMonthComparison(
      [tx({occurredAt: NOW, amountMinor: 50_000})],
      CYCLE,
      PREV_CYCLE,
    );
    expect(comparison.previousMinor).toBe(0);
    expect(comparison.deltaPercent).toBeNull();
  });
});
