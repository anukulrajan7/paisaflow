import React from 'react';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import * as Keychain from 'react-native-keychain';

import {ThemeProvider} from '../../../design-system/theme';
import {setAppLockPin} from '../../../services/security/applock';
import {useAppLockStore} from '../../../store/appLockStore';
import {LockScreen} from '../components/LockScreen';

const initialMetrics = {
  frame: {x: 0, y: 0, width: 360, height: 800},
  insets: {top: 0, left: 0, right: 0, bottom: 0},
};

function renderLockScreen() {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <LockScreen />
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(async () => {
  (
    Keychain as unknown as {__clearKeychainVault: () => void}
  ).__clearKeychainVault();
  useAppLockStore.setState({
    enabled: true,
    locked: true,
    unlockedThisSession: false,
  });
  await setAppLockPin('1234');
});

test('a wrong PIN shows an error and stays locked', async () => {
  const {getByText, getByLabelText, getByRole} = await renderLockScreen();

  expect(getByText('PaisaFlow is locked')).toBeTruthy();

  await fireEvent.changeText(getByLabelText('App lock PIN'), '9999');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));

  await waitFor(() =>
    expect(getByText('Incorrect PIN. Try again.')).toBeTruthy(),
  );
  const state = useAppLockStore.getState();
  expect(state.locked).toBe(true);
  expect(state.unlockedThisSession).toBe(false);
});

test('the correct PIN unlocks the session', async () => {
  const {getByLabelText, getByRole} = await renderLockScreen();

  await fireEvent.changeText(getByLabelText('App lock PIN'), '1234');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));

  await waitFor(() =>
    expect(useAppLockStore.getState().unlockedThisSession).toBe(true),
  );
  expect(useAppLockStore.getState().locked).toBe(false);
});

test('unlock stays disabled until the PIN reaches minimum length', async () => {
  const {getByLabelText, getByRole, queryByText} = await renderLockScreen();

  await fireEvent.changeText(getByLabelText('App lock PIN'), '12');
  await fireEvent.press(getByRole('button', {name: 'Unlock PaisaFlow'}));

  // Nothing was verified: no error, still locked.
  expect(queryByText('Incorrect PIN. Try again.')).toBeNull();
  expect(useAppLockStore.getState().unlockedThisSession).toBe(false);
});
