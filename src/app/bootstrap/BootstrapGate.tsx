import React, {useEffect} from 'react';
import type {ReactNode} from 'react';

import {AppScreen, ErrorState, LoadingState} from '../../design-system/components';
import {useBootstrapStore} from '../../store/bootstrapStore';
import {useOnboardingStore} from '../../store/onboardingStore';
import {runBootstrap} from './bootstrap';
import {loadOnboardingState} from './onboarding';

/**
 * Runs database bootstrap (open → migrate → seed defaults → load settings)
 * before rendering the app. Shows the design-system LoadingState while
 * bootstrapping and ErrorState with retry on failure.
 *
 * Once the database is ready it loads the persisted onboarding flag into
 * useOnboardingStore; children (the RootNavigator, which swaps Onboarding
 * for the tabs based on that flag) only render once the flag is known.
 */
export function BootstrapGate({children}: {children: ReactNode}) {
  const status = useBootstrapStore(state => state.status);
  const errorMessage = useBootstrapStore(state => state.errorMessage);
  const onboardingComplete = useOnboardingStore(state => state.complete);

  useEffect(() => {
    // Fire-and-forget: progress is tracked via useBootstrapStore.
    runBootstrap();
  }, []);

  useEffect(() => {
    if (status === 'ready') {
      loadOnboardingState();
    }
  }, [status]);

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

  return <>{children}</>;
}

const styles = {
  center: {justifyContent: 'center' as const},
};
