import React from 'react';
import type {ReactNode} from 'react';
import {StyleSheet} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {ThemeProvider} from '../../design-system/theme';
import {ToastProvider} from '../../design-system/components';

/** Composes the app-wide providers. Navigation lives outside, in src/app/App. */
export function AppProviders({children}: {children: ReactNode}) {
  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
