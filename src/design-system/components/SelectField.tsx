import React, {useMemo, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Check, ChevronDown} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {BottomSheet} from './BottomSheet';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectFieldProps<T extends string = string> {
  label?: string;
  placeholder?: string;
  value: T | null;
  options: ReadonlyArray<SelectOption<T>>;
  onSelect: (value: T) => void;
  error?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Tappable field that opens a bottom sheet of options. */
export function SelectField<T extends string = string>({
  label,
  placeholder = 'Select',
  value,
  options,
  onSelect,
  error,
  disabled = false,
  accessibilityLabel,
  containerStyle,
  testID,
}: SelectFieldProps<T>) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  const selected = options.find(option => option.value === value);

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
        accessibilityState={{disabled, expanded: open}}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID}
        style={({pressed}) => [
          styles.field,
          {borderRadius: theme.radius.md},
          !!error && {borderColor: theme.colors.danger},
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}>
        <Text
          variant="body"
          color={selected ? 'textPrimary' : 'textMuted'}
          style={styles.value}>
          {selected ? selected.label : placeholder}
        </Text>
        <ChevronDown size={18} color={theme.colors.textMuted} />
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
        </Text>
      ) : null}
      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? placeholder}>
        {options.map(option => (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{selected: option.value === value}}
            onPress={() => {
              onSelect(option.value);
              setOpen(false);
            }}
            style={({pressed}) => [
              styles.option,
              pressed && styles.pressed,
            ]}>
            <Text variant="body">{option.label}</Text>
            {option.value === value ? (
              <Check size={18} color={theme.colors.primary} />
            ) : null}
          </Pressable>
        ))}
      </BottomSheet>
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
    pressed: {opacity: 0.8},
    value: {flex: 1},
    message: {marginTop: theme.spacing.xs},
    option: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.sm,
      borderRadius: theme.radius.sm,
    },
  });
