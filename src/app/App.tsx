import React from 'react';

import {AppProviders} from './providers/AppProviders';
import {ThemedStatusBar} from './providers/ThemedStatusBar';
import {BootstrapGate} from './bootstrap/BootstrapGate';
import {RootNavigator} from './navigation/RootNavigator';

export default function App() {
  return (
    <AppProviders>
      <ThemedStatusBar />
      <BootstrapGate>
        <RootNavigator />
      </BootstrapGate>
    </AppProviders>
  );
}
