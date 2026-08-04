import React from 'react';
import {StatusBar} from 'react-native';

import {useTheme} from '../../design-system/theme';

/** Keeps the system status bar in sync with the resolved theme. */
export function ThemedStatusBar() {
  const {theme} = useTheme();
  return (
    <StatusBar
      barStyle={theme.dark ? 'light-content' : 'dark-content'}
      backgroundColor={theme.colors.background}
    />
  );
}
