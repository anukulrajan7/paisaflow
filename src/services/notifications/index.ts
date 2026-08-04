/**
 * Notifications service: daily reminder scheduling, permission requests, and
 * tap handling. Reminders only nudge the user — they never promise or trigger
 * AI generation. Copy is composed on-device from local data at schedule time.
 */

export {
  syncRemindersFromSettings,
  requestNotificationPermission,
  subscribeReminderSyncToDataChanges,
  unsubscribeReminderSyncFromDataChanges,
} from './reminders';
export {
  composeReminderBody,
  fallbackReminderContent,
  REMINDER_INCLUDE_KEYS,
} from './compose';
export type {
  ReminderContent,
  ReminderIncludeCategory,
  ReminderKind,
  ReminderScreenTarget,
} from './compose';
export {
  REMINDER_CHANNEL_ID,
  MORNING_REMINDER_ID,
  EVENING_REMINDER_ID,
} from './constants';
export {nextOccurrenceTimestamp, REMINDER_TIME_PATTERN} from './time';
