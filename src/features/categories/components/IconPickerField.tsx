import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {Text} from '../../../design-system/components';
import {
  CATEGORY_ICON_CHOICES,
  getCategoryIcon,
} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export interface IconPickerFieldProps {
  value: string;
  onChange: (icon: string) => void;
  /** Currently picked category color, used to preview the selected icon. */
  previewColor: string;
  label?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Selectable grid of every icon in CATEGORY_ICON_CHOICES. */
export function IconPickerField({
  value,
  onChange,
  previewColor,
  label = 'Icon',
  error,
  style,
  testID,
}: IconPickerFieldProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View testID={testID} style={[styles.container, style]}>
      <Text variant="label" color="textSecondary" style={styles.label}>
        {label}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.grid}>
        {CATEGORY_ICON_CHOICES.map(name => {
          const selected = name === value;
          const Icon = getCategoryIcon(name);
          return (
            <Pressable
              key={name}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{selected}}
              onPress={() => onChange(name)}
              style={({pressed}) => [
                styles.cell,
                {borderRadius: theme.radius.md},
                selected && styles.cellSelected,
                pressed && styles.pressed,
              ]}>
              <Icon
                size={22}
                color={selected ? previewColor : theme.colors.textSecondary}
              />
            </Pressable>
          );
        })}
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
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    cell: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cellSelected: {
      backgroundColor: theme.colors.primarySoft,
      borderColor: theme.colors.primary,
    },
    pressed: {opacity: 0.8},
    message: {marginTop: theme.spacing.xs},
  });
