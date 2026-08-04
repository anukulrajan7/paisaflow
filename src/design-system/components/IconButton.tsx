import React, {useMemo} from 'react';
import {ActivityIndicator, Pressable, StyleSheet} from 'react-native';
import type {GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';

export type IconButtonVariant = 'default' | 'primary' | 'danger';

export interface IconButtonProps {
  icon: LucideIcon;
  onPress: (event: GestureResponderEvent) => void;
  /** Required: icon-only buttons have no visible text. */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Icon-only pressable with a minimum 44px touch target. */
export function IconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  variant = 'default',
  size = 44,
  iconSize = 22,
  disabled = false,
  loading = false,
  style,
  testID,
}: IconButtonProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDisabled = disabled || loading;

  const iconColor: string =
    variant === 'primary'
      ? theme.colors.onPrimary
      : variant === 'danger'
        ? theme.colors.danger
        : theme.colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        {
          width: Math.max(size, 44),
          height: Math.max(size, 44),
          borderRadius: theme.radius.pill,
        },
        variant === 'primary' && {backgroundColor: theme.colors.primary},
        variant === 'danger' && {backgroundColor: theme.colors.dangerSoft},
        variant === 'default' && {backgroundColor: 'transparent'},
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        pressed && !isDisabled && variant === 'default' && styles.pressedTint,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={iconColor} size="small" />
      ) : (
        <Icon size={iconSize} color={iconColor} />
      )}
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabled: {opacity: 0.4},
    pressed: {opacity: 0.7},
    pressedTint: {backgroundColor: theme.colors.primarySoft},
  });
