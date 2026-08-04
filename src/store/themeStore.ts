import {create} from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeState {
  /** User preference. 'system' follows the OS appearance. */
  preference: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
}

/**
 * UI/session-only store. The persisted copy of this preference lives in
 * SQLite `app_settings` (synced by a later phase); this store is the
 * in-memory source the ThemeProvider reads.
 */
export const useThemeStore = create<ThemeState>(set => ({
  preference: 'system',
  setTheme: preference => set({preference}),
}));
