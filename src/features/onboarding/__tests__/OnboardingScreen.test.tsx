import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ThemeProvider} from '../../../design-system/theme';
import {getSettingsRepository} from '../../../database/repositories';
import type {SettingsRepository} from '../../../database/repositories/interfaces';
import {
  requestNotificationPermission,
  syncRemindersFromSettings,
} from '../../../services/notifications';
import {markOnboardingComplete} from '../../../app/bootstrap/onboarding';
import {OnboardingScreen} from '../screens/OnboardingScreen';

jest.mock('../../../services/notifications', () => ({
  requestNotificationPermission: jest.fn(() => Promise.resolve(true)),
  syncRemindersFromSettings: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../app/bootstrap/onboarding', () => ({
  markOnboardingComplete: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../../database/repositories', () => ({
  getSettingsRepository: jest.fn(),
}));

const mockRequestPermission =
  requestNotificationPermission as jest.MockedFunction<
    typeof requestNotificationPermission
  >;
const mockSyncReminders = syncRemindersFromSettings as jest.MockedFunction<
  typeof syncRemindersFromSettings
>;
const mockMarkComplete = markOnboardingComplete as jest.MockedFunction<
  typeof markOnboardingComplete
>;
const mockGetSettings = getSettingsRepository as jest.MockedFunction<
  typeof getSettingsRepository
>;

type MockSettings = Pick<
  SettingsRepository,
  | 'setCurrency'
  | 'setBudgetCycleStartDay'
  | 'setThemePreference'
  | 'setMorningReminder'
  | 'setEveningReminder'
>;

let settings: jest.Mocked<MockSettings>;

const initialMetrics = {
  frame: {x: 0, y: 0, width: 360, height: 800},
  insets: {top: 0, left: 0, right: 0, bottom: 0},
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <OnboardingScreen
          navigation={{} as never}
          route={{key: 'onboarding-test', name: 'Onboarding'} as never}
        />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  settings = {
    setCurrency: jest.fn(() => Promise.resolve()),
    setBudgetCycleStartDay: jest.fn(() => Promise.resolve()),
    setThemePreference: jest.fn(() => Promise.resolve()),
    setMorningReminder: jest.fn(() => Promise.resolve()),
    setEveningReminder: jest.fn(() => Promise.resolve()),
  } as unknown as jest.Mocked<MockSettings>;
  mockGetSettings.mockReturnValue(settings as unknown as SettingsRepository);
});

test('completes the 3-step flow and persists all settings', async () => {
  const {getByText, getByRole, getByLabelText} = await renderScreen();

  // Step 1 — welcome
  expect(getByText('Welcome to PaisaFlow')).toBeTruthy();
  await fireEvent.press(getByRole('button', {name: 'Continue'}));

  // Step 2 — preferences (defaults kept, theme switched to dark)
  await fireEvent.press(getByRole('button', {name: 'Dark'}));
  await fireEvent.press(getByRole('button', {name: 'Next'}));

  // Step 3 — reminders: evening off, permission granted
  await fireEvent(getByLabelText('Evening reminder'), 'onValueChange', false);
  await fireEvent.press(getByRole('button', {name: 'Allow notifications'}));
  await fireEvent.press(getByRole('button', {name: 'Finish setup'}));

  await waitFor(() => expect(mockMarkComplete).toHaveBeenCalledTimes(1));

  expect(settings.setCurrency).toHaveBeenCalledWith('INR');
  expect(settings.setBudgetCycleStartDay).toHaveBeenCalledWith(1);
  expect(settings.setThemePreference).toHaveBeenCalledWith('dark');
  expect(settings.setMorningReminder).toHaveBeenCalledWith({
    enabled: true,
    time: '08:30',
  });
  expect(settings.setEveningReminder).toHaveBeenCalledWith({
    enabled: false,
    time: '20:30',
  });
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  expect(mockSyncReminders).toHaveBeenCalledTimes(1);
});

test('completes even when notification permission is denied', async () => {
  mockRequestPermission.mockResolvedValueOnce(false);
  const {getByText, getByRole} = await renderScreen();

  await fireEvent.press(getByRole('button', {name: 'Continue'}));
  await fireEvent.press(getByRole('button', {name: 'Next'}));
  await fireEvent.press(getByRole('button', {name: 'Allow notifications'}));

  await waitFor(() =>
    expect(getByText(/you can enable it later from Settings/)).toBeTruthy(),
  );

  await fireEvent.press(getByRole('button', {name: 'Finish setup'}));

  await waitFor(() => expect(mockMarkComplete).toHaveBeenCalledTimes(1));
});
