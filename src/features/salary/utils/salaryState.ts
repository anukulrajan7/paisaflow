import {dayjs} from '../../../utils/date';
import type {Dayjs} from '../../../utils/date';
import type {SalaryConfig, SalaryRecord, SalaryState} from '../types/salary';

/** 'YYYY-MM' period key for the calendar month containing `date`. */
export function periodKeyFor(date: Dayjs | number | Date): string {
  return dayjs(date).format('YYYY-MM');
}

/** Long label for a period key, e.g. 'June 2025'. */
export function periodLabel(periodKey: string): string {
  return dayjs(`${periodKey}-01`).format('MMMM YYYY');
}

/** Ordinal for a day of month: 1 -> '1st', 2 -> '2nd', 11 -> '11th', 23 -> '23rd'. */
export function ordinal(day: number): string {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) {
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
 * Display state of a salary period:
 * - a record decides the state outright (credited / partial / bonus / delayed)
 * - without a record the period is 'delayed' once today's day-of-month passes
 *   the configured expected day, otherwise it is still 'expected'.
 *
 * Pure — pass a single `today` snapshot so a render stays consistent.
 */
export function salaryStateFor(
  config: Pick<SalaryConfig, 'expectedDay'>,
  record: Pick<SalaryRecord, 'status'> | null,
  today: Dayjs | number | Date,
): SalaryState {
  if (record) {
    return record.status;
  }
  return dayjs(today).date() > config.expectedDay ? 'delayed' : 'expected';
}
