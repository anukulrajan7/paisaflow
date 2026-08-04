import React, {useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {LayoutChangeEvent, StyleProp, ViewStyle} from 'react-native';
import Svg, {Line, Rect} from 'react-native-svg';

import {useTheme} from '../../../design-system/theme';
import {Text} from '../../../design-system/components';
import {formatMoney} from '../../../utils/money';
import type {TrendPoint} from '../services/insightsAggregation';

export interface TrendChartProps {
  points: TrendPoint[];
  /** Screen-reader summary replacing the chart (text alternative sits below it). */
  accessibilityLabel: string;
  /** Currency for the direct peak value label. */
  currency?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const MAX_AXIS_LABELS = 6;
const LABEL_WIDTH = 56;
const PEAK_LABEL_WIDTH = 72;

/**
 * Vertical bar chart of per-bucket expense totals (daily / weekly / monthly).
 * The SVG is decorative: the wrapper carries an accessibility summary and the
 * axis labels plus caption text carry the same information.
 */
export function TrendChart({
  points,
  accessibilityLabel,
  currency = 'INR',
  height = 140,
  style,
  testID,
}: TrendChartProps) {
  const {theme} = useTheme();
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const {bars, labelSlots, peak} = useMemo(() => {
    if (width <= 0 || points.length === 0) {
      return {bars: [], labelSlots: [], peak: null};
    }
    const maxValue = Math.max(...points.map(p => p.expenseMinor), 0);
    const gap = points.length > 20 ? 2 : 6;
    const barWidth = Math.max((width - gap * (points.length - 1)) / points.length, 1);
    const baselineY = height - 1;
    const barRadius = Math.min(3, barWidth / 3);

    const nextBars = points.map((point, index) => {
      const barHeight =
        maxValue > 0 ? Math.max((point.expenseMinor / maxValue) * (height - 24), 0) : 0;
      return {
        key: point.bucketStart,
        x: index * (barWidth + gap),
        y: baselineY - barHeight,
        width: barWidth,
        height: barHeight,
        rx: barRadius,
      };
    });

    // Evenly spaced axis labels, always including the first and last bucket.
    // Edge labels are pinned inside the chart bounds and edge-aligned so they
    // never clip; interior labels stay centered on their bar.
    const slotCount = Math.min(MAX_AXIS_LABELS, points.length);
    const step = slotCount > 1 ? (points.length - 1) / (slotCount - 1) : 0;
    const indices = new Set<number>();
    for (let slot = 0; slot < slotCount; slot += 1) {
      indices.add(Math.round(slot * step));
    }
    const maxLabelLeft = Math.max(width - LABEL_WIDTH, 0);
    const nextLabelSlots = [...indices].map(index => {
      const centerX = index * (barWidth + gap) + barWidth / 2;
      const isFirst = index === 0;
      const isLast = index === points.length - 1;
      return {
        key: points[index].bucketStart,
        label: points[index].label,
        isCurrent: points[index].isCurrent,
        left: isFirst
          ? 0
          : isLast
            ? maxLabelLeft
            : Math.min(Math.max(centerX - LABEL_WIDTH / 2, 0), maxLabelLeft),
        align: (isFirst ? 'left' : isLast ? 'right' : 'center') as
          | 'left'
          | 'right'
          | 'center',
      };
    });

    // Direct value label above the highest bar — the one number a reader
    // looks for first. Skipped when the period has no spending.
    const peakIndex =
      maxValue > 0
        ? points.findIndex(p => p.expenseMinor === maxValue)
        : -1;
    const nextPeak =
      peakIndex >= 0
        ? {
            key: points[peakIndex].bucketStart,
            valueMinor: maxValue,
            topY: nextBars[peakIndex].y,
            centerX: peakIndex * (barWidth + gap) + barWidth / 2,
          }
        : null;

    return {bars: nextBars, labelSlots: nextLabelSlots, peak: nextPeak};
  }, [points, width, height]);

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.root, style]}
      onLayout={onLayout}>
      <View importantForAccessibility="no-hide-descendants">
        {width > 0 ? (
          <>
            <Svg width={width} height={height}>
              {bars.map(bar =>
                bar.height > 0 ? (
                  <Rect
                    key={bar.key}
                    x={bar.x}
                    y={bar.y}
                    width={bar.width}
                    height={bar.height}
                    rx={bar.rx}
                    fill={theme.colors.primary}
                  />
                ) : null,
              )}
              <Line
                x1={0}
                y1={height - 0.5}
                x2={width}
                y2={height - 0.5}
                stroke={theme.colors.border}
                strokeWidth={1}
              />
            </Svg>
            <View
              style={{
                height: theme.typography.caption.lineHeight,
                marginTop: theme.spacing.xs,
              }}>
              {labelSlots.map(slot => (
                <Text
                  key={slot.key}
                  variant="caption"
                  color={slot.isCurrent ? 'primary' : 'textMuted'}
                  align={slot.align}
                  numberOfLines={1}
                  style={[
                    styles.axisLabel,
                    {
                      width: LABEL_WIDTH,
                      left: slot.left,
                    },
                  ]}>
                  {slot.label}
                </Text>
              ))}
            </View>
            {peak ? (
              <Text
                variant="caption"
                color="textSecondary"
                align="center"
                numberOfLines={1}
                style={[
                  styles.peakLabel,
                  {
                    top: Math.max(peak.topY - 20, 0),
                    left: Math.min(
                      Math.max(peak.centerX - PEAK_LABEL_WIDTH / 2, 0),
                      Math.max(width - PEAK_LABEL_WIDTH, 0),
                    ),
                    width: PEAK_LABEL_WIDTH,
                  },
                ]}>
                {formatMoney(peak.valueMinor, currency)}
              </Text>
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {width: '100%'},
  axisLabel: {position: 'absolute', top: 0},
  peakLabel: {position: 'absolute'},
});
