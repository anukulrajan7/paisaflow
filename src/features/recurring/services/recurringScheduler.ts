import {dayjs} from '../../../utils/date';
import type {RecurringFrequency, RecurringRule} from '../types/recurringRule';

/**
 * Pure scheduling helpers for recurring rules. No I/O, no Date.now() hidden
 * inside — `now` is always an explicit parameter so tests stay deterministic.
 * All math is calendar-aware via dayjs (local timezone), matching the rest of
 * the app (utils/date.ts).
 */

const DAYJS_UNIT: Record<RecurringFrequency, 'day' | 'week' | 'month' | 'year'> =
  {
    daily: 'day',
    weekly: 'week',
    monthly: 'month',
    yearly: 'year',
  };

/**
 * The occurrence after `from`, one period later (`interval` days / weeks /
 * months / years). Time-of-day is preserved. Monthly/yearly additions keep the
 * day-of-month, clamped to the target month's length (Jan 31 → Feb 28/29,
 * Feb 29 → Feb 28) — that is dayjs' native add() behavior.
 */
export function computeNextDueAt(
  from: number,
  frequency: RecurringFrequency,
  interval: number,
): number {
  if (!Number.isSafeInteger(interval) || interval <= 0) {
    throw new Error('interval must be a positive integer');
  }
  if (!Number.isFinite(from)) {
    throw new Error('from must be a valid epoch-ms timestamp');
  }
  return dayjs(from).add(interval, DAYJS_UNIT[frequency]).valueOf();
}

/**
 * Active rules whose next occurrence is due at or before `now`
 * (next_due_at <= now), oldest due date first.
 */
export function listDueRules(
  rules: ReadonlyArray<RecurringRule>,
  now: number,
): RecurringRule[] {
  return rules
    .filter(rule => rule.isActive && rule.nextDueAt <= now)
    .sort((a, b) => a.nextDueAt - b.nextDueAt);
}

/** Overdue = the due day has fully passed (due date before today). */
export function isOverdue(nextDueAt: number, now: number): boolean {
  return nextDueAt < dayjs(now).startOf('day').valueOf();
}

/** Whole calendar days between the due date and today; 0 when not overdue. */
export function overdueDays(nextDueAt: number, now: number): number {
  if (!isOverdue(nextDueAt, now)) {
    return 0;
  }
  return dayjs(now)
    .startOf('day')
    .diff(dayjs(nextDueAt).startOf('day'), 'day');
}

/** 1st, 2nd, 3rd, 4th… (11th/12th/13th are the teens exception). */
export function ordinal(day: number): string {
  const teens = day % 100;
  if (teens >= 11 && teens <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/**
 * Short schedule label anchored on the rule's next due date, e.g.
 * 'Daily', 'Every 3 days', 'Weekly · Mon', 'Monthly · 5th', 'Yearly · 15 Aug'.
 */
export function frequencyLabel(
  rule: Pick<RecurringRule, 'frequency' | 'intervalCount' | 'nextDueAt'>,
): string {
  const {frequency, intervalCount} = rule;
  const due = dayjs(rule.nextDueAt);
  switch (frequency) {
    case 'daily':
      return intervalCount === 1 ? 'Daily' : `Every ${intervalCount} days`;
    case 'weekly':
      return intervalCount === 1
        ? `Weekly · ${due.format('ddd')}`
        : `Every ${intervalCount} weeks · ${due.format('ddd')}`;
    case 'monthly':
      return intervalCount === 1
        ? `Monthly · ${ordinal(due.date())}`
        : `Every ${intervalCount} months · ${ordinal(due.date())}`;
    case 'yearly':
      return intervalCount === 1
        ? `Yearly · ${due.format('D MMM')}`
        : `Every ${intervalCount} years · ${due.format('D MMM')}`;
  }
}

/**
 * Human next-due description: 'Overdue by 3 days', 'Due today',
 * 'Due tomorrow', 'Due 5 Sep' (year appended when it differs from now's).
 */
export function describeNextDue(nextDueAt: number, now: number): string {
  const overdueBy = overdueDays(nextDueAt, now);
  if (overdueBy > 0) {
    return overdueBy === 1 ? 'Overdue by 1 day' : `Overdue by ${overdueBy} days`;
  }
  const due = dayjs(nextDueAt);
  const today = dayjs(now).startOf('day');
  if (due.isBefore(today.add(1, 'day'))) {
    return 'Due today';
  }
  if (due.isBefore(today.add(2, 'day'))) {
    return 'Due tomorrow';
  }
  const sameYear = due.year() === dayjs(now).year();
  return `Due ${due.format(sameYear ? 'D MMM' : 'D MMM YYYY')}`;
}
