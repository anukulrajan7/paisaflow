import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';

export interface CardProps {
  children?: React.ReactNode;
  /** When provided, the card becomes a pressable surface. */
  onPress?: (event: GestureResponderEvent) => void;
  elevated?: boolean;
  padded?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({
  children,
  onPress,
  elevated = false,
  padded = true,
  accessibilityLabel,
  style,
  testID,
}: CardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const cardStyle = [
    styles.base,
    {
      borderRadius: theme.radius.lg,
      padding: padded ? theme.spacing.lg : 0,
    },
    elevated && styles.elevated,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        testID={testID}
        style={({pressed}) => [cardStyle, pressed && styles.pressed]}>
        {children}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={cardStyle}>
      {children}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    base: {
      backgroundColor: theme.colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
    },
    elevated: {
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 0,
      shadowColor: theme.colors.textPrimary,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: theme.dark ? 0.3 : 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    pressed: {opacity: 0.9},
  });
