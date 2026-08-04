import {create} from 'zustand';

interface AppLockState {
  /**
   * Whether app lock is turned on (mirror of the persisted app_settings
   * flag). `null` until BootstrapGate has read it — consumers must treat
   * `null` as "unknown, keep waiting" (same contract as the onboarding flag).
   * Written by BootstrapGate at startup and by the app-lock settings screen
   * when the user turns the lock on or off.
   */
  enabled: boolean | null;
  /** Whether the lock screen is currently showing. */
  locked: boolean;
  /**
   * Whether the user has unlocked the app at least once since launch. Gates
   * the initial lock so the PIN is only demanded once per cold start; the
   * background re-lock relies on `locked` instead.
   */
  unlockedThisSession: boolean;
  setEnabled: (enabled: boolean) => void;
  lock: () => void;
  unlock: () => void;
}

/**
 * UI/session-only state for the app-lock gate. The PIN itself never enters
 * this store — it lives in the device keychain (src/services/security).
 */
export const useAppLockStore = create<AppLockState>(set => ({
  enabled: null,
  locked: false,
  unlockedThisSession: false,
  setEnabled: enabled => set({enabled}),
  lock: () => set({locked: true}),
  unlock: () => set({locked: false, unlockedThisSession: true}),
}));
