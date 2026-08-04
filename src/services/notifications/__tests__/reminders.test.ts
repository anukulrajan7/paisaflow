import notifee from '@notifee/react-native';

import {
  requestNotificationPermission,
  subscribeReminderSyncToDataChanges,
  syncRemindersFromSettings,
  unsubscribeReminderSyncFromDataChanges,
} from '../index';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {
  EVENING_REMINDER_ID,
  MORNING_REMINDER_ID,
  REMINDER_CHANNEL_ID,
} from '../constants';

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    createChannel: jest.fn(() => Promise.resolve('reminders')),
    cancelTriggerNotifications: jest.fn(() => Promise.resolve()),
    createTriggerNotification: jest.fn(() => Promise.resolve('id')),
    getNotificationSettings: jest.fn(() =>
      Promise.resolve({authorizationStatus: 1}),
    ),
    requestPermission: jest.fn(() =>
      Promise.resolve({authorizationStatus: 1}),
    ),
    onForegroundEvent: jest.fn(() => jest.fn()),
    getInitialNotification: jest.fn(() => Promise.resolve(null)),
  },
  AndroidImportance: {DEFAULT: 3},
  AuthorizationStatus: {NOT_DETERMINED: -1, DENIED: 0, AUTHORIZED: 1},
  EventType: {DISMISSED: 0, PRESS: 1},
  RepeatFrequency: {NONE: -1, HOURLY: 0, DAILY: 1, WEEKLY: 2},
  TriggerType: {TIMESTAMP: 0, INTERVAL: 1},
}));

const mockGetMorningReminder = jest.fn();
const mockGetEveningReminder = jest.fn();

jest.mock('../../../database/repositories', () => ({
  getSettingsRepository: () => ({
    getMorningReminder: mockGetMorningReminder,
    getEveningReminder: mockGetEveningReminder,
  }),
}));

const mockedNotifee = jest.mocked(notifee);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetMorningReminder.mockResolvedValue({enabled: true, time: '08:30'});
  mockGetEveningReminder.mockResolvedValue({enabled: true, time: '20:30'});
  mockedNotifee.getNotificationSettings.mockResolvedValue({
    authorizationStatus: 1,
  } as Awaited<ReturnType<typeof notifee.getNotificationSettings>>);
});

