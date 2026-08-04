/**
 * Full-screen lock gate rendered by BootstrapGate when app lock is enabled
 * and the session is locked. Verifies the PIN against the device keychain
 * (src/services/security/applock) — a successful verify flips
 * useAppLockStore, which unmounts this screen.
 *
 * There is deliberately no escape hatch: the hardware back button is
 * consumed while locked, and the app content underneath is hidden from
 * screen readers by the gate container.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {BackHandler, StyleSheet, View} from 'react-native';

import {
  AppScreen,
  Button,
  Input,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  verifyAppLockPin,
} from '../../../services/security/applock';
import {useAppLockStore} from '../../../store/appLockStore';
import {LockIllustration} from './LockIllustration';

export function LockScreen(): React.JSX.Element {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const unlock = useAppLockStore(state => state.unlock);

  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // No bypass via the hardware back button while locked.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, []);

  const onChangePin = useCallback((value: string) => {
    setPin(value.replace(/\D/g, ''));
    setError(null);
  }, []);

  const onUnlock = useCallback(async () => {
    if (pin.length < PIN_MIN_LENGTH || verifying) {
      return;
    }
    setVerifying(true);
    try {
      const ok = await verifyAppLockPin(pin);
      if (ok) {
        unlock();
      } else {
        setError('Incorrect PIN. Try again.');
        setPin('');
      }
    } finally {
      setVerifying(false);
    }
  }, [pin, verifying, unlock]);

  return (
    <AppScreen contentStyle={styles.content}>
      <View style={styles.body}>
        <LockIllustration />
        <Text variant="title" align="center" style={styles.title}>
          PaisaFlow is locked
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          Enter your PIN to continue.
        </Text>
        <Input
          label="PIN"
          value={pin}
          onChangeText={onChangePin}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={PIN_MAX_LENGTH}
          autoFocus
          error={error ?? undefined}
          containerStyle={styles.field}
          inputStyle={styles.pinInput}
          onSubmitEditing={onUnlock}
          accessibilityLabel="App lock PIN"
        />
        <Button
          title="Unlock"
          onPress={onUnlock}
          loading={verifying}
          disabled={pin.length < PIN_MIN_LENGTH}
          fullWidth
          accessibilityLabel="Unlock PaisaFlow"
        />
      </View>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
    },
    body: {
      alignItems: 'stretch',
      gap: theme.spacing.md,
    },
    title: {marginTop: theme.spacing.lg},
    field: {marginTop: theme.spacing.lg},
    pinInput: {textAlign: 'center', letterSpacing: 4},
  });
