import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {ChevronRight} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {Text} from '../../../design-system/components';

export interface SettingsRowProps {
  title: string;
  subtitle?: string;
  /** Leading icon. */
  icon?: LucideIcon;
  /** When provided the row is pressable and shows a chevron. */
  onPress?: () => void;
  /** Custom trailing content (e.g. a Switch); replaces the chevron. */
  right?: React.ReactNode;
  /** Render the title in the danger color (destructive actions). */
  danger?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** One row inside a grouped settings card: icon, title/subtitle, trailing slot. */
export function SettingsRow({
  title,
  subtitle,
  icon: Icon,
  onPress,
  right,
  danger = false,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: SettingsRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const iconColor = danger ? theme.colors.danger : theme.colors.textSecondary;
  const titleColor = danger ? 'danger' : 'textPrimary';

  const content = (
    <>
      {Icon ? (
        <Icon size={20} color={iconColor} style={styles.icon} />
      ) : null}
      <View style={styles.body}>
        <Text variant="bodyMedium" color={titleColor}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="textSecondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <ChevronRight size={18} color={theme.colors.textMuted} />
        ) : null)}
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={accessibilityHint}
        accessibilityState={{disabled}}
        disabled={disabled}
        onPress={onPress}
        testID={testID}
        style={({pressed}) => [
          styles.row,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
          style,
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.row, disabled && styles.disabled, style]}>
      {content}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    icon: {marginTop: 1},
    body: {flex: 1, gap: 2},
    disabled: {opacity: 0.5},
    pressed: {opacity: 0.7},
  });
