import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string = string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** iOS-style segmented control (e.g. Expense / Income / Transfer). */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  style,
  testID,
}: SegmentedControlProps<T>) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      testID={testID}
      style={[styles.root, {borderRadius: theme.radius.md}, style]}>
      {options.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{selected}}
            onPress={() => onChange(option.value)}
            style={({pressed}) => [
              styles.segment,
              {borderRadius: theme.radius.sm},
              selected && styles.selected,
              pressed && styles.pressed,
            ]}>
            <Text
              variant="bodyMedium"
              color={selected ? 'primary' : 'textSecondary'}
              numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      padding: theme.spacing.xs,
      gap: theme.spacing.xs,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    segment: {
      flex: 1,
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.sm,
    },
    selected: {backgroundColor: theme.colors.primarySoft},
    pressed: {opacity: 0.8},
  });
