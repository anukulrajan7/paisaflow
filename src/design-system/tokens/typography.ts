import type {TextStyle} from 'react-native';

export interface TypeStyle {
  fontSize: number;
  lineHeight: number;
  fontWeight: TextStyle['fontWeight'];
  letterSpacing?: number;
}

export interface TypographyTokens {
  display: TypeStyle;
  heading: TypeStyle;
  title: TypeStyle;
  body: TypeStyle;
  bodyMedium: TypeStyle;
  caption: TypeStyle;
  label: TypeStyle;
  amountLarge: TypeStyle;
  amountMedium: TypeStyle;
}

/**
 * Typography variants. Font scaling is dynamic: the Text component enables
 * `allowFontScaling` (capped via `maxFontSizeMultiplier`) so these sizes scale
 * with the user's system font-size preference.
 */
export const typography: TypographyTokens = {
  display: {fontSize: 34, lineHeight: 40, fontWeight: '700'},
  heading: {fontSize: 28, lineHeight: 34, fontWeight: '700'},
  title: {fontSize: 20, lineHeight: 26, fontWeight: '600'},
  body: {fontSize: 16, lineHeight: 24, fontWeight: '400'},
  bodyMedium: {fontSize: 16, lineHeight: 24, fontWeight: '500'},
  caption: {fontSize: 13, lineHeight: 18, fontWeight: '400'},
  label: {fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.4},
  amountLarge: {fontSize: 32, lineHeight: 38, fontWeight: '700'},
  amountMedium: {fontSize: 20, lineHeight: 26, fontWeight: '700'},
};

/** Variants that render with tabular figures for aligned amounts. */
export const TABULAR_VARIANTS: ReadonlySet<keyof TypographyTokens> = new Set([
  'amountLarge',
  'amountMedium',
]);
