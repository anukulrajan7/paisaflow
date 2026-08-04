import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Skeleton} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

/** Pulsing placeholder matching the dashboard's card layout. */
export function DashboardSkeleton() {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const radius = theme.radius.lg;

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading dashboard"
      style={styles.root}>
      <Skeleton height={120} radius={radius} />
      <View style={styles.row}>
        <Skeleton height={96} radius={radius} style={styles.flex} />
        <Skeleton height={96} radius={radius} style={styles.flex} />
      </View>
      <Skeleton height={64} radius={radius} />
      <Skeleton height={200} radius={radius} />
      <Skeleton height={240} radius={radius} />
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {gap: theme.spacing.lg},
    row: {flexDirection: 'row', gap: theme.spacing.md},
    flex: {flex: 1},
  });
