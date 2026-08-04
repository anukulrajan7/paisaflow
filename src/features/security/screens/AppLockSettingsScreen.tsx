/**
 * App-lock settings: turn the PIN lock on (new PIN + confirm), change the
 * PIN (current PIN first), or turn it off (current PIN first). The PIN lives
 * in the device keychain via src/services/security/applock — never in the
 * database — while the on/off flag is persisted in app_settings.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, ShieldCheck} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  Card,
  IconButton,
  Input,
  LoadingState,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  deleteAppLockPin,
  hasAppLockPin,
  isAppLockEnabled,
  setAppLockEnabled,
  setAppLockPin,
  validatePin,
  verifyAppLockPin,
} from '../../../services/security/applock';
import {useAppLockStore} from '../../../store/appLockStore';
import {LockIllustration} from '../components/LockIllustration';

type Props = NativeStackScreenProps<SettingsStackParamList, 'AppLock'>;

type Step =
  | {name: 'idle'}
  | {name: 'currentPin'; flow: 'change' | 'disable'}
  | {name: 'newPin'; flow: 'set' | 'change'}
  | {name: 'confirmPin'; flow: 'set' | 'change'; newPin: string};

export function AppLockSettingsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const setEnabled = useAppLockStore(state => state.setEnabled);

  /** null while the persisted state is being read. */
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>({name: 'idle'});
  const [pin, setPinInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Both must agree: a missing PIN with a stale "on" flag would gate the
      // app behind an unverifiable lock, so treat that as "not set".
      const [enabled, hasPin] = await Promise.all([
        isAppLockEnabled(),
        hasAppLockPin(),
      ]);
      if (!cancelled) {
        setPinSet(enabled && hasPin);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onChangePin = useCallback((value: string) => {
    setPinInput(value.replace(/\D/g, ''));
    setError(null);
  }, []);

  const goIdle = useCallback(() => {
    setStep({name: 'idle'});
    setPinInput('');
    setError(null);
  }, []);

  const startFlow = useCallback((flow: 'set' | 'change' | 'disable') => {
    setPinInput('');
    setError(null);
    setStep(
      flow === 'set'
        ? {name: 'newPin', flow}
        : {name: 'currentPin', flow},
    );
  }, []);

  const onSubmit = useCallback(async () => {
    if (busy) {
      return;
    }
    switch (step.name) {
      case 'currentPin': {
        setBusy(true);
        try {
          const ok = await verifyAppLockPin(pin);
          if (!ok) {
            setError('Incorrect PIN. Try again.');
            setPinInput('');
            return;
          }
          if (step.flow === 'disable') {
            await deleteAppLockPin();
            await setAppLockEnabled(false);
            setEnabled(false);
            setPinSet(false);
            goIdle();
            showToast('App lock turned off.', {type: 'info'});
          } else {
            setPinInput('');
            setError(null);
            setStep({name: 'newPin', flow: 'change'});
          }
        } finally {
          setBusy(false);
        }
        return;
      }
      case 'newPin': {
        const validationError = validatePin(pin);
        if (validationError) {
          setError(validationError);
          return;
        }
        setPinInput('');
        setError(null);
        setStep({name: 'confirmPin', flow: step.flow, newPin: pin});
        return;
      }
      case 'confirmPin': {
        if (pin !== step.newPin) {
          setError('PINs do not match. Try again.');
          setPinInput('');
          return;
        }
        setBusy(true);
        try {
          await setAppLockPin(step.newPin);
          await setAppLockEnabled(true);
          setEnabled(true);
          setPinSet(true);
          goIdle();
          showToast(
            step.flow === 'set' ? 'App lock is on.' : 'PIN updated.',
            {type: 'success'},
          );
        } catch (saveError) {
          setError(
            saveError instanceof Error
              ? saveError.message
              : 'Could not save the PIN. Please try again.',
          );
        } finally {
          setBusy(false);
        }
        return;
      }
      case 'idle':
        return;
    }
  }, [busy, step, pin, setEnabled, goIdle, showToast]);

  const submitTitle =
    step.name === 'confirmPin'
      ? step.flow === 'set'
        ? 'Set PIN'
        : 'Change PIN'
      : step.name === 'currentPin' && step.flow === 'disable'
        ? 'Turn off app lock'
        : 'Continue';

  return (
    <AppScreen>
      <AppHeader
        title="App lock"
        left={
          <IconButton
            icon={ArrowLeft}
            accessibilityLabel="Back"
            onPress={() => navigation.goBack()}
          />
        }
      />
      {pinSet === null ? (
        <View style={styles.center}>
          <LoadingState />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {paddingHorizontal: theme.spacing.lg},
          ]}
          keyboardShouldPersistTaps="handled">
          {step.name === 'idle' ? (
            pinSet ? (
              <Card>
                <View style={styles.statusRow}>
                  <ShieldCheck size={20} color={theme.colors.success} />
                  <Text
                    variant="bodyMedium"
                    color="success"
                    style={styles.statusText}>
                    App lock is on
                  </Text>
                </View>
                <Text
                  variant="caption"
                  color="textSecondary"
                  style={styles.cardHint}>
                  PaisaFlow asks for your PIN when you open it, and again after
                  it has been in the background for more than 30 seconds.
                </Text>
                <View style={styles.buttonRow}>
                  <Button
                    title="Change PIN"
                    onPress={() => startFlow('change')}
                    variant="secondary"
                    size="sm"
                  />
                  <Button
                    title="Turn off"
                    onPress={() => startFlow('disable')}
                    variant="danger"
                    size="sm"
                    accessibilityLabel="Turn off app lock"
                  />
                </View>
              </Card>
            ) : (
              <>
                <View style={styles.hero}>
                  <LockIllustration />
                </View>
                <Card>
                  <Text variant="bodyMedium">Keep your money private</Text>
                  <Text
                    variant="body"
                    color="textSecondary"
                    style={styles.cardHint}>
                    Require a {PIN_MIN_LENGTH}–{PIN_MAX_LENGTH} digit PIN to
                    open PaisaFlow. The PIN never leaves this device — it is
                    stored in the system keychain, not in the app&apos;s data.
                  </Text>
                  <Text
                    variant="caption"
                    color="textMuted"
                    style={styles.cardHint}>
                    There is no recovery: if you forget the PIN, you will need
                    to reinstall the app.
                  </Text>
                  <Button
                    title="Set PIN"
                    onPress={() => startFlow('set')}
                    fullWidth
                    style={styles.cta}
                  />
                </Card>
              </>
            )
          ) : (
            <Card>
              <Text variant="bodyMedium">
                {step.name === 'currentPin'
                  ? 'Enter your current PIN'
                  : step.name === 'newPin'
                    ? step.flow === 'set'
                      ? 'Choose a PIN'
                      : 'Choose a new PIN'
                    : 'Confirm your PIN'}
              </Text>
              <Input
                label={
                  step.name === 'currentPin'
                    ? 'Current PIN'
                    : step.name === 'newPin'
                      ? 'New PIN'
                      : 'Confirm PIN'
                }
                value={pin}
                onChangeText={onChangePin}
                keyboardType="number-pad"
                secureTextEntry
                maxLength={PIN_MAX_LENGTH}
                autoFocus
                error={error ?? undefined}
                hint={
                  step.name === 'newPin'
                    ? `${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`
                    : undefined
                }
                editable={!busy}
                containerStyle={styles.field}
                inputStyle={styles.pinInput}
                onSubmitEditing={onSubmit}
              />
              <View style={styles.buttonRow}>
                <Button
                  title={submitTitle}
                  onPress={onSubmit}
                  loading={busy}
                  disabled={pin.length < PIN_MIN_LENGTH}
                  size="sm"
                  variant={
                    step.name === 'currentPin' && step.flow === 'disable'
                      ? 'danger'
                      : 'primary'
                  }
                />
                <Button
                  title="Cancel"
                  onPress={goIdle}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                />
              </View>
            </Card>
          )}
        </ScrollView>
      )}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    center: {flex: 1, justifyContent: 'center'},
    scrollContent: {
      paddingBottom: theme.spacing.xxxxl,
      gap: theme.spacing.lg,
    },
    hero: {alignItems: 'center', marginTop: theme.spacing.xl},
    cardHint: {marginTop: theme.spacing.xs},
    field: {marginTop: theme.spacing.md},
    pinInput: {textAlign: 'center', letterSpacing: 4},
    cta: {marginTop: theme.spacing.lg},
    buttonRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    statusText: {flex: 1},
  });
