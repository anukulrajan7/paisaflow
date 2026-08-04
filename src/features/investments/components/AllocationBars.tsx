import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import Svg, {Rect} from 'react-native-svg';

import {
  AmountText,
  CategoryIcon,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import {
  INVESTMENT_TYPE_COLORS,
  INVESTMENT_TYPE_ICONS,
  INVESTMENT_TYPE_LABELS,
} from '../types/investment';
import type {AllocationShare} from '../utils/investmentMath';

export interface AllocationBarsProps {
  /** Shares sorted by totalMinor DESC; rendered top-down. */
  shares: AllocationShare[];
  currency?: string;
  testID?: string;
}

const BAR_HEIGHT = 8;
const BAR_RADIUS = 4;

/**
 * Allocation of current value by investment type — one horizontal bar per
 * type (same pattern as insights/CategoryBars). Every row spells out the
 * type label, amount and percentage, so nothing relies on color or bar
 * length alone.
 */
export function AllocationBars({shares, currency = 'INR', testID}: AllocationBarsProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const maxMinor = Math.max(...shares.map(s => s.totalMinor), 0);

  return (
    <View testID={testID} style={styles.root} onLayout={onLayout}>
      {shares.map((share, index) => {
        const percent = Math.round(share.fraction * 100);
        const fillWidth =
          width > 0 && maxMinor > 0
            ? Math.max((share.totalMinor / maxMinor) * width, 2)
            : 0;
        return (
          <View
            key={share.type}
            accessible
            accessibilityLabel={`${INVESTMENT_TYPE_LABELS[share.type]}: ${formatMoney(
              share.totalMinor,
              currency,
            )}, ${percent} percent of portfolio, ${share.count} ${
              share.count === 1 ? 'investment' : 'investments'
            }`}
            style={[styles.row, index > 0 && {marginTop: theme.spacing.lg}]}>
            <View style={styles.headerRow}>
              <CategoryIcon
                icon={INVESTMENT_TYPE_ICONS[share.type]}
                color={INVESTMENT_TYPE_COLORS[share.type]}
                size={36}
              />
              <View style={styles.nameWrap}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {INVESTMENT_TYPE_LABELS[share.type]}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {share.count}{' '}
                  {share.count === 1 ? 'investment' : 'investments'}
                </Text>
              </View>
              <View style={styles.amountWrap}>
                <AmountText
                  amountMinor={share.totalMinor}
                  currency={currency}
                  type="neutral"
                  size="body"
                  showSign={false}
                />
                <Text variant="caption" color="textSecondary" align="right">
                  {percent}%
                </Text>
              </View>
            </View>
            {width > 0 ? (
              <Svg
                width={width}
                height={BAR_HEIGHT}
                importantForAccessibility="no">
                <Rect
                  x={0}
                  y={0}
                  width={width}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS}
                  fill={theme.colors.border}
                />
                <Rect
                  x={0}
                  y={0}
                  width={fillWidth}
                  height={BAR_HEIGHT}
                  rx={BAR_RADIUS}
                  fill={INVESTMENT_TYPE_COLORS[share.type]}
                />
              </Svg>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {width: '100%'},
    row: {width: '100%', gap: theme.spacing.sm},
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    nameWrap: {flex: 1, gap: theme.spacing.xs},
    amountWrap: {alignItems: 'flex-end', gap: theme.spacing.xs},
  });
