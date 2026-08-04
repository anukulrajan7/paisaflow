import React, {createContext, useContext, useMemo} from 'react';
import type {ReactNode} from 'react';
import {useColorScheme} from 'react-native';

import {darkTheme, lightTheme} from '../tokens';
import type {AppTheme} from '../tokens';
import {useThemeStore} from '../../store/themeStore';
import type {ThemePreference} from '../../store/themeStore';

export interface ThemeContextValue {
  theme: AppTheme;
  /** Effective appearance after resolving 'system'. */
  resolvedMode: 'light' | 'dark';
  preference: ThemePreference;
  setTheme: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({children}: {children: ReactNode}) {
  const preference = useThemeStore(state => state.preference);
  const setTheme = useThemeStore(state => state.setTheme);
  const systemScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    const resolvedMode: 'light' | 'dark' =
      preference === 'system'
        ? systemScheme === 'dark'
          ? 'dark'
          : 'light'
        : preference;
    return {
      theme: resolvedMode === 'dark' ? darkTheme : lightTheme,
      resolvedMode,
      preference,
      setTheme,
    };
  }, [preference, systemScheme, setTheme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
