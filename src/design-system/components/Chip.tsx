import React, {useMemo} from 'react';
import {Pressable, StyleSheet} from 'react-native';
import type {GestureResponderEvent, StyleProp, ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: (event: GestureResponderEvent) => void;
  icon?: LucideIcon;
  /** Override the leading icon tint (e.g. a category color). */
  iconColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Filter/select chip. Static when no onPress is given. */
export function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  iconColor,
  disabled = false,
  accessibilityLabel,
  style,
  testID,
}: ChipProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{selected, disabled}}
      disabled={disabled || !onPress}
      onPress={onPress}
      testID={testID}
      style={({pressed}) => [
        styles.base,
        {
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.md,
        },
        selected ? styles.selected : styles.unselected,
        disabled && styles.disabled,
        pressed && onPress && styles.pressed,
        style,
      ]}>
      {Icon ? (
        <Icon
          size={14}
          color={
            iconColor ??
            (selected ? theme.colors.primary : theme.colors.textSecondary)
          }
        />
      ) : null}
      <Text
        variant="caption"
        color={selected ? 'primary' : 'textSecondary'}
        style={selected ? styles.selectedText : undefined}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    base: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.xs,
      borderWidth: 1,
    },
    selected: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
    unselected: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
    },
    selectedText: {fontWeight: '600'},
    disabled: {opacity: 0.5},
    pressed: {opacity: 0.8},
  });
