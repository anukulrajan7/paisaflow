import {getSettingsRepository} from '../../database/repositories';
import {useOnboardingStore} from '../../store/onboardingStore';

/**
 * Reads the persisted onboarding flag into the in-memory store.
 * Called by BootstrapGate once database bootstrap has succeeded.
 * Falls back to `false` (show onboarding) if the read fails — the flag can
 * always be flipped later, whereas a wrong `true` would lock a new user out
 * of onboarding entirely.
 */
export async function loadOnboardingState(): Promise<void> {
  try {
    const complete = await getSettingsRepository().isOnboardingComplete();
    useOnboardingStore.getState().setOnboardingComplete(complete);
  } catch {
    useOnboardingStore.getState().setOnboardingComplete(false);
  }
}

/**
 * Marks onboarding as completed: persists the flag to SQLite first, then
 * updates the store so RootNavigator swaps Onboarding for the tabs.
 * This is the callback the Onboarding screen invokes on its final step.
 */
export async function markOnboardingComplete(): Promise<void> {
  await getSettingsRepository().setOnboardingComplete(true);
  useOnboardingStore.getState().setOnboardingComplete(true);
}
