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
  EVENING_REMINDER_COPY,
  EVENING_REMINDER_ID,
  MORNING_REMINDER_COPY,
  MORNING_REMINDER_ID,
  REMINDER_CHANNEL_ID,
} from './constants';
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
  copy: {title: string; body: string},
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
      title: copy.title,
      body: copy.body,
      android: {
        channelId: REMINDER_CHANNEL_ID,
        // Required on Android for press events to be delivered.
        pressAction: {id: 'default'},
      },
    },
    trigger,
  );
}

/**
 * Reschedule morning/evening reminder notifications from persisted settings.
 *
 * Cancels the stable trigger ids first, then re-schedules a daily repeating
 * TimestampTrigger for each enabled reminder at its configured 'HH:mm' (next
 * future occurrence). Disabled reminders are simply left cancelled. If
 * notification permission is not granted, both reminders stay cancelled and
 * nothing is scheduled.
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

  await scheduleReminder(MORNING_REMINDER_ID, morning, MORNING_REMINDER_COPY);
  await scheduleReminder(EVENING_REMINDER_ID, evening, EVENING_REMINDER_COPY);
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
