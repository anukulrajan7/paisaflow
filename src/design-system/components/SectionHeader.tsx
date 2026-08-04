import React, {useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  style,
  testID,
}: SectionHeaderProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View testID={testID} style={[styles.root, style]}>
      <Text variant="label" color="textSecondary" style={styles.title}>
        {title}
      </Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={8}
          style={({pressed}) => [styles.action, pressed && styles.pressed]}>
          <Text variant="caption" color="primary" style={styles.actionText}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    title: {textTransform: 'uppercase'},
    action: {
      minHeight: 44,
      justifyContent: 'center',
    },
    actionText: {fontWeight: '600'},
    pressed: {opacity: 0.7},
  });
