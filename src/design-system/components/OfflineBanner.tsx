import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {StyleProp, ViewStyle} from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {WifiOff} from 'lucide-react-native';

import {useTheme} from '../theme';
import type {AppTheme} from '../tokens';
import {Text} from './Text';

export interface OfflineBannerProps {
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Slim banner shown while the device is offline. The app is fully
 * functional offline — this is informational only (e.g. for AI/export).
 */
export function OfflineBanner({style, testID}: OfflineBannerProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  if (!offline) {
    return null;
  }

  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="You are offline"
      testID={testID}
      style={[styles.root, style]}>
      <WifiOff size={14} color={theme.colors.warning} />
      <Text variant="caption" color="textSecondary">
        You&apos;re offline — data is saved locally
      </Text>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.spacing.sm,
      paddingVertical: theme.spacing.sm,
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.warningSoft,
    },
  });
