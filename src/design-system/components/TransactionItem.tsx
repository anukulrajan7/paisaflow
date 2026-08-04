import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {AmountText} from './AmountText';
import {CategoryIcon} from './CategoryIcon';

export interface TransactionItemProps {
  title: string;
  /** Category / account / time line. */
  subtitle?: string;
  amountMinor: number;
  type: 'income' | 'expense' | 'transfer';
  currency?: string;
  categoryIcon?: LucideIcon;
  /** Category color from data (seeded from CATEGORY_COLORS). */
  categoryColor?: string;
  onPress?: (event: GestureResponderEvent) => void;
  onLongPress?: (event: GestureResponderEvent) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** List row for a transaction. Transfers render without income/expense color. */
export function TransactionItem({
  title,
  subtitle,
  amountMinor,
  type,
  currency = 'INR',
  categoryIcon,
  categoryColor,
  onPress,
  onLongPress,
  accessibilityLabel,
  style,
  testID,
}: TransactionItemProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const amountType = type === 'transfer' ? 'neutral' : type;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={
        accessibilityLabel ?? `${title}, ${subtitle ?? ''}`.trim()
      }
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      style={({pressed}) => [
        styles.root,
        pressed && onPress && styles.pressed,
        style,
      ]}>
      <CategoryIcon icon={categoryIcon} color={categoryColor} />
      <View style={styles.texts}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <AmountText
          amountMinor={amountMinor}
          currency={currency}
          type={amountType}
          size="body"
        />
        {onPress ? (
          <ChevronRight size={16} color={theme.colors.textMuted} />
        ) : null}
      </View>
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.xs,
    },
    pressed: {opacity: 0.8},
    texts: {flex: 1, gap: theme.spacing.xs},
    trailing: {flexDirection: 'row', alignItems: 'center', gap: 2},
  });
