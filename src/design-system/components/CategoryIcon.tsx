import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Tag} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';

export interface CategoryIconProps {
  icon?: LucideIcon;
  /** Category color from data (seeded from CATEGORY_COLORS). */
  color?: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Circular tinted badge with the category's icon. */
export function CategoryIcon({
  icon: Icon = Tag,
  color,
  size = 40,
  style,
  testID,
}: CategoryIconProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const resolved = color ?? theme.colors.primary;
  const iconSize = Math.round(size * 0.5);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      testID={testID}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: theme.radius.pill,
          backgroundColor: `${resolved}26`, // ~15% alpha tint
        },
        style,
      ]}>
      <Icon size={iconSize} color={resolved} />
    </View>
  );
}

const createStyles = (_theme: AppTheme) =>
  StyleSheet.create({
    base: {
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
