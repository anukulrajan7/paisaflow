/**
 * Web implementation of daily reminders using the Notification API.
 *
 * Browsers cannot schedule a notification for later without a service
 * worker + push server, which would contradict "no server". So this is
 * honest best-effort: while a PaisaFlow tab is open and permission is
 * granted, timers fire the morning/evening reminders at their configured
 * times (and re-arm for the next day). Closing the tab cancels them. Settings
 * on web say exactly this.
 *
 * Taps dispatch a `paisaflow:reminder` window event that the navigation
 * layer (notificationNavigation.web.ts) turns into a screen change — keeps
 * services independent of the React tree, as on native.
 */
import {getSettingsRepository} from '../../database/repositories';
import type {ReminderSetting} from '../../database/repositories';
import {composeReminderBody, fallbackReminderContent} from './compose';
import type {ReminderContent, ReminderKind, ReminderScreenTarget} from './compose';
import {EVENING_REMINDER_ID, MORNING_REMINDER_ID} from './constants';
import {createReminderResync} from './resync';
import {nextOccurrenceTimestamp} from './time';

export const REMINDER_EVENT = 'paisaflow:reminder';

export interface ReminderEventDetail {
  screen: ReminderScreenTarget;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function isGranted(): boolean {
  return notificationsSupported() && Notification.permission === 'granted';
}

function clearTimers(): void {
  timers.forEach(timer => clearTimeout(timer));
  timers.clear();
}

async function composeSafely(kind: ReminderKind): Promise<ReminderContent> {
  try {
    return await composeReminderBody(kind);
  } catch {
    return fallbackReminderContent(kind);
  }
}

function show(content: ReminderContent): void {
  try {
    const notification = new Notification(content.title, {
      body: content.body,
      tag: content.screen,
      icon: '/favicon.svg',
    });
    notification.onclick = () => {
      window.focus();
      window.dispatchEvent(
        new CustomEvent<ReminderEventDetail>(REMINDER_EVENT, {
          detail: {screen: content.screen},
        }),
      );
      notification.close();
    };
  } catch {
    // Constructing a Notification can throw on some mobile browsers; ignore.
  }
}

function arm(id: string, kind: ReminderKind, setting: ReminderSetting): void {
  if (!setting.enabled) {
    return;
  }
  const delay = Math.max(0, nextOccurrenceTimestamp(setting.time) - Date.now());
  const timer = setTimeout(async () => {
    timers.delete(id);
    if (isGranted()) {
      show(await composeSafely(kind));
    }
    // Re-arm for tomorrow with fresh copy.
    arm(id, kind, setting);
  }, delay);
  timers.set(id, timer);
}

/**
 * (Re)arm in-tab timers from persisted settings. No-op without permission.
 */
export async function syncRemindersFromSettings(): Promise<void> {
  clearTimers();
  if (!isGranted()) {
    return;
  }
  const settings = getSettingsRepository();
  const [morning, evening] = await Promise.all([
    settings.getMorningReminder(),
    settings.getEveningReminder(),
  ]);
  arm(MORNING_REMINDER_ID, 'morning', morning);
  arm(EVENING_REMINDER_ID, 'evening', evening);
}

/** Ask the browser for notification permission. Never throws. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) {
    return false;
  }
  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

const resync = createReminderResync(syncRemindersFromSettings);

export function subscribeReminderSyncToDataChanges(): void {
  resync.subscribe();
}

export function unsubscribeReminderSyncFromDataChanges(): void {
  resync.unsubscribe();
  clearTimers();
}
