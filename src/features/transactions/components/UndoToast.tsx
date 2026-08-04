import React, {useEffect, useMemo} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';

export interface UndoToastProps {
  visible: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
  /** ms before auto-dismiss. */
  durationMs?: number;
}

/**
 * Feature-local toast with an Undo action — the shared Toast has no action
 * slot, and soft-delete undo needs one.
 */
export function UndoToast({
  visible,
  message,
  onUndo,
  onDismiss,
  durationMs = 4000,
}: UndoToastProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, message, onDismiss, durationMs]);

  if (!visible) {
    return null;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.root,
        {
          bottom: insets.bottom + theme.spacing.xl,
          borderRadius: theme.radius.md,
          borderLeftColor: theme.colors.danger,
        },
      ]}>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Undo"
        onPress={onUndo}
        style={({pressed}) => [styles.undo, pressed && styles.pressed]}>
        <Text variant="bodyMedium" color="primary">
          Undo
        </Text>
      </Pressable>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: theme.spacing.lg,
      right: theme.spacing.lg,
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.xs,
      backgroundColor: theme.colors.surfaceElevated,
      borderLeftWidth: 4,
      shadowColor: theme.colors.textPrimary,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: theme.dark ? 0.4 : 0.15,
      shadowRadius: 12,
      elevation: 6,
    },
    message: {flex: 1},
    undo: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.sm,
    },
    pressed: {opacity: 0.7},
  });
