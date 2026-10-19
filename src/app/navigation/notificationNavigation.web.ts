/**
 * Web counterpart of notificationNavigation: there are no cold-start
 * notifications in a browser tab, and in-tab reminder taps arrive as a
 * `paisaflow:reminder` window event from services/notifications/reminders.web.
 */
import {REMINDER_EVENT} from '../../services/notifications/reminders.web';
import type {ReminderEventDetail} from '../../services/notifications/reminders.web';
import type {ReminderScreenTarget} from '../../services/notifications';
import {navigationRef} from './navigationRef';

const VALID_TARGETS: ReadonlySet<string> = new Set<ReminderScreenTarget>([
  'Home',
  'AddTransaction',
  'People',
  'Salary',
  'Investments',
  'SavingsGoals',
]);

function navigateToTarget(screen: ReminderScreenTarget): void {
  if (!navigationRef.isReady()) {
    return;
  }
  if (screen === 'Home') {
    navigationRef.navigate('Tabs', {screen: 'HomeTab', params: {screen: 'Home'}});
  } else if (screen === 'AddTransaction') {
    navigationRef.navigate('Tabs', {
      screen: 'AddTab',
      params: {screen: 'AddTransaction'},
    });
  } else {
    navigationRef.navigate('Tabs', {screen: 'SettingsTab', params: {screen}});
  }
}

export function subscribeToNotificationEvents(): () => void {
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<ReminderEventDetail>).detail;
    if (detail && VALID_TARGETS.has(detail.screen)) {
      navigateToTarget(detail.screen);
    }
  };
  window.addEventListener(REMINDER_EVENT, handler);
  return () => window.removeEventListener(REMINDER_EVENT, handler);
}

export async function openFromInitialNotification(): Promise<void> {
  // Nothing to do: a web tab never launches from a notification tap.
}
