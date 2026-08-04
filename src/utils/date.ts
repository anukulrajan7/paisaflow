import dayjs, {Dayjs} from 'dayjs';

export interface Period {
  /** epoch ms, inclusive */
  start: number;
  /** epoch ms, exclusive */
  end: number;
}

/**
 * Monthly budget-cycle period containing `ref`.
 * `cycleStartDay` is 1..28; the cycle runs from that day of a month
 * to the same day of the next month (exclusive end).
 */
export function monthPeriod(ref: Dayjs, cycleStartDay = 1): Period {
  const day = Math.min(Math.max(cycleStartDay, 1), 28);
  let start = ref.date(day).startOf('day');
  if (ref.isBefore(start)) {
    start = start.subtract(1, 'month');
  }
  const end = start.add(1, 'month');
  return {start: start.valueOf(), end: end.valueOf()};
}

/** Shift a monthly period by n months (negative = past). */
export function shiftMonthPeriod(period: Period, n: number): Period {
  const start = dayjs(period.start).add(n, 'month');
  return {start: start.valueOf(), end: start.add(1, 'month').valueOf()};
}

export function dayPeriod(ref: Dayjs): Period {
  const start = ref.startOf('day');
  return {start: start.valueOf(), end: start.add(1, 'day').valueOf()};
}

export function weekPeriod(ref: Dayjs): Period {
  const start = ref.startOf('week');
  return {start: start.valueOf(), end: start.add(1, 'week').valueOf()};
}

/** List of day starts (epoch ms) covering [start, end). */
export function daysInPeriod(period: Period): number[] {
  const days: number[] = [];
  let cursor = dayjs(period.start).startOf('day');
  const end = dayjs(period.end);
  while (cursor.isBefore(end)) {
    days.push(cursor.valueOf());
    cursor = cursor.add(1, 'day');
  }
  return days;
}

export function formatPeriodLabel(period: Period): string {
  const s = dayjs(period.start);
  const e = dayjs(period.end).subtract(1, 'day');
  if (s.isSame(e, 'month')) {
    return s.format('MMMM YYYY');
  }
  return `${s.format('D MMM')} – ${e.format('D MMM YYYY')}`;
}

export {dayjs};
export type {Dayjs};
