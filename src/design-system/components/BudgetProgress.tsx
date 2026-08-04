import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {formatMoney} from '../../utils/money';

export interface BudgetProgressProps {
  spentMinor: number;
  totalMinor: number;
  currency?: string;
  label?: string;
  /** Hide the spent/total caption row. */
  hideAmounts?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Budget utilization bar: success → warning (>80%) → danger (>100%). */
export function BudgetProgress({
  spentMinor,
  totalMinor,
  currency = 'INR',
  label,
  hideAmounts = false,
  style,
  testID,
}: BudgetProgressProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ratio = totalMinor > 0 ? spentMinor / totalMinor : 0;
  const percent = Math.min(Math.max(ratio, 0), 1);
  const tone =
    ratio > 1 ? theme.colors.danger : ratio > 0.8 ? theme.colors.warning : theme.colors.success;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: totalMinor,
        now: Math.min(spentMinor, Math.max(totalMinor, 0)),
      }}
      accessibilityLabel={label ?? 'Budget progress'}
      testID={testID}
      style={[styles.root, style]}>
      {label ? (
        <Text variant="label" color="textSecondary">
          {label}
        </Text>
      ) : null}
      <View
        style={[styles.track, {borderRadius: theme.radius.pill}]}
        importantForAccessibility="no">
        <View
          style={[
            styles.fill,
            {
              borderRadius: theme.radius.pill,
              backgroundColor: tone,
              width: `${percent * 100}%`,
            },
          ]}
        />
      </View>
      {hideAmounts ? null : (
        <View style={styles.captionRow}>
          <Text variant="caption" color="textSecondary">
            {formatMoney(spentMinor, currency)} spent
          </Text>
          <Text variant="caption" color="textMuted">
            of {formatMoney(totalMinor, currency)}
          </Text>
        </View>
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {gap: theme.spacing.sm},
    track: {
      height: 8,
      backgroundColor: theme.colors.border,
      overflow: 'hidden',
    },
    fill: {height: 8},
    captionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
  });
