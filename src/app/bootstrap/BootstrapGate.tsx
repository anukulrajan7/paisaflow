import React, {useEffect, useRef} from 'react';
import type {ReactNode} from 'react';
import {AppState, StyleSheet, View} from 'react-native';
import type {AppStateStatus} from 'react-native';

import {AppScreen, ErrorState, LoadingState} from '../../design-system/components';
import {LockScreen} from '../../features/security/components/LockScreen';
import {
  hasAppLockPin,
  isAppLockEnabled,
} from '../../services/security/applock';
import {useAppLockStore} from '../../store/appLockStore';
import {useBootstrapStore} from '../../store/bootstrapStore';
import {useOnboardingStore} from '../../store/onboardingStore';
import {runBootstrap} from './bootstrap';
import {loadOnboardingState} from './onboarding';

/** Re-lock once the app has spent at least this long in the background. */
const RELOCK_AFTER_MS = 30_000;

/**
 * Runs database bootstrap (open → migrate → seed defaults → load settings)
 * before rendering the app. Shows the design-system LoadingState while
 * bootstrapping and ErrorState with retry on failure.
 *
 * Once the database is ready it loads the persisted onboarding flag into
 * useOnboardingStore; children (the RootNavigator, which swaps Onboarding
 * for the tabs based on that flag) only render once the flag is known.
 *
 * App lock: when onboarding is complete, the persisted app-lock flag is
 * resolved before children render (so locked users never see a flash of
 * their data). First-run users heading into onboarding are never gated.
 * When the lock is enabled, AppLockGate wraps children and shows the
 * LockScreen whenever the session is locked.
 */
export function BootstrapGate({children}: {children: ReactNode}) {
  const status = useBootstrapStore(state => state.status);
  const errorMessage = useBootstrapStore(state => state.errorMessage);
  const onboardingComplete = useOnboardingStore(state => state.complete);
  const appLockEnabled = useAppLockStore(state => state.enabled);

  useEffect(() => {
    // Fire-and-forget: progress is tracked via useBootstrapStore.
    runBootstrap();
  }, []);

  useEffect(() => {
    if (status === 'ready') {
      loadOnboardingState();
    }
  }, [status]);

  useEffect(() => {
    if (status !== 'ready' || onboardingComplete !== true) {
      return;
    }
    let cancelled = false;
    (async () => {
      // Require a stored PIN as well as the flag: a wiped keychain with a
      // stale "on" flag must not gate the app behind an unverifiable lock.
      const enabled = await isAppLockEnabled();
      const hasPin = enabled ? await hasAppLockPin() : false;
      if (cancelled) {
        return;
      }
      const {setEnabled, unlockedThisSession, lock} =
        useAppLockStore.getState();
      setEnabled(enabled && hasPin);
      if (enabled && hasPin && !unlockedThisSession) {
        lock();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, onboardingComplete]);

  if (status === 'loading') {
    return (
      <AppScreen style={styles.center}>
        <LoadingState message="Preparing your data…" />
      </AppScreen>
    );
  }

  if (status === 'error') {
    return (
      <AppScreen style={styles.center}>
        <ErrorState
          title="Couldn't start PaisaFlow"
          message={errorMessage ?? 'The local database failed to initialize.'}
          onRetry={() => runBootstrap()}
        />
      </AppScreen>
    );
  }

  if (onboardingComplete === null) {
    // Bootstrap done; onboarding flag read still in flight.
    return (
      <AppScreen style={styles.center}>
        <LoadingState />
      </AppScreen>
    );
  }

  if (onboardingComplete && appLockEnabled === null) {
    // Onboarding is done; app-lock flag read still in flight. Do not render
    // children yet — a locked user must never see their data flash by.
    return (
      <AppScreen style={styles.center}>
        <LoadingState />
      </AppScreen>
    );
  }

  if (onboardingComplete && appLockEnabled) {
    return <AppLockGate>{children}</AppLockGate>;
  }

  return <>{children}</>;
}

/**
 * Wraps the app while app lock is enabled. Children stay mounted (so
 * navigation state survives a re-lock) but are covered by the LockScreen
 * and hidden from screen readers whenever the session is locked. Re-locks
 * when the app returns to the foreground after 30s+ in the background.
 */
function AppLockGate({children}: {children: ReactNode}) {
  const locked = useAppLockStore(state => state.locked);
  const backgroundedAt = useRef<number | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background') {
          backgroundedAt.current = Date.now();
          return;
        }
        if (nextState === 'active') {
          const at = backgroundedAt.current;
          backgroundedAt.current = null;
          if (at != null && Date.now() - at >= RELOCK_AFTER_MS) {
            useAppLockStore.getState().lock();
          }
        }
      },
    );
    return () => subscription.remove();
  }, []);

  return (
    <View style={styles.flex}>
      <View
        style={styles.flex}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}>
        {children}
      </View>
      {locked ? (
        <View style={styles.lockOverlay}>
          <LockScreen />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {justifyContent: 'center'},
  flex: {flex: 1},
  lockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
