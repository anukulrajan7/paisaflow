import {dayjs} from '../../../utils/date';
import type {Investment, InvestmentType} from '../types/investment';

/**
 * Pure portfolio math for the investment tracker. No db access, no floats
 * for money — percentages are display-only numbers (never stored).
 */

export interface GainLoss {
  /** currentValueMinor − investedMinor (signed, minor units). */
  amountMinor: number;
  /** Signed percentage, e.g. 12.5 or -4.2; null when invested is 0. */
  percent: number | null;
  isGain: boolean;
}

export function gainLoss(investedMinor: number, currentValueMinor: number): GainLoss {
  const amountMinor = currentValueMinor - investedMinor;
  return {
    amountMinor,
    percent: investedMinor > 0 ? (amountMinor / investedMinor) * 100 : null,
    isGain: amountMinor >= 0,
  };
}

/** Signed totals across a portfolio. */
export function portfolioTotals(investments: ReadonlyArray<Investment>): {
  investedMinor: number;
  currentValueMinor: number;
} {
  let investedMinor = 0;
  let currentValueMinor = 0;
  for (const investment of investments) {
    investedMinor += investment.investedMinor;
    currentValueMinor += investment.currentValueMinor;
  }
  return {investedMinor, currentValueMinor};
}

export interface AllocationShare {
  type: InvestmentType;
  /** Current value attributed to the type, integer minor units. */
  totalMinor: number;
  /** totalMinor / portfolio current value, 0..1 (0 when portfolio is empty). */
  fraction: number;
  count: number;
}

/**
 * Allocation of the portfolio's CURRENT value by investment type,
 * sorted by totalMinor DESC. Types with zero value are omitted.
 */
export function allocationByType(
  investments: ReadonlyArray<Investment>,
): AllocationShare[] {
  const byType = new Map<InvestmentType, {totalMinor: number; count: number}>();
  let grandTotal = 0;
  for (const investment of investments) {
    const entry = byType.get(investment.type) ?? {totalMinor: 0, count: 0};
    entry.totalMinor += investment.currentValueMinor;
    entry.count += 1;
    byType.set(investment.type, entry);
    grandTotal += investment.currentValueMinor;
  }
  return [...byType.entries()]
    .filter(([, entry]) => entry.totalMinor > 0)
    .map(([type, entry]) => ({
      type,
      totalMinor: entry.totalMinor,
      fraction: grandTotal > 0 ? entry.totalMinor / grandTotal : 0,
      count: entry.count,
    }))
    .sort((a, b) => b.totalMinor - a.totalMinor);
}

/**
 * Next contribution due date (epoch ms, start of day) for an investment with
 * a monthly contribution + reminder day: the next `reminderDay`-of-month that
 * is today or in the future. Returns null when no reminder is configured.
 */
export function nextContributionDueAt(
  investment: Pick<Investment, 'monthlyContributionMinor' | 'reminderDay'>,
  now: number,
): number | null {
  if (investment.monthlyContributionMinor == null || investment.reminderDay == null) {
    return null;
  }
  const day = Math.min(Math.max(investment.reminderDay, 1), 28);
  const today = dayjs(now).startOf('day');
  let candidate = today.date(day);
  if (candidate.isBefore(today)) {
    candidate = candidate.add(1, 'month');
  }
  return candidate.valueOf();
}

export interface UpcomingContribution {
  investment: Investment;
  dueAt: number;
}

/** Investments with a contribution reminder, sorted by next due date ASC. */
export function upcomingContributions(
  investments: ReadonlyArray<Investment>,
  now: number,
): UpcomingContribution[] {
  const upcoming: UpcomingContribution[] = [];
  for (const investment of investments) {
    const dueAt = nextContributionDueAt(investment, now);
    if (dueAt != null) {
      upcoming.push({investment, dueAt});
    }
  }
  return upcoming.sort((a, b) => a.dueAt - b.dueAt);
}

const MATURITY_WINDOW_DAYS = 90;

/**
 * Active investments maturing within the next `withinDays` days (default 90),
 * sorted by maturity ASC. Already-past maturities are excluded.
 */
export function upcomingMaturities(
  investments: ReadonlyArray<Investment>,
  now: number,
  withinDays: number = MATURITY_WINDOW_DAYS,
): Investment[] {
  const start = dayjs(now).startOf('day').valueOf();
  const end = dayjs(now).startOf('day').add(withinDays, 'day').valueOf();
  return investments
    .filter(
      investment =>
        investment.maturityAt != null &&
        investment.maturityAt >= start &&
        investment.maturityAt <= end,
    )
    .sort((a, b) => (a.maturityAt ?? 0) - (b.maturityAt ?? 0));
}
