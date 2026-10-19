import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeft,
  MessageSquareText,
  RefreshCw,
  ScanText,
  ShieldCheck,
} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Card,
  IconButton,
  LoadingState,
  SectionHeader,
  Text,
  useToast,
  Switch,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {TransactionsStackParamList} from '../../../app/navigation/types';
import {hasSmsPermission, requestSmsPermission} from '../../../services/sms';
import {SettingsRow} from '../../settings/components/SettingsRow';
import {
  isAutoScanOnOpenEnabled,
  isSmsTrackingEnabled,
  setAutoScanOnOpenEnabled,
  setSmsTrackingEnabled,
} from '../services/trackingService';

type Props = NativeStackScreenProps<
  TransactionsStackParamList,
  'TrackingSettings'
>;

/** Auto-tracking preferences: master switch, permission status, privacy. */
export function TrackingSettingsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [autoScan, setAutoScan] = useState(false);
  const [permission, setPermission] = useState<boolean | null>(null);

  const reload = useCallback(async () => {
    const [storedEnabled, storedAutoScan, granted] = await Promise.all([
      isSmsTrackingEnabled(),
      isAutoScanOnOpenEnabled(),
      hasSmsPermission(),
    ]);
    setEnabled(storedEnabled);
    setAutoScan(storedAutoScan);
    setPermission(granted);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload().catch(() => setLoading(false));
  }, [reload]);

  const handleMasterToggle = useCallback(
    async (next: boolean) => {
      if (next) {
        const granted = await requestSmsPermission();
        setPermission(granted);
        if (!granted) {
          showToast(
            'SMS access is required for auto-tracking. You can still paste messages manually from the review inbox.',
            {type: 'error', duration: 5000},
          );
          return;
        }
      }
      setEnabled(next);
      try {
        await setSmsTrackingEnabled(next);
        showToast(next ? 'Auto-tracking enabled' : 'Auto-tracking disabled', {
          type: 'success',
        });
      } catch {
        setEnabled(!next);
        showToast('Could not save setting', {type: 'error'});
      }
    },
    [showToast],
  );

  const handleAutoScanToggle = useCallback(
    async (next: boolean) => {
      setAutoScan(next);
      try {
        await setAutoScanOnOpenEnabled(next);
      } catch {
        setAutoScan(!next);
        showToast('Could not save setting', {type: 'error'});
      }
    },
    [showToast],
  );

  const switchColors = {
    trackColor: {false: theme.colors.border, true: theme.colors.primarySoft},
  };

  if (loading) {
    return (
      <AppScreen>
        <AppHeader title="Auto-tracking" />
        <LoadingState message="Loading settings…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader
        title="Auto-tracking"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="SMS detection" />
        <Card style={styles.card}>
          <SettingsRow
            icon={MessageSquareText}
            title="Detect expenses from SMS"
            subtitle={enabled ? 'On — scans on demand' : 'Off'}
            right={
              <Switch
                value={enabled}
                onValueChange={handleMasterToggle}
                trackColor={switchColors.trackColor}
                thumbColor={
                  enabled ? theme.colors.primary : theme.colors.textMuted
                }
                accessibilityLabel="Detect expenses from SMS"
              />
            }
          />
          <SettingsRow
            icon={ShieldCheck}
            title="SMS permission"
            subtitle={
              permission
                ? 'Granted — PaisaFlow can read the inbox'
                : 'Not granted — scanning is unavailable'
            }
            onPress={
              permission ? undefined : () => Linking.openSettings()
            }
            accessibilityHint={
              permission
                ? undefined
                : 'Opens Android app settings to enable SMS permission'
            }
          />
          <SettingsRow
            icon={RefreshCw}
            title="Scan when review inbox opens"
            subtitle={autoScan ? 'On' : 'Off — scan manually with pull-to-refresh'}
            right={
              <Switch
                value={autoScan}
                onValueChange={handleAutoScanToggle}
                trackColor={switchColors.trackColor}
                thumbColor={
                  autoScan ? theme.colors.primary : theme.colors.textMuted
                }
                accessibilityLabel="Scan when review inbox opens"
              />
            }
          />
        </Card>

        <SectionHeader title="What we read" style={styles.sectionGap} />
        <Card style={styles.card}>
          <View style={styles.privacyHeader}>
            <ScanText size={20} color={theme.colors.textSecondary} />
            <Text variant="bodyMedium">100% on-device</Text>
          </View>
          <Text variant="body" color="textSecondary">
            PaisaFlow reads your SMS inbox only when you scan, looks only for
            bank and UPI transaction alerts, and parses them entirely on this
            device. OTPs and promotional messages are ignored.
          </Text>
          <Text variant="body" color="textSecondary">
            Nothing is uploaded, synced, or shared — there is no server. Raw
            message text stays in the local review inbox until you approve or
            dismiss it. You can revoke SMS access anytime in Android settings.
          </Text>
        </Card>
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    card: {gap: theme.spacing.md},
    sectionGap: {marginTop: theme.spacing.xxl},
    privacyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
  });
