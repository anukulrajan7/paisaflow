import notifee, {EventType} from '@notifee/react-native';
import type {Event} from '@notifee/react-native';

import {
  EVENING_REMINDER_ID,
  MORNING_REMINDER_ID,
} from '../../services/notifications';
import {navigationRef} from './navigationRef';

/** Morning reminder opens Home; evening reminder opens the Add tab. */
function navigateForReminder(notificationId: string): void {
  if (!navigationRef.isReady()) {
    return;
  }
  if (notificationId === MORNING_REMINDER_ID) {
    navigationRef.navigate('Tabs', {
      screen: 'HomeTab',
      params: {screen: 'Home'},
    });
  } else if (notificationId === EVENING_REMINDER_ID) {
    navigationRef.navigate('Tabs', {
      screen: 'AddTab',
      params: {screen: 'AddTransaction'},
    });
  }
}

function handleNotificationEvent(event: Event): void {
  if (event.type !== EventType.PRESS) {
    return;
  }
  const notificationId = event.detail.notification?.id;
  if (notificationId) {
    navigateForReminder(notificationId);
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
    const notificationId = initial?.notification?.id;
    if (notificationId) {
      navigateForReminder(notificationId);
    }
  } catch {
    // Best-effort deep link; a failure must never break app startup.
  }
}
