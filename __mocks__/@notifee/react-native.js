/**
 * Jest stub for the native @notifee/react-native module.
 * Auto-applied to any test that (transitively) imports the real module —
 * e.g. rendering <App/>, where OnboardingScreen imports
 * src/services/notifications. Everything resolves to inert values;
 * permission reads report "authorized".
 */
const AndroidImportance = {NONE: 0, MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4};
const AuthorizationStatus = {
  NOT_DETERMINED: -1,
  DENIED: 0,
  AUTHORIZED: 1,
  PROVISIONAL: 2,
  EPHEMERAL: 3,
};
const RepeatFrequency = {NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2};
const TriggerType = {TIMESTAMP: 0, INTERVAL: 1, CALENDAR: 2};

const authorized = {authorizationStatus: AuthorizationStatus.AUTHORIZED};

const notifee = {
  createChannel: async () => ({}),
  createTriggerNotification: async () => ({}),
  cancelNotification: async () => {},
  cancelTriggerNotifications: async () => {},
  getNotificationSettings: async () => authorized,
  requestPermission: async () => authorized,
  getInitialNotification: async () => null,
  onForegroundEvent: () => () => {},
  onBackgroundEvent: () => {},
};

module.exports = {
  __esModule: true,
  default: notifee,
  AndroidImportance,
  AuthorizationStatus,
  RepeatFrequency,
  TriggerType,
};
