import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';

export interface DividerProps {
  /** Add vertical breathing room around the line. */
  spacing?: 'none' | 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}

export function Divider({spacing = 'none', style}: DividerProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const margin =
    spacing === 'lg'
      ? theme.spacing.xl
      : spacing === 'md'
        ? theme.spacing.lg
        : spacing === 'sm'
          ? theme.spacing.sm
          : 0;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.line, {marginVertical: margin}, style]}
    />
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    line: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: theme.colors.border,
      alignSelf: 'stretch',
    },
  });
