import React, {useEffect, useMemo} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {useTheme} from '../../design-system/theme';
import {useOnboardingStore} from '../../store/onboardingStore';
import {OnboardingScreen} from '../../features/onboarding/screens/OnboardingScreen';
import {buildNavigationTheme} from './navTheme';
import {navigationRef} from './navigationRef';
import {
  openFromInitialNotification,
  subscribeToNotificationEvents,
} from './notificationNavigation';
import {RootTabs} from './RootTabs';
import type {RootStackParamList} from './types';

const RootStack = createNativeStackNavigator<RootStackParamList>();

/**
 * Root stack with two destinations: the onboarding flow and the main tab
 * shell. BootstrapGate guarantees the onboarding flag is loaded (non-null)
 * before this renders; completing onboarding flips the store and swaps
 * Onboarding for Tabs without remounting NavigationContainer.
 */
export function RootNavigator() {
  const {theme} = useTheme();
  const onboardingComplete = useOnboardingStore(state => state.complete);
  const navigationTheme = useMemo(() => buildNavigationTheme(theme), [theme]);

  // Navigate on reminder taps while the app is foregrounded; cold starts are
  // handled by openFromInitialNotification once the container is ready.
  useEffect(() => subscribeToNotificationEvents(), []);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        openFromInitialNotification().catch(() => {
          // Best-effort deep link; never break startup.
        });
      }}>
      <RootStack.Navigator screenOptions={{headerShown: false}}>
        {onboardingComplete === false ? (
          <RootStack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <RootStack.Screen name="Tabs" component={RootTabs} />
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
