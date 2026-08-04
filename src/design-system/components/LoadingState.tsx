import React, {useMemo} from 'react';
import {ActivityIndicator, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface LoadingStateProps {
  message?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function LoadingState({message, style, testID}: LoadingStateProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={message ?? 'Loading'}
      testID={testID}
      style={[styles.root, style]}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      {message ? (
        <Text variant="body" color="textSecondary">
          {message}
        </Text>
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
      gap: theme.spacing.lg,
    },
  });
