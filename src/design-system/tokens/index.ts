import {lightColors, darkColors} from './colors';
import type {ColorTokens} from './colors';
import {spacing} from './spacing';
import type {SpacingTokens} from './spacing';
import {radius} from './radius';
import type {RadiusTokens} from './radius';
import {typography} from './typography';
import type {TypographyTokens} from './typography';

export * from './colors';
export * from './spacing';
export * from './radius';
export * from './typography';

export interface AppTheme {
  dark: boolean;
  colors: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
}

export const lightTheme: AppTheme = {
  dark: false,
  colors: lightColors,
  spacing,
  radius,
  typography,
};

export const darkTheme: AppTheme = {
  dark: true,
  colors: darkColors,
  spacing,
  radius,
  typography,
};