describe('syncRemindersFromSettings', () => {
  it('creates the reminders channel with default importance', async () => {
    await syncRemindersFromSettings();
    expect(mockedNotifee.createChannel).toHaveBeenCalledWith({
      id: REMINDER_CHANNEL_ID,
      name: 'Reminders',
      importance: 3,
    });
  });

  it('always cancels both stable trigger ids before scheduling', async () => {
    await syncRemindersFromSettings();
    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalledWith([
      MORNING_REMINDER_ID,
      EVENING_REMINDER_ID,
    ]);
    const cancelOrder =
      mockedNotifee.cancelTriggerNotifications.mock.invocationCallOrder[0];
    const scheduleOrder =
      mockedNotifee.createTriggerNotification.mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it('schedules daily repeating triggers for enabled reminders', async () => {
    const before = Date.now();
    await syncRemindersFromSettings();
    const after = Date.now();

    expect(mockedNotifee.createTriggerNotification).toHaveBeenCalledTimes(2);

    const [morningNotification, morningTrigger] =
      mockedNotifee.createTriggerNotification.mock.calls[0];
    expect(morningNotification.id).toBe(MORNING_REMINDER_ID);
    expect(morningNotification.title).toBe("Plan today's spending");
    expect(morningNotification.body).toBe(
      'Review yesterday and set an intention for today.',
    );
    expect(morningNotification.android?.channelId).toBe(REMINDER_CHANNEL_ID);
    expect(morningNotification.android?.pressAction).toEqual({id: 'default'});
    expect(morningTrigger).toMatchObject({type: 0, repeatFrequency: 1});
    const morningTs = (morningTrigger as {timestamp: number}).timestamp;
    expect(morningTs).toBeGreaterThan(before);
    expect(morningTs).toBeLessThanOrEqual(after + 24 * 60 * 60 * 1000);

    const [eveningNotification] =
      mockedNotifee.createTriggerNotification.mock.calls[1];
    expect(eveningNotification.id).toBe(EVENING_REMINDER_ID);
    expect(eveningNotification.title).toBe("Review today's expenses");
    expect(eveningNotification.body).toBe(
      "Add anything you missed and check today's summary.",
    );
  });

  it('only cancels disabled reminders without rescheduling them', async () => {
    mockGetMorningReminder.mockResolvedValue({enabled: false, time: '08:30'});
    mockGetEveningReminder.mockResolvedValue({enabled: true, time: '20:30'});

    await syncRemindersFromSettings();

    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalledWith([
      MORNING_REMINDER_ID,
      EVENING_REMINDER_ID,
    ]);
    expect(mockedNotifee.createTriggerNotification).toHaveBeenCalledTimes(1);
    expect(
      mockedNotifee.createTriggerNotification.mock.calls[0][0].id,
    ).toBe(EVENING_REMINDER_ID);
  });

  it('schedules nothing when both reminders are disabled', async () => {
    mockGetMorningReminder.mockResolvedValue({enabled: false, time: '08:30'});
    mockGetEveningReminder.mockResolvedValue({enabled: false, time: '20:30'});

    await syncRemindersFromSettings();

    expect(mockedNotifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('cancels but schedules nothing when permission is denied', async () => {
    mockedNotifee.getNotificationSettings.mockResolvedValue({
      authorizationStatus: 0,
    } as Awaited<ReturnType<typeof notifee.getNotificationSettings>>);

    await syncRemindersFromSettings();

    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalled();
    expect(mockedNotifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('attaches a deep-link screen to each scheduled notification', async () => {
    // The repositories mock yields no reminder content, so composition falls
    // back to the static copy and its default targets.
    await syncRemindersFromSettings();

    const [morningNotification] =
      mockedNotifee.createTriggerNotification.mock.calls[0];
    const [eveningNotification] =
      mockedNotifee.createTriggerNotification.mock.calls[1];
    expect(morningNotification.data).toEqual({screen: 'Home'});
    expect(eveningNotification.data).toEqual({screen: 'AddTransaction'});
  });
});

describe('subscribeReminderSyncToDataChanges', () => {
  afterEach(() => {
    unsubscribeReminderSyncFromDataChanges();
    jest.useRealTimers();
  });

  it('re-runs the sync once, debounced, after data changes', async () => {
    jest.useFakeTimers();
    subscribeReminderSyncToDataChanges();

    useDataVersionStore.getState().bumpDataVersion();
    useDataVersionStore.getState().bumpDataVersion();
    expect(mockedNotifee.cancelTriggerNotifications).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalledTimes(1);
    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalledWith([
      MORNING_REMINDER_ID,
      EVENING_REMINDER_ID,
    ]);
  });

  it('is idempotent — a second subscribe does not double-sync', async () => {
    jest.useFakeTimers();
    subscribeReminderSyncToDataChanges();
    subscribeReminderSyncToDataChanges();

    useDataVersionStore.getState().bumpDataVersion();
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockedNotifee.cancelTriggerNotifications).toHaveBeenCalledTimes(1);
  });
});

describe('requestNotificationPermission', () => {
  it('returns true when authorization is granted', async () => {
    mockedNotifee.requestPermission.mockResolvedValue({
      authorizationStatus: 1,
    } as Awaited<ReturnType<typeof notifee.requestPermission>>);
    await expect(requestNotificationPermission()).resolves.toBe(true);
  });

  it('returns false when authorization is denied', async () => {
    mockedNotifee.requestPermission.mockResolvedValue({
      authorizationStatus: 0,
    } as Awaited<ReturnType<typeof notifee.requestPermission>>);
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });

  it('returns false instead of throwing when the request fails', async () => {
    mockedNotifee.requestPermission.mockRejectedValue(new Error('no native'));
    await expect(requestNotificationPermission()).resolves.toBe(false);
  });
});
