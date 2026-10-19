import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Check, Database, Sprout} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export type StartMode = 'fresh' | 'sample';

interface Option {
  value: StartMode;
  title: string;
  description: string;
  icon: LucideIcon;
}

const OPTIONS: ReadonlyArray<Option> = [
  {
    value: 'sample',
    title: 'Try with sample data',
    description:
      'Three months of made-up transactions, budgets, a salary, goals and more — remove them any time from Settings.',
    icon: Database,
  },
  {
    value: 'fresh',
    title: 'Start fresh',
    description: 'Default accounts and categories only. Add your first expense yourself.',
    icon: Sprout,
  },
];

export interface StartModeChoiceProps {
  value: StartMode;
  onChange: (mode: StartMode) => void;
}

/**
 * First-run choice shown on the web: explore with fake data or start empty.
 * Radio-group semantics; the selected card gets the accent border + check.
 */
export function StartModeChoice({value, onChange}: StartModeChoiceProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      <Text variant="label" color="textSecondary" style={styles.label}>
        How do you want to start?
      </Text>
      {OPTIONS.map(option => {
        const selected = option.value === value;
        const Icon = option.icon;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{checked: selected}}
            accessibilityLabel={option.title}
            onPress={() => onChange(option.value)}
            testID={`start-mode-${option.value}`}
            style={({pressed}) => [
              styles.option,
              {borderRadius: theme.radius.lg},
              selected && styles.optionSelected,
              pressed && styles.pressed,
            ]}>
            <View style={[styles.iconWrap, selected && styles.iconWrapSelected]}>
              <Icon
                size={20}
                color={selected ? theme.colors.onPrimary : theme.colors.primary}
              />
            </View>
            <View style={styles.body}>
              <Text variant="bodyMedium">{option.title}</Text>
              <Text variant="caption" color="textSecondary">
                {option.description}
              </Text>
            </View>
            {selected ? (
              <Check size={18} color={theme.colors.primary} strokeWidth={2.6} />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    group: {gap: theme.spacing.sm, marginTop: theme.spacing.sm},
    label: {textTransform: 'uppercase', marginBottom: theme.spacing.xs},
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1.5,
      borderColor: theme.colors.border,
    },
    optionSelected: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.surfaceElevated,
    },
    pressed: {opacity: 0.85},
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconWrapSelected: {backgroundColor: theme.colors.primary},
    body: {flex: 1, gap: 2},
  });
