/** 'HH:mm' 24h local time, e.g. '08:30' (mirrors settingsRepository validation). */
export const REMINDER_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Next future occurrence of a daily 'HH:mm' local time, as a unix timestamp in
 * milliseconds. If the time has already passed (or is exactly now) today, the
 * occurrence is tomorrow.
 *
 * Pure helper — inject `now` for deterministic tests.
 */
export function nextOccurrenceTimestamp(time: string, now: Date = new Date()): number {
  if (!REMINDER_TIME_PATTERN.test(time)) {
    throw new Error(`Invalid reminder time '${time}', expected 'HH:mm'`);
  }
  const [hours, minutes] = time.split(':').map(Number);
  const next = new Date(now.getTime());
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= now.getTime()) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime();
}
