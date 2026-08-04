import React, {useMemo, useState} from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import type {StyleProp, TextInputProps, ViewStyle} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: LucideIcon;
  right?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
}

/** Themed text field with label, hint and error states. Min height 48px. */
export function Input({
  label,
  error,
  hint,
  leftIcon: LeftIcon,
  right,
  containerStyle,
  inputStyle,
  editable = true,
  accessibilityLabel,
  ...rest
}: InputProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View
        style={[
          styles.field,
          {borderRadius: theme.radius.md},
          focused && {borderColor: theme.colors.primary},
          !!error && {borderColor: theme.colors.danger},
          !editable && styles.disabled,
        ]}>
        {LeftIcon ? (
          <LeftIcon size={18} color={theme.colors.textMuted} />
        ) : null}
        <TextInput
          accessibilityLabel={accessibilityLabel ?? label}
          editable={editable}
          placeholderTextColor={theme.colors.textMuted}
          onFocus={e => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={e => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.input,
            {
              color: theme.colors.textPrimary,
              fontSize: theme.typography.body.fontSize,
              lineHeight: theme.typography.body.lineHeight,
            },
            inputStyle,
          ]}
          {...rest}
        />
        {right}
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="textMuted" style={styles.message}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {gap: theme.spacing.xs},
    label: {textTransform: 'uppercase'},
    field: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    disabled: {opacity: 0.6},
    input: {
      flex: 1,
      paddingVertical: theme.spacing.sm,
    },
    message: {marginTop: theme.spacing.xs},
  });
