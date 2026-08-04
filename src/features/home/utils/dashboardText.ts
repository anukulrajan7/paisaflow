import type {Dayjs} from '../../../utils/date';

/** Time-of-day greeting for the dashboard header. */
export function greetingFor(date: Dayjs): string {
  const hour = date.hour();
  if (hour < 5) {
    return 'Good evening';
  }
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 17) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

/**
 * Human caption comparing this month's expense total to last month's.
 * Handles the divide-by-zero cases: no previous spending, or none at all.
 */
export function describeExpenseChange(
  currentMinor: number,
  previousMinor: number,
): string {
  if (previousMinor <= 0) {
    return currentMinor > 0
      ? 'No spending last month to compare'
      : 'No spending in either month';
  }
  const percent = Math.round(
    ((currentMinor - previousMinor) / previousMinor) * 100,
  );
  if (percent === 0) {
    return 'Same as last month';
  }
  return percent > 0
    ? `${percent}% more than last month`
    : `${Math.abs(percent)}% less than last month`;
}
