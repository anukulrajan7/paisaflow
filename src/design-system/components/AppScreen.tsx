import React, {useMemo} from 'react';
import {KeyboardAvoidingView, Platform, StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';

export interface AppScreenProps {
  children?: React.ReactNode;
  /** Apply standard horizontal screen padding. */
  padded?: boolean;
  /** Respect top/bottom safe-area insets. Defaults to true. */
  safeArea?: boolean;
  /** Wrap content in a KeyboardAvoidingView (use on form screens). */
  avoidKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Base screen container: themed background + safe-area handling. */
export function AppScreen({
  children,
  padded = false,
  safeArea = true,
  avoidKeyboard = false,
  style,
  contentStyle,
  testID,
}: AppScreenProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const body = (
    <View
      style={[
        styles.content,
        padded && {paddingHorizontal: theme.spacing.lg},
        contentStyle,
      ]}>
      {children}
    </View>
  );

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        safeArea && {
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
        style,
      ]}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    flex: {flex: 1},
    content: {flex: 1},
  });
