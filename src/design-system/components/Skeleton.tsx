import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, StyleSheet} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {isWeb} from '../../platform';

export interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Pulsing placeholder block for loading layouts. */
export function Skeleton({
  width = '100%',
  height = 16,
  radius: radiusProp,
  style,
  testID,
}: SkeletonProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: !isWeb,
        }),
        Animated.timing(opacity, {
          toValue: 0.5,
          duration: 700,
          useNativeDriver: !isWeb,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID={testID}
      style={[
        styles.block,
        {
          width,
          height,
          borderRadius: radiusProp ?? theme.radius.sm,
          opacity,
        },
        style,
      ]}
    />
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    block: {backgroundColor: theme.colors.border},
  });
