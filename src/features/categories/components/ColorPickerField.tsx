import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Check} from 'lucide-react-native';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {CATEGORY_COLORS} from '../../../design-system/tokens';

export interface ColorPickerFieldProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Swatch row for CATEGORY_COLORS; selection shown by ring + check mark. */
export function ColorPickerField({
  value,
  onChange,
  label = 'Color',
  error,
  style,
  testID,
}: ColorPickerFieldProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View testID={testID} style={[styles.container, style]}>
      <Text variant="label" color="textSecondary" style={styles.label}>
        {label}
      </Text>
      <View accessibilityRole="radiogroup" style={styles.row}>
        {CATEGORY_COLORS.map(color => {
          const selected = color === value;
          return (
            <Pressable
              key={color}
              accessibilityRole="radio"
              accessibilityLabel={`Color ${color}`}
              accessibilityState={{selected}}
              onPress={() => onChange(color)}
              style={({pressed}) => [
                styles.swatch,
                {borderColor: selected ? color : 'transparent'},
                pressed && styles.pressed,
              ]}>
              <View style={[styles.fill, {backgroundColor: color}]}>
                {selected ? (
                  <Check size={16} color={theme.colors.onPrimary} />
                ) : null}
              </View>
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
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    swatch: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radius.pill,
      borderWidth: 2,
    },
    fill: {
      width: 36,
      height: 36,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {opacity: 0.8},
    message: {marginTop: theme.spacing.xs},
  });
