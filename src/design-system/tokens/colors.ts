/**
 * Semantic color tokens for light and dark themes.
 * Warm neutral surfaces, dark charcoal text, one restrained terracotta accent.
 * Never pure black (#000) or pure white (#FFF).
 */
export interface ColorTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  primary: string;
  /** Text/icons placed on top of `primary`. */
  onPrimary: string;
  primarySoft: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  income: string;
  incomeSoft: string;
  expense: string;
  expenseSoft: string;
  overlay: string;
}

export const lightColors: ColorTokens = {
  background: '#F7F3ED',
  surface: '#FCFAF6',
  surfaceElevated: '#FEFCF9',
  textPrimary: '#211C16',
  textSecondary: '#5B5348',
  textMuted: '#8B8175',
  border: '#E4DCD0',
  primary: '#B0512F',
  onPrimary: '#FDF8F3',
  primarySoft: '#F3E2D7',
  success: '#3E7C4F',
  successSoft: '#DFECE2',
  warning: '#A9781C',
  warningSoft: '#F4E9D2',
  danger: '#B03A2E',
  dangerSoft: '#F5DFDB',
  income: '#3E7C4F',
  incomeSoft: '#DFECE2',
  expense: '#B0512F',
  expenseSoft: '#F3E2D7',
  overlay: 'rgba(33, 28, 22, 0.45)',
};

export const darkColors: ColorTokens = {
  background: '#16130F',
  surface: '#1F1B15',
  surfaceElevated: '#28221A',
  textPrimary: '#F0EAE1',
  textSecondary: '#B8AFA2',
  textMuted: '#847C6F',
  border: '#373026',
  primary: '#DA8A63',
  onPrimary: '#211C16',
  primarySoft: '#3D2B20',
  success: '#7BAF8A',
  successSoft: '#24362A',
  warning: '#D3A454',
  warningSoft: '#3A3018',
  danger: '#DA7560',
  dangerSoft: '#3E241E',
  income: '#7BAF8A',
  incomeSoft: '#24362A',
  expense: '#DA8A63',
  expenseSoft: '#3D2B20',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/**
 * Muted category palette (stored on category rows in Phase 2; referenced here
 * so seeds and pickers stay consistent). Ordered for visual distinction.
 */
export const CATEGORY_COLORS = [
  '#C96F4A', // terracotta
  '#7BAF8A', // sage
  '#6B8EAD', // slate blue
  '#B09A5B', // ochre
  '#9A7BAF', // muted violet
  '#5FA8A0', // teal
  '#C78A9B', // dusty rose
  '#8FA05B', // olive
  '#AF8A6B', // taupe
  '#7B8FAF', // steel
] as const;
