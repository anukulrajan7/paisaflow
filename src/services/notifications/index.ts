/**
 * Notifications service: daily reminder scheduling, permission requests, and
 * tap handling. Reminders only nudge the user — they never promise or trigger
 * AI generation.
 */

export {
  syncRemindersFromSettings,
  requestNotificationPermission,
} from './reminders';
export {
  REMINDER_CHANNEL_ID,
  MORNING_REMINDER_ID,
  EVENING_REMINDER_ID,
} from './constants';
export {nextOccurrenceTimestamp, REMINDER_TIME_PATTERN} from './time';
