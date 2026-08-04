import React from 'react';
import type {StyleProp, TextStyle} from 'react-native';

import {Text} from './Text';
import {formatMoney} from '../../utils/money';

export interface AmountTextProps {
  /** Amount in integer minor units. */
  amountMinor: number;
  currency?: string;
  /** Drives semantic color + optional sign. */
  type?: 'income' | 'expense' | 'neutral';
  size?: 'large' | 'medium' | 'body';
  /** Force a leading +/- sign regardless of type. */
  showSign?: boolean;
  /** Override semantic color (e.g. 'textMuted' for deleted rows). */
  color?: 'income' | 'expense' | 'textPrimary' | 'textSecondary' | 'textMuted';
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
  testID?: string;
}

/** Formatted currency amount; coloring/sign follow the transaction type. */
export function AmountText({
  amountMinor,
  currency = 'INR',
  type = 'neutral',
  size = 'medium',
  showSign = true,
  color,
  style,
  accessibilityLabel,
  testID,
}: AmountTextProps) {
  const variant =
    size === 'large'
      ? 'amountLarge'
      : size === 'medium'
        ? 'amountMedium'
        : 'bodyMedium';

  const resolvedColor =
    color ??
    (type === 'income'
      ? 'income'
      : type === 'expense'
        ? 'expense'
        : 'textPrimary');

  const sign = showSign
    ? type === 'income'
      ? '+'
      : type === 'expense'
        ? '-'
        : ''
    : '';

  const formatted = `${sign}${formatMoney(Math.abs(amountMinor), currency)}`;

  return (
    <Text
      variant={variant}
      color={resolvedColor}
      accessibilityLabel={
        accessibilityLabel ??
        `${type !== 'neutral' ? `${type} ` : ''}${formatted}`
      }
      maxFontSizeMultiplier={1.2}
      testID={testID}
      style={style}>
      {formatted}
    </Text>
  );
}
