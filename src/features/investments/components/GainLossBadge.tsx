import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {TrendingDown, TrendingUp} from 'lucide-react-native';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import {gainLoss} from '../utils/investmentMath';

export interface GainLossBadgeProps {
  investedMinor: number;
  currentValueMinor: number;
  currency?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Signed gain/loss pill. The word 'Gain'/'Loss' plus an up/down icon always
 * accompany the color, so the meaning never rides on color alone.
 */
export function GainLossBadge({
  investedMinor,
  currentValueMinor,
  currency = 'INR',
  style,
  testID,
}: GainLossBadgeProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const result = gainLoss(investedMinor, currentValueMinor);
  const label = result.isGain ? 'Gain' : 'Loss';
  const Icon = result.isGain ? TrendingUp : TrendingDown;
  const amount = formatMoney(Math.abs(result.amountMinor), currency);
  const percent =
    result.percent === null ? null : `${Math.abs(result.percent).toFixed(1)}%`;
  const text = percent ? `${label} ${amount} (${percent})` : `${label} ${amount}`;

  return (
    <View
      accessible
      accessibilityLabel={text}
      testID={testID}
      style={[
        styles.badge,
        {
          backgroundColor: result.isGain
            ? theme.colors.successSoft
            : theme.colors.dangerSoft,
          borderRadius: theme.radius.pill,
        },
        style,
      ]}>
      <Icon
        size={12}
        color={result.isGain ? theme.colors.success : theme.colors.danger}
      />
      <Text
        variant="caption"
        color={result.isGain ? 'success' : 'danger'}
        maxFontSizeMultiplier={1.2}>
        {text}
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: theme.spacing.xs,
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
    },
  });
