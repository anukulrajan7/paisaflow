import isoWeek from 'dayjs/plugin/isoWeek';

import {dayjs} from '../../../utils/date';
import type {Dayjs} from '../../../utils/date';
import type {ContributionFrequency, SavingsGoal} from '../types/savingsGoal';

/**
 * Pure savings-goal math. No I/O, no hidden Date.now() — `now` is always an
 * explicit parameter so tests stay deterministic. Calendar math goes through
 * dayjs (local timezone), matching the rest of the app (utils/date.ts).
 */

dayjs.extend(isoWeek);

const PERIOD_UNIT: Record<ContributionFrequency, 'day' | 'week' | 'month'> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

/**
 * Goals without a schedule still need a period_key (NOT NULL, UNIQUE with the
 * goal id) — they bucket contributions by day, so at most one ad-hoc
 * contribution per goal per day.
 */
const UNSCHEDULED_FREQUENCY: ContributionFrequency = 'daily';

/** Start of the period containing `at`; weeks follow ISO (Monday start). */
function startOfPeriod(frequency: ContributionFrequency, at: number): Dayjs {
  const d = dayjs(at);
  return frequency === 'weekly'
    ? d.startOf('isoWeek')
    : d.startOf(PERIOD_UNIT[frequency]);
}

/** Period bucket key: 'YYYY-MM-DD' / ISO 'YYYY-Www' / 'YYYY-MM'. */
export function contributionPeriodKey(
  frequency: ContributionFrequency,
  at: number,
): string {
  const d = dayjs(at);
  switch (frequency) {
    case 'daily':
      return d.format('YYYY-MM-DD');
    case 'weekly':
      return `${d.isoWeekYear()}-W${String(d.isoWeek()).padStart(2, '0')}`;
    case 'monthly':
      return d.format('YYYY-MM');
  }
}

/** Key for the goal's own frequency; unscheduled goals bucket by day. */
export function goalPeriodKey(
  goal: Pick<SavingsGoal, 'contributionFrequency'>,
  at: number,
): string {
  return contributionPeriodKey(
    goal.contributionFrequency ?? UNSCHEDULED_FREQUENCY,
    at,
  );
}

/** Start of the period after the one containing `at`. */
export function nextPeriodStart(
  frequency: ContributionFrequency,
  at: number,
): number {
  return startOfPeriod(frequency, at).add(1, PERIOD_UNIT[frequency]).valueOf();
}

/**
 * Contribution periods left until the target date, counting the current one.
 * A target inside the current period (or in the past) leaves exactly 1, so
 * the suggestion becomes the full remaining amount.
 */
export function periodsRemaining(
  frequency: ContributionFrequency,
  now: number,
  targetDate: number,
): number {
  const from = startOfPeriod(frequency, now);
  const to = startOfPeriod(frequency, targetDate);
  const diff = to.diff(from, PERIOD_UNIT[frequency]);
  return Math.max(1, diff + 1);
}

/** Amount still to save; 0 when the goal is reached or overshot. */
export function remainingMinor(
  goal: Pick<SavingsGoal, 'targetMinor' | 'savedMinor'>,
): number {
  return Math.max(0, goal.targetMinor - goal.savedMinor);
}

/** saved / target clamped to [0, 1] for progress display. */
export function progressFraction(
  goal: Pick<SavingsGoal, 'targetMinor' | 'savedMinor'>,
): number {
  if (goal.targetMinor <= 0) {
    return 0;
  }
  return Math.min(Math.max(goal.savedMinor / goal.targetMinor, 0), 1);
}

/** A goal is complete once saved reaches the target. */
export function isGoalComplete(
  goal: Pick<SavingsGoal, 'targetMinor' | 'savedMinor'>,
): boolean {
  return goal.savedMinor >= goal.targetMinor;
}

/**
 * Even split of the remaining amount over the remaining periods
 * (ceil so the goal is reached, not undershot). Null when there is nothing
 * to suggest: goal complete, no target date, or no schedule.
 */
export function suggestedContributionMinor(
  goal: Pick<
    SavingsGoal,
    'targetMinor' | 'savedMinor' | 'contributionFrequency' | 'targetDate'
  >,
  now: number,
): number | null {
  const remaining = remainingMinor(goal);
  if (remaining <= 0) {
    return null;
  }
  if (goal.targetDate === null || goal.contributionFrequency === null) {
    return null;
  }
  const periods = periodsRemaining(
    goal.contributionFrequency,
    now,
    goal.targetDate,
  );
  return Math.ceil(remaining / periods);
}

/**
 * When the next scheduled contribution falls due. Null for unscheduled goals.
 * Before this period is recorded the current period start is returned (i.e.
 * "due now"); afterwards it rolls to the start of the next period.
 */
export function nextContributionDueAt(
  goal: Pick<SavingsGoal, 'contributionFrequency'>,
  now: number,
  hasContributionThisPeriod: boolean,
): number | null {
  const frequency = goal.contributionFrequency;
  if (!frequency) {
    return null;
  }
  return hasContributionThisPeriod
    ? nextPeriodStart(frequency, now)
    : startOfPeriod(frequency, now).valueOf();
}

/** Short cadence label: 'Daily' / 'Weekly' / 'Monthly'; null when unscheduled. */
export function frequencyLabel(
  frequency: ContributionFrequency | null,
): string | null {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return null;
  }
}

/** Lowercase cadence phrase: 'a day' / 'a week' / 'a month'; null when unscheduled. */
export function frequencyAdverb(
  frequency: ContributionFrequency | null,
): string | null {
  switch (frequency) {
    case 'daily':
      return 'a day';
    case 'weekly':
      return 'a week';
    case 'monthly':
      return 'a month';
    default:
      return null;
  }
}

/**
 * Human next-due line for goal cards: 'Due now' while the current period is
 * unrecorded, otherwise 'Next 1 Sep' (year appended when it differs).
 */
export function describeNextContribution(
  goal: Pick<SavingsGoal, 'contributionFrequency'>,
  now: number,
  hasContributionThisPeriod: boolean,
): string | null {
  const dueAt = nextContributionDueAt(goal, now, hasContributionThisPeriod);
  if (dueAt === null) {
    return null;
  }
  if (dueAt <= now) {
    return 'Due now';
  }
  const due = dayjs(dueAt);
  const sameYear = due.year() === dayjs(now).year();
  return `Next ${due.format(sameYear ? 'D MMM' : 'D MMM YYYY')}`;
}
