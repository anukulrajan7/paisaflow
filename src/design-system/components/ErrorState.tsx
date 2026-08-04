import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {CircleAlert} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';
import {Button} from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  retryLabel?: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  retryLabel = 'Try again',
  onRetry,
  style,
  testID,
}: ErrorStateProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      accessibilityRole="alert"
      testID={testID}
      style={[styles.root, style]}>
      <View style={[styles.iconWrap, {borderRadius: theme.radius.pill}]}>
        <CircleAlert size={28} color={theme.colors.danger} />
      </View>
      <Text variant="title" align="center">
        {title}
      </Text>
      {message ? (
        <Text variant="body" color="textSecondary" align="center">
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button title={retryLabel} onPress={onRetry} variant="secondary" />
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
      backgroundColor: theme.colors.dangerSoft,
      marginBottom: theme.spacing.xs,
    },
  });
