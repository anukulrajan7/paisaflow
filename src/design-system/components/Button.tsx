import React, {useMemo} from 'react';
import {ActivityIndicator, Pressable, StyleSheet} from 'react-native';
import type {GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  title: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZES: Record<ButtonSize, {height: number; paddingH: number}> = {
  sm: {height: 44, paddingH: 12},
  md: {height: 48, paddingH: 16},
  lg: {height: 56, paddingH: 20},
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon: Icon,
  fullWidth = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ButtonProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isDisabled = disabled || loading;

  const variantStyle =
    variant === 'primary'
      ? styles.primary
      : variant === 'secondary'
        ? styles.secondary
        : variant === 'danger'
          ? styles.danger
          : styles.ghost;

  const textColor =
    variant === 'primary' || variant === 'danger' ? 'onPrimary' : 'primary';

  const spinnerColor =
    variant === 'primary' || variant === 'danger'
      ? theme.colors.onPrimary
      : theme.colors.primary;

  const sizeConf = SIZES[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        {
          height: sizeConf.height,
          paddingHorizontal: sizeConf.paddingH,
          borderRadius: theme.radius.md,
        },
        variantStyle,
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <>
          {Icon ? (
            <Icon
              size={18}
              color={
                textColor === 'onPrimary'
                  ? theme.colors.onPrimary
                  : theme.colors.primary
              }
            />
          ) : null}
          <Text variant="bodyMedium" color={textColor}>
            {title}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    base: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
    },
    fullWidth: {alignSelf: 'stretch'},
    primary: {backgroundColor: theme.colors.primary},
    secondary: {
      backgroundColor: theme.colors.primarySoft,
    },
    ghost: {backgroundColor: 'transparent'},
    danger: {backgroundColor: theme.colors.danger},
    disabled: {opacity: 0.5},
    pressed: {opacity: 0.85},
  });
