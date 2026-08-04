import {DarkTheme, DefaultTheme} from '@react-navigation/native';
import type {Theme as NavigationTheme} from '@react-navigation/native';

import type {AppTheme} from '../../design-system/tokens';

/** Map design tokens onto the React Navigation theme. */
export function buildNavigationTheme(theme: AppTheme): NavigationTheme {
  const base = theme.dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };
}
