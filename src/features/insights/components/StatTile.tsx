import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Card, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';

export interface StatTileProps {
  label: string;
  /** Pre-formatted value (non-money stats, e.g. a count). */
  value: string;
  caption?: string;
  accessibilityLabel?: string;
  testID?: string;
}

/** MetricCard counterpart for plain (non-money) values. */
export function StatTile({
  label,
  value,
  caption,
  accessibilityLabel,
  testID,
}: StatTileProps) {
  const {theme} = useTheme();
  return (
    <Card
      accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
      style={styles.card}
      testID={testID}>
      <View style={[styles.inner, {gap: theme.spacing.xs}]}>
        <Text variant="label" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
        <Text variant="amountMedium" numberOfLines={1}>
          {value}
        </Text>
        {caption ? (
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {caption}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {flex: 1},
  inner: {},
});
