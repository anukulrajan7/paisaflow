import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Input} from './Input';
import {Text} from './Text';
import {currencySymbol, minorToDecimal, parseToMinorUnits} from '../../utils/money';

export interface MoneyInputProps {
  /** Amount in integer minor units; null when the field is empty/invalid. */
  valueMinor: number | null;
  onChangeMinor: (minor: number | null) => void;
  currency?: string;
  label?: string;
  error?: string;
  hint?: string;
  autoFocus?: boolean;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Amount entry field. The raw text is kept as a string and converted
 * to integer minor units via parseToMinorUnits on every change.
 */
export function MoneyInput({
  valueMinor,
  onChangeMinor,
  currency = 'INR',
  label,
  error,
  hint,
  autoFocus,
  accessibilityLabel,
  containerStyle,
  testID,
}: MoneyInputProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [text, setText] = React.useState(
    valueMinor === null ? '' : minorToDecimal(valueMinor),
  );

  const handleChange = (next: string) => {
    setText(next);
    if (next.trim() === '') {
      onChangeMinor(null);
      return;
    }
    const parsed = parseToMinorUnits(next);
    if (parsed !== null) {
      onChangeMinor(parsed);
    }
  };

  return (
    <Input
      label={label}
      error={error}
      hint={hint}
      value={text}
      onChangeText={handleChange}
      keyboardType="decimal-pad"
      autoFocus={autoFocus}
      accessibilityLabel={accessibilityLabel ?? label ?? 'Amount'}
      containerStyle={containerStyle}
      testID={testID}
      inputStyle={styles.amount}
      right={
        <View style={styles.currency}>
          <Text variant="bodyMedium" color="textMuted">
            {currencySymbol(currency)}
          </Text>
        </View>
      }
    />
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    amount: {
      fontSize: theme.typography.amountMedium.fontSize,
      fontWeight: theme.typography.amountMedium.fontWeight,
      fontVariant: ['tabular-nums'],
    },
    currency: {paddingLeft: theme.spacing.xs},
  });
