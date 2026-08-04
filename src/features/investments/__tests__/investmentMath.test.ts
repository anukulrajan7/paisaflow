import {dayjs} from '../../../utils/date';
import type {Investment} from '../types/investment';
import {
  allocationByType,
  gainLoss,
  nextContributionDueAt,
  portfolioTotals,
  upcomingContributions,
  upcomingMaturities,
} from '../utils/investmentMath';

function makeInvestment(overrides: Partial<Investment> = {}): Investment {
  return {
    id: 'inv_1',
    name: 'Test fund',
    type: 'mutual_fund',
    holdingAccountId: 'acc_holding_1',
    investedMinor: 0,
    currentValueMinor: 0,
    startedAt: dayjs('2025-01-01').valueOf(),
    maturityAt: null,
    monthlyContributionMinor: null,
    reminderDay: null,
    notes: null,
    isActive: true,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

describe('gainLoss', () => {
  it('reports a gain with a signed percentage', () => {
    const result = gainLoss(100_000, 112_500);
    expect(result.amountMinor).toBe(12_500);
    expect(result.isGain).toBe(true);
    expect(result.percent).toBeCloseTo(12.5);
  });

  it('reports a loss', () => {
    const result = gainLoss(100_000, 90_000);
    expect(result.amountMinor).toBe(-10_000);
    expect(result.isGain).toBe(false);
    expect(result.percent).toBeCloseTo(-10);
  });

  it('treats zero change as a (flat) gain of 0%', () => {
    const result = gainLoss(50_000, 50_000);
    expect(result.amountMinor).toBe(0);
    expect(result.isGain).toBe(true);
    expect(result.percent).toBe(0);
  });

  it('returns null percent when nothing is invested', () => {
    const result = gainLoss(0, 12_000);
    expect(result.amountMinor).toBe(12_000);
    expect(result.percent).toBeNull();
  });
});

describe('portfolioTotals', () => {
  it('sums invested and current across investments', () => {
    const totals = portfolioTotals([
      makeInvestment({id: 'a', investedMinor: 100, currentValueMinor: 150}),
      makeInvestment({id: 'b', investedMinor: 200, currentValueMinor: 180}),
    ]);
    expect(totals).toEqual({investedMinor: 300, currentValueMinor: 330});
  });

  it('handles an empty portfolio', () => {
    expect(portfolioTotals([])).toEqual({investedMinor: 0, currentValueMinor: 0});
  });
});

describe('allocationByType', () => {
  it('groups current value by type with fractions, sorted desc', () => {
    const shares = allocationByType([
      makeInvestment({id: 'a', type: 'stocks', currentValueMinor: 30_000}),
      makeInvestment({id: 'b', type: 'mutual_fund', currentValueMinor: 50_000}),
      makeInvestment({id: 'c', type: 'stocks', currentValueMinor: 20_000}),
    ]);
    // Equal totals keep first-seen order (stable sort).
    expect(shares).toEqual([
      {type: 'stocks', totalMinor: 50_000, fraction: 0.5, count: 2},
      {type: 'mutual_fund', totalMinor: 50_000, fraction: 0.5, count: 1},
    ]);
  });

  it('omits types with zero current value', () => {
    const shares = allocationByType([
      makeInvestment({id: 'a', type: 'gold', currentValueMinor: 10_000}),
      makeInvestment({id: 'b', type: 'ppf', currentValueMinor: 0}),
    ]);
    expect(shares).toHaveLength(1);
    expect(shares[0].type).toBe('gold');
    expect(shares[0].fraction).toBe(1);
  });

  it('returns an empty list when the portfolio is worthless', () => {
    expect(
      allocationByType([makeInvestment({currentValueMinor: 0})]),
    ).toEqual([]);
  });
});

describe('nextContributionDueAt', () => {
  const now = dayjs('2026-08-04T10:30:00').valueOf();

  it('is null without a monthly contribution or reminder day', () => {
    expect(
      nextContributionDueAt(
        {monthlyContributionMinor: null, reminderDay: 5},
        now,
      ),
    ).toBeNull();
    expect(
      nextContributionDueAt(
        {monthlyContributionMinor: 500_00, reminderDay: null},
        now,
      ),
    ).toBeNull();
  });

  it('lands on the reminder day later this month when it is upcoming', () => {
    const dueAt = nextContributionDueAt(
      {monthlyContributionMinor: 500_00, reminderDay: 15},
      now,
    );
    expect(dayjs(dueAt).format('YYYY-MM-DD')).toBe('2026-08-15');
  });

  it('rolls to next month when the day has passed', () => {
    const dueAt = nextContributionDueAt(
      {monthlyContributionMinor: 500_00, reminderDay: 1},
      now,
    );
    expect(dayjs(dueAt).format('YYYY-MM-DD')).toBe('2026-09-01');
  });

  it('stays today when the reminder day is today', () => {
    const dueAt = nextContributionDueAt(
      {monthlyContributionMinor: 500_00, reminderDay: 4},
      now,
    );
    expect(dayjs(dueAt).format('YYYY-MM-DD')).toBe('2026-08-04');
  });
});

describe('upcomingContributions', () => {
  it('sorts by next due date and skips investments without reminders', () => {
    const now = dayjs('2026-08-04T00:00:00').valueOf();
    const result = upcomingContributions(
      [
        makeInvestment({
          id: 'late',
          monthlyContributionMinor: 100_00,
          reminderDay: 20,
        }),
        makeInvestment({id: 'none'}),
        makeInvestment({
          id: 'early',
          monthlyContributionMinor: 100_00,
          reminderDay: 5,
        }),
      ],
      now,
    );
    expect(result.map(r => r.investment.id)).toEqual(['early', 'late']);
  });
});

describe('upcomingMaturities', () => {
  const now = dayjs('2026-08-04T12:00:00').valueOf();

  it('includes maturities within 90 days, soonest first', () => {
    const in30 = dayjs(now).add(30, 'day').valueOf();
    const in80 = dayjs(now).add(80, 'day').valueOf();
    const in120 = dayjs(now).add(120, 'day').valueOf();
    const result = upcomingMaturities(
      [
        makeInvestment({id: 'far', maturityAt: in120}),
        makeInvestment({id: 'mid', maturityAt: in80}),
        makeInvestment({id: 'soon', maturityAt: in30}),
        makeInvestment({id: 'open'}),
      ],
      now,
    );
    expect(result.map(i => i.id)).toEqual(['soon', 'mid']);
  });

  it('excludes past maturities', () => {
    const yesterday = dayjs(now).subtract(1, 'day').valueOf();
    expect(
      upcomingMaturities([makeInvestment({maturityAt: yesterday})], now),
    ).toEqual([]);
  });
});
