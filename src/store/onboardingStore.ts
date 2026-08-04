import {create} from 'zustand';

interface OnboardingState {
  /**
   * Whether the user has completed onboarding.
   * `null` until BootstrapGate has read the persisted flag from SQLite —
   * consumers must treat `null` as "unknown, keep waiting".
   */
  complete: boolean | null;
  setOnboardingComplete: (complete: boolean) => void;
}

/**
 * UI/session-only mirror of the persisted `onboarding_completed` setting.
 * Written by src/app/bootstrap/onboarding.ts (never directly by screens).
 */
export const useOnboardingStore = create<OnboardingState>(set => ({
  complete: null,
  setOnboardingComplete: complete => set({complete}),
}));
