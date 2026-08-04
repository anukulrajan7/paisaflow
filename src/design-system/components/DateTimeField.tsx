import React, {useMemo, useState} from 'react';
import {Platform, Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import type {DateTimePickerEvent} from '@react-native-community/datetimepicker';
import {Calendar} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {dayjs} from '../../utils/date';

export interface DateTimeFieldProps {
  /** Epoch milliseconds. */
  value: number;
  onChange: (epochMs: number) => void;
  mode?: 'date' | 'time';
  label?: string;
  error?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Date/time entry field. On Android the native dialog is shown directly;
 * on iOS the inline spinner renders below the field.
 */
export function DateTimeField({
  value,
  onChange,
  mode = 'date',
  label,
  error,
  disabled = false,
  accessibilityLabel,
  containerStyle,
  testID,
}: DateTimeFieldProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [show, setShow] = useState(false);

  const formatted =
    mode === 'date'
      ? dayjs(value).format('D MMM YYYY')
      : dayjs(value).format('h:mm A');

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'android') {
      setShow(false);
    }
    if (event.type === 'set' && date) {
      onChange(date.getTime());
    }
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <Text variant="label" color="textSecondary" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label ?? 'Pick date'}
        accessibilityState={{disabled, expanded: show}}
        disabled={disabled}
        onPress={() => setShow(true)}
        testID={testID}
        style={({pressed}) => [
          styles.field,
          {borderRadius: theme.radius.md},
          !!error && {borderColor: theme.colors.danger},
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}>
        <Calendar size={18} color={theme.colors.textMuted} />
        <Text variant="body" style={styles.value}>
          {formatted}
        </Text>
      </Pressable>
      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
        </Text>
      ) : null}
      {show ? (
        <DateTimePicker
          value={new Date(value)}
          mode={mode}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handleChange}
          themeVariant={theme.dark ? 'dark' : 'light'}
        />
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
    pressed: {opacity: 0.8},
    value: {flex: 1},
    message: {marginTop: theme.spacing.xs},
  });
