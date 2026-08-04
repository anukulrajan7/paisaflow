import notifee from '@notifee/react-native';
import type {Event} from '@notifee/react-native';

import {
  EVENING_REMINDER_ID,
  MORNING_REMINDER_ID,
} from '../../../services/notifications';
import {
  openFromInitialNotification,
  subscribeToNotificationEvents,
} from '../notificationNavigation';

const mockNavigate = jest.fn();
const mockIsReady = jest.fn();

jest.mock('../navigationRef', () => ({
  navigationRef: {
    navigate: (...args: unknown[]) => mockNavigate(...args),
    isReady: () => mockIsReady(),
  },
}));

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    onForegroundEvent: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
  },
  AndroidImportance: {DEFAULT: 3},
  AuthorizationStatus: {NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1},
  EventType: {DISMISSED: 0, PRESS: 1},
  RepeatFrequency: {NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2},
  TriggerType: {TIMESTAMP: 0, INTERVAL: 1},
}));

const mockedNotifee = jest.mocked(notifee);

function pressEvent(id: string, data?: Record<string, unknown>): Event {
  return {
    type: 1, // EventType.PRESS
    detail: {notification: {id, data}},
  } as unknown as Event;
}

function foregroundHandler(): (event: Event) => void {
  subscribeToNotificationEvents();
  const handler = mockedNotifee.onForegroundEvent.mock.calls[0][0];
  return handler;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockIsReady.mockReturnValue(true);
});

describe('notification tap routing', () => {
  it.each([
    ['People'],
    ['Salary'],
    ['Investments'],
    ['SavingsGoals'],
  ] as const)('routes data.screen %s into the Settings tab stack', screen => {
    foregroundHandler()(pressEvent(MORNING_REMINDER_ID, {screen}));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'SettingsTab',
      params: {screen},
    });
  });

  it('routes data.screen Home to the Home tab', () => {
    foregroundHandler()(pressEvent(MORNING_REMINDER_ID, {screen: 'Home'}));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'HomeTab',
      params: {screen: 'Home'},
    });
  });

  it('routes data.screen AddTransaction to the Add tab', () => {
    foregroundHandler()(
      pressEvent(EVENING_REMINDER_ID, {screen: 'AddTransaction'}),
    );
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'AddTab',
      params: {screen: 'AddTransaction'},
    });
  });

  it('keeps the legacy id mapping when no data payload is present', () => {
    const handler = foregroundHandler();
    handler(pressEvent(MORNING_REMINDER_ID));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'HomeTab',
      params: {screen: 'Home'},
    });
    handler(pressEvent(EVENING_REMINDER_ID));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'AddTab',
      params: {screen: 'AddTransaction'},
    });
  });

  it('falls back to the id mapping for an unknown screen value', () => {
    foregroundHandler()(pressEvent(MORNING_REMINDER_ID, {screen: 'Bogus'}));
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'HomeTab',
      params: {screen: 'Home'},
    });
  });

  it('ignores unknown notification ids', () => {
    foregroundHandler()(pressEvent('some-other-notification'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores non-press events', () => {
    foregroundHandler()({
      type: 0, // EventType.DISMISSED
      detail: {notification: {id: MORNING_REMINDER_ID, data: {screen: 'Salary'}}},
    } as unknown as Event);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not navigate before the container is ready', () => {
    mockIsReady.mockReturnValue(false);
    foregroundHandler()(pressEvent(MORNING_REMINDER_ID, {screen: 'Salary'}));
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('openFromInitialNotification', () => {
  it('navigates using the initial notification payload', async () => {
    mockedNotifee.getInitialNotification.mockResolvedValue({
      notification: {id: EVENING_REMINDER_ID, data: {screen: 'SavingsGoals'}},
      pressAction: {id: 'default'},
    } as Awaited<ReturnType<typeof notifee.getInitialNotification>>);

    await openFromInitialNotification();
    expect(mockNavigate).toHaveBeenCalledWith('Tabs', {
      screen: 'SettingsTab',
      params: {screen: 'SavingsGoals'},
    });
  });

  it('does nothing when there is no initial notification', async () => {
    mockedNotifee.getInitialNotification.mockResolvedValue(null);
    await openFromInitialNotification();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('resolves without throwing when the read fails', async () => {
    mockedNotifee.getInitialNotification.mockRejectedValue(new Error('no native'));
    await expect(openFromInitialNotification()).resolves.toBeUndefined();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
