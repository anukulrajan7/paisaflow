import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Card, DateTimeField, Text, Switch} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export interface ReminderRowProps {
  title: string;
  description: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Reminder time as epoch milliseconds (only hour/minute are used). */
  time: number;
  onTimeChange: (epochMs: number) => void;
}

/** A reminder toggle with an attached time picker (disabled when off). */
export function ReminderRow({
  title,
  description,
  enabled,
  onToggle,
  time,
  onTimeChange,
}: ReminderRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text variant="bodyMedium">{title}</Text>
          <Text variant="caption" color="textSecondary">
            {description}
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{false: theme.colors.border, true: theme.colors.primary}}
          thumbColor={enabled ? theme.colors.onPrimary : theme.colors.surface}
          accessibilityLabel={`${title} reminder`}
          accessibilityHint={
            enabled ? 'Double tap to turn off' : 'Double tap to turn on'
          }
        />
      </View>
      <DateTimeField
        mode="time"
        label="Time"
        value={time}
        onChange={onTimeChange}
        disabled={!enabled}
        accessibilityLabel={`${title} reminder time`}
      />
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      gap: theme.spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    headerText: {
      flex: 1,
      gap: theme.spacing.xs,
    },
  });
