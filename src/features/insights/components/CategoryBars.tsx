import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {LayoutChangeEvent} from 'react-native';
import Svg, {Rect} from 'react-native-svg';

import {
  AmountText,
  CategoryIcon,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import {getCategoryIcon} from '../../../design-system/icons';
import {formatMoney} from '../../../utils/money';
import type {CategoryShare} from '../services/insightsAggregation';

export interface CategoryBarsProps {
  /** Shares sorted by totalMinor DESC; rendered top-down. */
  shares: CategoryShare[];
  currency?: string;
  testID?: string;
}

const BAR_HEIGHT = 8;
const BAR_RADIUS = 4;

/**
 * Top-categories list with a horizontal bar per category. The bar is a visual
 * aid only — name, amount and percentage are spelled out per row, and each
 * row carries a full accessibility label, so nothing relies on color/length.
 */
export function CategoryBars({shares, currency = 'INR', testID}: CategoryBarsProps) {
  const {theme} = useTheme();
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
            key={share.categoryId ?? '__uncategorized__'}
            accessible
            accessibilityLabel={`${share.name}: ${formatMoney(
              share.totalMinor,
              currency,
            )}, ${percent} percent of spending, ${share.count} ${
              share.count === 1 ? 'transaction' : 'transactions'
            }`}
            style={[styles.row, index > 0 && {marginTop: theme.spacing.lg}]}>
            <View style={styles.headerRow}>
              <CategoryIcon
                icon={getCategoryIcon(share.icon)}
                color={share.color}
                size={36}
              />
              <View style={styles.nameWrap}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {share.name}
                </Text>
                <Text variant="caption" color="textMuted" numberOfLines={1}>
                  {share.count}{' '}
                  {share.count === 1 ? 'transaction' : 'transactions'}
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
                  fill={share.color}
                />
              </Svg>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {width: '100%'},
  row: {width: '100%', gap: 8},
  headerRow: {flexDirection: 'row', alignItems: 'center', gap: 12},
  nameWrap: {flex: 1, gap: 2},
  amountWrap: {alignItems: 'flex-end', gap: 2},
});
