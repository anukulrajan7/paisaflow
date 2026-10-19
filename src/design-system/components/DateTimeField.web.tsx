import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Calendar, Clock} from 'lucide-react-native';

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
 * Web date/time field: the browser's native `<input type="date|time">`
 * inside the same themed field chrome as the native component, so keyboard
 * and screen-reader users get the platform picker for free.
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

  const current = dayjs(value);
  const inputValue =
    mode === 'date' ? current.format('YYYY-MM-DD') : current.format('HH:mm');

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.target.value;
    if (!raw) {
      return;
    }
    if (mode === 'date') {
      const [year, month, day] = raw.split('-').map(Number);
      const next = current.year(year).month(month - 1).date(day);
      if (next.isValid()) {
        onChange(next.valueOf());
      }
    } else {
      const [hour, minute] = raw.split(':').map(Number);
      const next = current.hour(hour).minute(minute).second(0).millisecond(0);
      if (next.isValid()) {
        onChange(next.valueOf());
      }
    }
  };

  const Icon = mode === 'date' ? Calendar : Clock;

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
          !!error && {borderColor: theme.colors.danger},
          disabled && styles.disabled,
        ]}>
        <Icon size={18} color={theme.colors.textMuted} />
        <input
          className="pf-native-picker"
          type={mode}
          value={inputValue}
          onChange={handleChange}
          disabled={disabled}
          aria-label={accessibilityLabel ?? label ?? (mode === 'date' ? 'Pick date' : 'Pick time')}
          aria-invalid={error ? true : undefined}
          data-testid={testID}
          style={{
            color: theme.colors.textPrimary,
            fontSize: theme.typography.body.fontSize,
            lineHeight: `${theme.typography.body.lineHeight}px`,
            colorScheme: theme.dark ? 'dark' : 'light',
          }}
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger" style={styles.message}>
          {error}
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
    message: {marginTop: theme.spacing.xs},
  });
