import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Skeleton} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

/** Pulsing placeholder matching the insights layout (chart, tiles, cards). */
export function InsightsSkeleton() {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const cardRadius = theme.radius.lg;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading insights"
      style={styles.root}>
      <Skeleton height={52} radius={theme.radius.md} />
      <Skeleton height={232} radius={cardRadius} />
      <View style={styles.row}>
        <Skeleton height={96} radius={cardRadius} style={styles.flex} />
        <Skeleton height={96} radius={cardRadius} style={styles.flex} />
      </View>
      <Skeleton height={120} radius={cardRadius} />
      <Skeleton height={220} radius={cardRadius} />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      paddingHorizontal: theme.spacing.lg,
      paddingTop: theme.spacing.xs,
      gap: theme.spacing.xl,
    },
    row: {flexDirection: 'row', gap: theme.spacing.md},
    flex: {flex: 1},
  });
