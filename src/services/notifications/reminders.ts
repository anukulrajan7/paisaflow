import notifee, {
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
} from '@notifee/react-native';
import type {TimestampTrigger} from '@notifee/react-native';

import {getSettingsRepository} from '../../database/repositories';
import type {ReminderSetting} from '../../database/repositories';
import {
  EVENING_REMINDER_ID,
  MORNING_REMINDER_ID,
  REMINDER_CHANNEL_ID,
} from './constants';
import {composeReminderBody, fallbackReminderContent} from './compose';
import type {ReminderContent, ReminderKind} from './compose';
import {createReminderResync} from './resync';
import {nextOccurrenceTimestamp} from './time';

async function ensureReminderChannel(): Promise<void> {
  await notifee.createChannel({
    id: REMINDER_CHANNEL_ID,
    name: 'Reminders',
    importance: AndroidImportance.DEFAULT,
  });
}

async function scheduleReminder(
  id: string,
  setting: ReminderSetting,
  content: ReminderContent,
): Promise<void> {
  if (!setting.enabled) {
    return;
  }
  const trigger: TimestampTrigger = {
    type: TriggerType.TIMESTAMP,
    timestamp: nextOccurrenceTimestamp(setting.time),
    repeatFrequency: RepeatFrequency.DAILY,
  };
  await notifee.createTriggerNotification(
    {
      id,
      title: content.title,
      body: content.body,
      // Deep-link target for taps — see app/navigation/notificationNavigation.
      data: {screen: content.screen},
      android: {
        channelId: REMINDER_CHANNEL_ID,
        // Required on Android for press events to be delivered.
        pressAction: {id: 'default'},
      },
    },
    trigger,
  );
}

/** Compose copy from local data; any failure falls back to the static copy. */
async function composeSafely(kind: ReminderKind): Promise<ReminderContent> {
  try {
    return await composeReminderBody(kind);
  } catch {
    return fallbackReminderContent(kind);
  }
}

/**
 * Reschedule morning/evening reminder notifications from persisted settings.
 *
 * Cancels the stable trigger ids first, then re-schedules a daily repeating
 * TimestampTrigger for each enabled reminder at its configured 'HH:mm' (next
 * future occurrence). Disabled reminders are simply left cancelled. If
 * notification permission is not granted, both reminders stay cancelled and
 * nothing is scheduled.
 *
 * The copy is composed from current local data (due payments, salary,
 * investments, savings, spending) at sync time; when nothing applies — or
 * composition fails — the static fallback copy is used instead.
 */
export async function syncRemindersFromSettings(): Promise<void> {
  await ensureReminderChannel();
  await notifee.cancelTriggerNotifications([
    MORNING_REMINDER_ID,
    EVENING_REMINDER_ID,
  ]);

  const settings = getSettingsRepository();
  const [morning, evening] = await Promise.all([
    settings.getMorningReminder(),
    settings.getEveningReminder(),
  ]);

  const permission = await notifee.getNotificationSettings();
  if (permission.authorizationStatus < AuthorizationStatus.AUTHORIZED) {
    return;
  }

  const [morningContent, eveningContent] = await Promise.all([
    composeSafely('morning'),
    composeSafely('evening'),
  ]);

  await scheduleReminder(MORNING_REMINDER_ID, morning, morningContent);
  await scheduleReminder(EVENING_REMINDER_ID, evening, eveningContent);
}

/**
 * Request notification permission (Android 13+ POST_NOTIFICATIONS).
 * Resolves true when notifications are authorized; never throws.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= AuthorizationStatus.AUTHORIZED;
  } catch {
    return false;
  }
}

const resync = createReminderResync(syncRemindersFromSettings);

/**
 * Re-run syncRemindersFromSettings() (debounced, 2s) whenever financial data
 * changes, so scheduled reminder copy tracks recent edits. Idempotent — safe
 * to call from every bootstrap. Never throws; reminder resync is best-effort
 * and must never surface errors to the caller.
 */
export function subscribeReminderSyncToDataChanges(): void {
  resync.subscribe();
}

/** Stop the data-version resync subscription (dev/test hook). */
export function unsubscribeReminderSyncFromDataChanges(): void {
  resync.unsubscribe();
}
