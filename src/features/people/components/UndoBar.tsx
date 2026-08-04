import React, {useEffect, useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {Undo2} from 'lucide-react-native';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export const UNDO_BAR_DURATION_MS = 6000;

export interface UndoBarProps {
  /** Visible message; null hides the bar. */
  message: string | null;
  onUndo: () => void;
  /** Called when the bar auto-dismisses (after UNDO_BAR_DURATION_MS). */
  onDismiss: () => void;
  testID?: string;
}

/**
 * Transient undo bar shown after a soft delete. The design-system Toast has
 * no action slot, so deletes surface here with an explicit Undo button.
 */
export function UndoBar({message, onUndo, onDismiss, testID}: UndoBarProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (message === null) {
      return;
    }
    const timer = setTimeout(onDismiss, UNDO_BAR_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  if (message === null) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[
        styles.bar,
        {
          bottom: insets.bottom + theme.spacing.lg,
          borderRadius: theme.radius.md,
        },
      ]}>
      <Text variant="bodyMedium" style={styles.message} numberOfLines={1}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo delete"
        onPress={onUndo}
        hitSlop={8}
        style={({pressed}) => [styles.undo, pressed && styles.pressed]}>
        <Undo2 size={16} color={theme.colors.primary} />
        <Text variant="bodyMedium" color="primary">
          Undo
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.textPrimary,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: theme.dark ? 0.4 : 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    message: {flex: 1},
    undo: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    pressed: {opacity: 0.7},
  });
