import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {Inbox} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {Button} from './Button';

export interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  /**
   * Optional spot illustration (from `design-system/illustrations`) replacing
   * the default icon tile. Illustrations manage their own accessibility.
   */
  illustration?: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function EmptyState({
  title,
  message,
  icon: Icon = Inbox,
  illustration,
  actionLabel,
  onAction,
  style,
  testID,
}: EmptyStateProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      accessibilityRole="text"
      testID={testID}
      style={[styles.root, style]}>
      {illustration ? (
        <View style={styles.illustrationWrap}>{illustration}</View>
      ) : (
        <View style={[styles.iconWrap, {borderRadius: theme.radius.pill}]}>
          <Icon size={28} color={theme.colors.textMuted} />
        </View>
      )}
      <Text variant="title" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Button title={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.xxxl,
      gap: theme.spacing.md,
    },
    iconWrap: {
      width: 64,
      height: 64,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
      marginBottom: theme.spacing.xs,
    },
    illustrationWrap: {
      alignItems: 'center',
      marginBottom: theme.spacing.xs,
    },
  });
