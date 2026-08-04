import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {Card} from './Card';
import {AmountText} from './AmountText';

export interface MetricCardProps {
  label: string;
  amountMinor: number;
  currency?: string;
  type?: 'income' | 'expense' | 'neutral';
  /** Small context line, e.g. "vs last month". */
  caption?: string;
  icon?: LucideIcon;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Dashboard metric tile (spent / income / balance). */
export function MetricCard({
  label,
  amountMinor,
  currency = 'INR',
  type = 'neutral',
  caption,
  icon: Icon,
  onPress,
  accessibilityLabel,
  style,
  testID,
}: MetricCardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.card, style]}
      testID={testID}>
      <View style={styles.header}>
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
        {Icon ? <Icon size={16} color={theme.colors.textMuted} /> : null}
      </View>
      <AmountText
        amountMinor={amountMinor}
        currency={currency}
        type={type}
        size="medium"
        showSign={false}
      />
      {caption ? (
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {caption}
        </Text>
      ) : null}
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {gap: theme.spacing.xs},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
  });
