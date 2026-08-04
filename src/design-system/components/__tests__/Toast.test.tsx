import React from 'react';
import {StyleSheet} from 'react-native';
import {fireEvent, render, waitFor} from '@testing-library/react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ThemeProvider} from '../../theme';
import {spacing} from '../../tokens';
import {Button} from '../Button';
import {ToastProvider, useToast} from '../Toast';

const STATUS_BAR = 24;

const initialMetrics = {
  frame: {x: 0, y: 0, width: 360, height: 800},
  insets: {top: STATUS_BAR, left: 0, right: 0, bottom: 34},
};

function Harness() {
  const {showToast} = useToast();
  return (
    <Button
      title="Trigger"
      onPress={() => showToast('Saved', {type: 'success'})}
    />
  );
}

async function renderToast() {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <ToastProvider>
          <Harness />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>,
  );
}

describe('ToastProvider', () => {
  it('shows nothing until a toast is triggered', async () => {
    const {queryByTestId, getByRole} = await renderToast();
    expect(queryByTestId('toast')).toBeNull();

    fireEvent.press(getByRole('button', {name: 'Trigger'}));
    await waitFor(() => expect(queryByTestId('toast')).toBeTruthy());
  });

  it('anchors the toast to the TOP of the screen, below the status bar', async () => {
    const {getByRole, getByTestId} = await renderToast();
    fireEvent.press(getByRole('button', {name: 'Trigger'}));
    await waitFor(() => expect(getByTestId('toast')).toBeTruthy());

    const style = StyleSheet.flatten(getByTestId('toast').props.style);
    expect(style.position).toBe('absolute');
    expect(style.top).toBe(STATUS_BAR + spacing.xl);
    expect(style.bottom).toBeUndefined();
  });

  it('keeps the public API: message, alert role and dismiss button', async () => {
    const {getByText, getByRole, getByLabelText, getByTestId} =
      await renderToast();
    fireEvent.press(getByRole('button', {name: 'Trigger'}));
    await waitFor(() => expect(getByTestId('toast')).toBeTruthy());

    expect(getByText('Saved')).toBeTruthy();
    expect(getByTestId('toast').props.accessibilityRole).toBe('alert');
    expect(getByLabelText('Dismiss notification')).toBeTruthy();
  });
});
