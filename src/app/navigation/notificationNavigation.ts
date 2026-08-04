import notifee, {EventType} from '@notifee/react-native';
import type {Event} from '@notifee/react-native';

import {
  EVENING_REMINDER_ID,
  MORNING_REMINDER_ID,
} from '../../services/notifications';
import type {ReminderScreenTarget} from '../../services/notifications';
import {navigationRef} from './navigationRef';

/** Values allowed in a notification's data.screen deep-link payload. */
const VALID_TARGETS: ReadonlySet<string> = new Set<ReminderScreenTarget>([
  'Home',
  'AddTransaction',
  'People',
  'Salary',
  'Investments',
  'SavingsGoals',
]);

function navigateToTarget(screen: ReminderScreenTarget): void {
  if (screen === 'Home') {
    navigationRef.navigate('Tabs', {
      screen: 'HomeTab',
      params: {screen: 'Home'},
    });
  } else if (screen === 'AddTransaction') {
    navigationRef.navigate('Tabs', {
      screen: 'AddTab',
      params: {screen: 'AddTransaction'},
    });
  } else {
    // Money-hub screens live in the SettingsStack, nested under SettingsTab.
    navigationRef.navigate('Tabs', {
      screen: 'SettingsTab',
      params: {screen},
    });
  }
}

/**
 * Resolve where a reminder tap should land. New-style notifications carry
 * data.screen; legacy scheduled notifications without a payload keep the old
 * id-based mapping (morning → Home, evening → Add).
 */
function resolveTarget(
  notificationId: string,
  data: unknown,
): ReminderScreenTarget | null {
  const raw = (data as {screen?: unknown} | undefined)?.screen;
  if (typeof raw === 'string' && VALID_TARGETS.has(raw)) {
    return raw as ReminderScreenTarget;
  }
  if (notificationId === MORNING_REMINDER_ID) {
    return 'Home';
  }
  if (notificationId === EVENING_REMINDER_ID) {
    return 'AddTransaction';
  }
  return null;
}

function navigateForReminder(notificationId: string, data?: unknown): void {
  if (!navigationRef.isReady()) {
    return;
  }
  const target = resolveTarget(notificationId, data);
  if (target) {
    navigateToTarget(target);
  }
}

function handleNotificationEvent(event: Event): void {
  if (event.type !== EventType.PRESS) {
    return;
  }
  const notification = event.detail.notification;
  if (notification?.id) {
    navigateForReminder(notification.id, notification.data);
  }
}

/**
 * Handle notification taps while the app is in the foreground. Returns the
 * unsubscribe function.
 */
export function subscribeToNotificationEvents(): () => void {
  return notifee.onForegroundEvent(handleNotificationEvent);
}

/**
 * Handle a cold start from a notification tap. Call once the
 * NavigationContainer reports ready. Never throws.
 */
export async function openFromInitialNotification(): Promise<void> {
  try {
    const initial = await notifee.getInitialNotification();
    const notification = initial?.notification;
    if (notification?.id) {
      navigateForReminder(notification.id, notification.data);
    }
  } catch {
    // Best-effort deep link; a failure must never break app startup.
  }
}
