import React from 'react';
import {act, fireEvent, render, waitFor} from '@testing-library/react-native';
import {AppState, Text} from 'react-native';
import type {AppStateStatus} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ThemeProvider} from '../../../design-system/theme';
import {
  hasAppLockPin,
  isAppLockEnabled,
  verifyAppLockPin,
} from '../../../services/security/applock';
import {useAppLockStore} from '../../../store/appLockStore';
import {useBootstrapStore} from '../../../store/bootstrapStore';
import {useOnboardingStore} from '../../../store/onboardingStore';
import {BootstrapGate} from '../BootstrapGate';

// Keep the gate hermetic: no real DB bootstrap or onboarding read.
jest.mock('../bootstrap', () => ({
  runBootstrap: jest.fn(() => Promise.resolve()),
}));
jest.mock('../onboarding', () => ({
  loadOnboardingState: jest.fn(() => Promise.resolve()),
}));

// Stub the persistence-facing functions; keep the real PIN constants.
jest.mock('../../../services/security/applock', () => {
  const actual = jest.requireActual('../../../services/security/applock');
  return {
    ...actual,
    isAppLockEnabled: jest.fn(),
    hasAppLockPin: jest.fn(),
    verifyAppLockPin: jest.fn(),
  };
});

const mockIsEnabled = isAppLockEnabled as jest.MockedFunction<
  typeof isAppLockEnabled
>;
const mockHasPin = hasAppLockPin as jest.MockedFunction<typeof hasAppLockPin>;
const mockVerify = verifyAppLockPin as jest.MockedFunction<
  typeof verifyAppLockPin
>;

const initialMetrics = {
  frame: {x: 0, y: 0, width: 360, height: 800},
  insets: {top: 0, left: 0, right: 0, bottom: 0},
};

function renderGate() {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <BootstrapGate>
          <Text>private money data</Text>
        </BootstrapGate>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useBootstrapStore.setState({status: 'ready', errorMessage: null});
  useOnboardingStore.setState({complete: true});
  useAppLockStore.setState({
    enabled: null,
    locked: false,
    unlockedThisSession: false,
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('renders children without locking when app lock is disabled', async () => {
  mockIsEnabled.mockResolvedValue(false);
  const {getByText, queryByText} = await renderGate();

  await waitFor(() => expect(getByText('private money data')).toBeTruthy());
  expect(queryByText('PaisaFlow is locked')).toBeNull();
  expect(useAppLockStore.getState().enabled).toBe(false);
});

test('gates the app behind the LockScreen until the PIN verifies', async () => {
  mockIsEnabled.mockResolvedValue(true);
  mockHasPin.mockResolvedValue(true);
  mockVerify.mockImplementation(async pin => pin === '1234');

  const {getByText, queryByText, getByLabelText, getByRole} = await renderGate();

  await waitFor(() => expect(getByText('PaisaFlow is locked')).toBeTruthy());
  expect(useAppLockStore.getState().locked).toBe(true);

  // Wrong PIN: error, still locked.
  await fireEvent.changeText(getByLabelText('App lock PIN'), '0000');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));
  await waitFor(() =>
    expect(getByText('Incorrect PIN. Try again.')).toBeTruthy(),
  );
  expect(useAppLockStore.getState().locked).toBe(true);

  // Correct PIN: gate lifts, children visible.
  await fireEvent.changeText(getByLabelText('App lock PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));
  await waitFor(() =>
    expect(queryByText('PaisaFlow is locked')).toBeNull(),
  );
  expect(getByText('private money data')).toBeTruthy();
});

test('a stale enabled flag without a stored PIN does not lock', async () => {
  mockIsEnabled.mockResolvedValue(true);
  mockHasPin.mockResolvedValue(false);
  const {getByText, queryByText} = await renderGate();

  await waitFor(() => expect(getByText('private money data')).toBeTruthy());
  expect(queryByText('PaisaFlow is locked')).toBeNull();
  expect(useAppLockStore.getState().enabled).toBe(false);
});

test('first-run onboarding is never gated', async () => {
  useOnboardingStore.setState({complete: false});
  const {getByText, queryByText} = await renderGate();

  await waitFor(() => expect(getByText('private money data')).toBeTruthy());
  expect(queryByText('PaisaFlow is locked')).toBeNull();
  // The lock flag is not even read for first-run users.
  expect(mockIsEnabled).not.toHaveBeenCalled();
});

test('re-locks after 30s+ in the background, not before', async () => {
  mockIsEnabled.mockResolvedValue(true);
  mockHasPin.mockResolvedValue(true);
  mockVerify.mockResolvedValue(true);

  let now = 1_000_000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener');

  const {getByText, queryByText, getByLabelText, getByRole} = await renderGate();

  await waitFor(() => expect(getByText('PaisaFlow is locked')).toBeTruthy());

  // Unlock the session.
  await fireEvent.changeText(getByLabelText('App lock PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));
  await waitFor(() => expect(queryByText('PaisaFlow is locked')).toBeNull());

  const listener = addEventListenerSpy.mock.calls.find(
    call => call[0] === 'change',
  )?.[1] as unknown as (state: AppStateStatus) => void;
  expect(listener).toBeDefined();

  // Short background stint: no re-lock.
  await act(async () => listener('background'));
  now += 10_000;
  await act(async () => listener('active'));
  expect(useAppLockStore.getState().locked).toBe(false);

  // 30s+ in the background: re-lock on foreground.
  await act(async () => listener('background'));
  now += 31_000;
  await act(async () => listener('active'));
  expect(useAppLockStore.getState().locked).toBe(true);
  await waitFor(() => expect(getByText('PaisaFlow is locked')).toBeTruthy());
});
