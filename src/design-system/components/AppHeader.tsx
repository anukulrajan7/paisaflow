import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface AppHeaderProps {
  title: string;
  subtitle?: string;
  /** Typically one or two IconButtons. */
  left?: React.ReactNode;
  right?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** In-screen header bar (native-stack headers are hidden app-wide). */
export function AppHeader({
  title,
  subtitle,
  left,
  right,
  style,
  testID,
}: AppHeaderProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View testID={testID} style={[styles.root, style]}>
      <View style={styles.side}>{left}</View>
      <View style={styles.center}>
        <Text variant="title" numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.side, styles.right]}>{right}</View>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      gap: theme.spacing.sm,
      backgroundColor: theme.colors.background,
    },
    side: {
      minWidth: 44,
      flexDirection: 'row',
      alignItems: 'center',
    },
    right: {justifyContent: 'flex-end'},
    center: {flex: 1},
  });
