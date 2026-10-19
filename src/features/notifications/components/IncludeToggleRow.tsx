import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {LucideIcon} from 'lucide-react-native';

import {Text, Switch} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export interface IncludeToggleRowProps {
  icon: LucideIcon;
  title: string;
  /** Which reminder slot(s) the category affects. */
  subtitle: string;
  value: boolean;
  onToggle: (value: boolean) => void;
  testID?: string;
}

/** One reminder-content category: icon, title/subtitle and a toggle. */
export function IncludeToggleRow({
  icon: Icon,
  title,
  subtitle,
  value,
  onToggle,
  testID,
}: IncludeToggleRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.row} testID={testID}>
      <Icon size={20} color={theme.colors.textSecondary} style={styles.icon} />
      <View style={styles.body}>
        <Text variant="bodyMedium">{title}</Text>
        <Text variant="caption" color="textSecondary">
          {subtitle}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{false: theme.colors.border, true: theme.colors.primarySoft}}
        thumbColor={value ? theme.colors.primary : theme.colors.textMuted}
        accessibilityLabel={`Include ${title} in reminders`}
        accessibilityHint={
          value ? 'Double tap to turn off' : 'Double tap to turn on'
        }
      />
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
  });
