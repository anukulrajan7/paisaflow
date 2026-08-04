import React from 'react';
import {Text as RNText} from 'react-native';
import type {TextProps as RNTextProps, TextStyle} from 'react-native';

import {useTheme} from '../theme';
import {TABULAR_VARIANTS} from '../tokens';
import type {ColorTokens, TypographyTokens} from '../tokens';

export type TextVariant = keyof TypographyTokens;
export type TextColor = keyof Pick<
  ColorTokens,
  | 'textPrimary'
  | 'textSecondary'
  | 'textMuted'
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'income'
  | 'expense'
  | 'onPrimary'
>;

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
  children?: React.ReactNode;
}

/** Themed text. Dynamic font scaling is on, capped at 1.3x to protect layouts. */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  allowFontScaling = true,
  maxFontSizeMultiplier = 1.3,
  ...rest
}: TextProps) {
  const {theme} = useTheme();
  const typeStyle = theme.typography[variant];
  const tabular = TABULAR_VARIANTS.has(variant);

  return (
    <RNText
      allowFontScaling={allowFontScaling}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        typeStyle,
        {color: theme.colors[color], textAlign: align},
        tabular && {fontVariant: ['tabular-nums']},
        style,
      ]}
      {...rest}
    />
  );
}
