import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AmountText, CategoryIcon, Text} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';

export interface CategorySpendRowProps {
  name: string;
  /** Lucide icon name stored on the category. */
  icon: string;
  color: string;
  totalMinor: number;
  count: number;
  /** Largest category total this month; the bar scales relative to it. */
  maxMinor: number;
  currency: string;
  testID?: string;
}

/** One category row: icon, name + proportional spend bar, amount. */
export function CategorySpendRow({
  name,
  icon,
  color,
  totalMinor,
  count,
  maxMinor,
  currency,
  testID,
}: CategorySpendRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ratio = maxMinor > 0 ? Math.min(totalMinor / maxMinor, 1) : 0;
  const formatted = formatMoney(totalMinor, currency);

  return (
    <View
      testID={testID}
      accessibilityLabel={`${name}, ${formatted}, ${count} ${
        count === 1 ? 'transaction' : 'transactions'
      }`}
      style={styles.root}>
      <CategoryIcon icon={getCategoryIcon(icon)} color={color} size={32} />
      <View style={styles.middle}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {name}
        </Text>
        <View
          style={[styles.track, {borderRadius: theme.radius.pill}]}
          importantForAccessibility="no">
          <View
            style={[
              styles.fill,
              {
                borderRadius: theme.radius.pill,
                backgroundColor: color,
                width: `${Math.max(ratio * 100, 2)}%`,
              },
            ]}
          />
        </View>
      </View>
      <AmountText
        amountMinor={totalMinor}
        currency={currency}
        size="body"
        showSign={false}
      />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    middle: {flex: 1, gap: theme.spacing.xs},
    track: {
      height: 6,
      backgroundColor: theme.colors.border,
      overflow: 'hidden',
    },
    fill: {height: 6},
  });
