import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {Text} from '../../../design-system/components';
import {formatMoney} from '../../../utils/money';

export interface GoalProgressBarProps {
  savedMinor: number;
  targetMinor: number;
  currency?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * BudgetProgress-style bar with savings semantics: primary fill that turns
 * success-green at 100% (never warning/danger — more saved is always good),
 * with a saved/target caption and percentage.
 */
export function GoalProgressBar({
  savedMinor,
  targetMinor,
  currency = 'INR',
  style,
  testID,
}: GoalProgressBarProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const ratio = targetMinor > 0 ? savedMinor / targetMinor : 0;
  const percent = Math.min(Math.max(ratio, 0), 1);
  const complete = savedMinor >= targetMinor && targetMinor > 0;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{
        min: 0,
        max: targetMinor,
        now: Math.min(Math.max(savedMinor, 0), Math.max(targetMinor, 0)),
      }}
      accessibilityLabel={`Savings progress, ${Math.round(percent * 100)} percent`}
      testID={testID}
      style={[styles.root, style]}>
      <View
        style={[styles.track, {borderRadius: theme.radius.pill}]}
        importantForAccessibility="no">
        <View
          style={[
            styles.fill,
            {
              borderRadius: theme.radius.pill,
              backgroundColor: complete
                ? theme.colors.success
                : theme.colors.primary,
              width: `${percent * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.captionRow}>
        <Text variant="caption" color="textSecondary">
          {formatMoney(savedMinor, currency)} of {formatMoney(targetMinor, currency)}
        </Text>
        <Text variant="caption" color={complete ? 'success' : 'textMuted'}>
          {Math.round(percent * 100)}%
        </Text>
      </View>
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
