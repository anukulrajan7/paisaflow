import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as Keychain from 'react-native-keychain';

import {ThemeProvider} from '../../../design-system/theme';
import {ToastProvider} from '../../../design-system/components';
import {
  hasAppLockPin,
  setAppLockEnabled,
  setAppLockPin,
  verifyAppLockPin,
} from '../../../services/security/applock';
import {useAppLockStore} from '../../../store/appLockStore';
import {AppLockSettingsScreen} from '../screens/AppLockSettingsScreen';

// In-memory app_settings stand-in for the repository singleton.
const mockSettingsStore = new Map<string, string>();

jest.mock('../../../database/repositories', () => ({
  getSettingsRepository: () => ({
    getValue: async (key: string) => mockSettingsStore.get(key) ?? null,
    setValue: async (key: string, value: string) => {
      mockSettingsStore.set(key, value);
    },
  }),
}));

const initialMetrics = {
  frame: {x: 0, y: 0, width: 360, height: 800},
  insets: {top: 0, left: 0, right: 0, bottom: 0},
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <ToastProvider>
          <AppLockSettingsScreen
            navigation={{goBack: jest.fn()} as never}
            route={{key: 'applock-test', name: 'AppLock'} as never}
          />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockSettingsStore.clear();
  (
    Keychain as unknown as {__clearKeychainVault: () => void}
  ).__clearKeychainVault();
  useAppLockStore.setState({
    enabled: null,
    locked: false,
    unlockedThisSession: false,
  });
});

async function enableAppLock(pin = '1234') {
  await setAppLockPin(pin);
  await setAppLockEnabled(true);
}

test('sets a new PIN, surfacing a mismatch as an inline error', async () => {
  const {getByText, getByLabelText, getByRole, queryByLabelText} =
    await renderScreen();

  // Not set: explainer + Set PIN.
  await waitFor(() => expect(getByText('Keep your money private')).toBeTruthy());
  await fireEvent.press(getByRole('button', {name: 'Set PIN'}));

  // New PIN step.
  await waitFor(() => expect(getByLabelText('New PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('New PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Continue'}));

  // Confirm step — mistype.
  await waitFor(() => expect(getByLabelText('Confirm PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('Confirm PIN'), '1235');
  await fireEvent.press(getByRole('button', {name: 'Set PIN'}));

  await waitFor(() =>
    expect(getByText('PINs do not match. Try again.')).toBeTruthy(),
  );
  expect(await hasAppLockPin()).toBe(false);

  // Correct confirmation completes setup.
  await fireEvent.changeText(getByLabelText('Confirm PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Set PIN'}));

  await waitFor(() => expect(getByText('App lock is on')).toBeTruthy());
  expect(await verifyAppLockPin('1234')).toBe(true);
  expect(mockSettingsStore.get('appLockEnabled')).toBe('true');
  expect(useAppLockStore.getState().enabled).toBe(true);
  // Back at the idle state: the PIN entry form is gone.
  expect(queryByLabelText('Confirm PIN')).toBeNull();
});

test('change PIN verifies the current PIN first, then replaces it', async () => {
  await enableAppLock('1234');
  const {getByText, getByLabelText, getByRole} = await renderScreen();

  await waitFor(() => expect(getByText('App lock is on')).toBeTruthy());
  await fireEvent.press(getByRole('button', {name: 'Change PIN'}));

  // Wrong current PIN.
  await waitFor(() => expect(getByLabelText('Current PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('Current PIN'), '0000');
  await fireEvent.press(getByRole('button', {name: 'Continue'}));
  await waitFor(() =>
    expect(getByText('Incorrect PIN. Try again.')).toBeTruthy(),
  );

  // Right current PIN → new PIN → confirm.
  await fireEvent.changeText(getByLabelText('Current PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Continue'}));
  await waitFor(() => expect(getByLabelText('New PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('New PIN'), '4321');
  await fireEvent.press(getByRole('button', {name: 'Continue'}));
  await waitFor(() => expect(getByLabelText('Confirm PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('Confirm PIN'), '4321');
  await fireEvent.press(getByRole('button', {name: 'Change PIN'}));

  await waitFor(() => expect(getByText('App lock is on')).toBeTruthy());
  expect(await verifyAppLockPin('4321')).toBe(true);
  expect(await verifyAppLockPin('1234')).toBe(false);
  expect(mockSettingsStore.get('appLockEnabled')).toBe('true');
});

test('turn off requires the current PIN and clears both keychain and flag', async () => {
  await enableAppLock('1234');
  const {getByText, getByLabelText, getByRole} = await renderScreen();

  await waitFor(() => expect(getByText('App lock is on')).toBeTruthy());
  await fireEvent.press(getByRole('button', {name: 'Turn off app lock'}));

  // Wrong PIN keeps the lock on.
  await waitFor(() => expect(getByLabelText('Current PIN')).toBeTruthy());
  await fireEvent.changeText(getByLabelText('Current PIN'), '0000');
  await fireEvent.press(getByRole('button', {name: 'Turn off app lock'}));
  await waitFor(() =>
    expect(getByText('Incorrect PIN. Try again.')).toBeTruthy(),
  );
  expect(await hasAppLockPin()).toBe(true);

  // Correct PIN turns it off.
  await fireEvent.changeText(getByLabelText('Current PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Turn off app lock'}));

  await waitFor(() =>
    expect(getByText('Keep your money private')).toBeTruthy(),
  );
  expect(await hasAppLockPin()).toBe(false);
  expect(mockSettingsStore.get('appLockEnabled')).toBe('false');
  expect(useAppLockStore.getState().enabled).toBe(false);
});

test('treats a stale enabled flag without a stored PIN as not set', async () => {
  // Flag on, but keychain empty (e.g. keychain wiped) — must not pretend
  // the lock is armed.
  await setAppLockEnabled(true);
  const {getByText} = await renderScreen();

  await waitFor(() =>
    expect(getByText('Keep your money private')).toBeTruthy(),
  );
});
