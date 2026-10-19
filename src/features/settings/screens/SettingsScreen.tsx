import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  BadgeIndianRupee,
  Bell,
  BellRing,
  ClipboardPaste,
  Cloud,
  Database,
  Eraser,
  FileDown,
  HandCoins,
  Info,
  Lock,
  PiggyBank,
  Repeat,
  ScanText,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  BottomSheet,
  Button,
  Card,
  DateTimeField,
  Input,
  LoadingState,
  SectionHeader,
  SegmentedControl,
  SelectField,
  Text,
  useToast,
  Switch,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {RootTabParamList, SettingsStackParamList} from '../../../app/navigation/types';
import {getSettingsRepository} from '../../../database/repositories';
import type {ReminderSetting} from '../../../database/repositories/interfaces';
import {getDb} from '../../../database/connection';
import {
  isDemoDataLoaded,
  removeDemoData,
  seedDemoData,
} from '../../../database/seeds';
import type {ThemePreference} from '../../../store/themeStore';
import {useThemeStore} from '../../../store/themeStore';
import {useOnboardingStore} from '../../../store/onboardingStore';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  requestNotificationPermission,
  syncRemindersFromSettings,
} from '../../../services/notifications';
import {exportTransactionsCsv} from '../../../services/export';
import {dayjs} from '../../../utils/date';
import {
  isWeb,
  supportsBackgroundReminders,
  supportsCloudSync,
  supportsSmsInbox,
} from '../../../platform';
import {SettingsRow} from '../components/SettingsRow';
import {wipeAllLocalData} from '../services/wipeLocalData';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Settings'>;

const CURRENCY_OPTIONS = [
  {value: 'INR', label: '₹  INR — Indian Rupee'},
  {value: 'USD', label: '$  USD — US Dollar'},
  {value: 'EUR', label: '€  EUR — Euro'},
  {value: 'GBP', label: '£  GBP — British Pound'},
] as const;

const THEME_OPTIONS = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
] as const;

const CYCLE_DAY_OPTIONS = Array.from({length: 28}, (_, i) => {
  const day = String(i + 1);
  return {value: day, label: `Day ${day} of the month`};
});

/** 'HH:mm' -> epoch ms today (for DateTimeField), and back. */
function timeToEpochMs(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0).valueOf();
}

const DELETE_CONFIRM_WORD = 'DELETE';

export function SettingsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const themePreference = useThemeStore(state => state.preference);
  const setTheme = useThemeStore(state => state.setTheme);

  const [loading, setLoading] = useState(true);
  const [currency, setCurrency] = useState('INR');
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [morning, setMorning] = useState<ReminderSetting>({enabled: false, time: '08:30'});
  const [evening, setEvening] = useState<ReminderSetting>({enabled: false, time: '20:30'});

  const [exporting, setExporting] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  const [demoLoaded, setDemoLoaded] = useState(false);
  const [demoLoadSheetOpen, setDemoLoadSheetOpen] = useState(false);
  const [demoRemoveSheetOpen, setDemoRemoveSheetOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const settings = getSettingsRepository();
      const [storedCurrency, storedTheme, storedDay, storedMorning, storedEvening, hasDemoData] =
        await Promise.all([
          settings.getCurrency(),
          settings.getThemePreference(),
          settings.getBudgetCycleStartDay(),
          settings.getMorningReminder(),
          settings.getEveningReminder(),
          isDemoDataLoaded(getDb()),
        ]);
      if (!mounted) {
        return;
      }
      setCurrency(storedCurrency);
      setCycleStartDay(storedDay);
      setMorning(storedMorning);
      setEvening(storedEvening);
      setDemoLoaded(hasDemoData);
      // Keep the in-memory theme in sync with the persisted preference.
      if (storedTheme !== useThemeStore.getState().preference) {
        useThemeStore.getState().setTheme(storedTheme);
      }
      setLoading(false);
    })().catch(() => {
      if (mounted) {
        setLoading(false);
        showToast('Could not load settings', {type: 'error'});
      }
    });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const handleCurrency = useCallback(
    async (next: string) => {
      setCurrency(next);
      try {
        await getSettingsRepository().setCurrency(next);
        bumpDataVersion(); // amounts re-render in the new currency
        showToast('Currency updated', {type: 'success'});
      } catch {
        showToast('Could not save currency', {type: 'error'});
      }
    },
    [showToast],
  );

  const handleTheme = useCallback(
    async (next: ThemePreference) => {
      setTheme(next);
      try {
        await getSettingsRepository().setThemePreference(next);
        showToast('Theme updated', {type: 'success'});
      } catch {
        showToast('Could not save theme', {type: 'error'});
      }
    },
    [setTheme, showToast],
  );

  const handleCycleDay = useCallback(
    async (value: string) => {
      const day = Number.parseInt(value, 10);
      setCycleStartDay(day);
      try {
        await getSettingsRepository().setBudgetCycleStartDay(day);
        bumpDataVersion(); // budget-cycle periods shift
        showToast('Budget cycle updated', {type: 'success'});
      } catch {
        showToast('Could not save budget cycle', {type: 'error'});
      }
    },
    [showToast],
  );

  const persistReminder = useCallback(
    async (kind: 'morning' | 'evening', next: ReminderSetting) => {
      const apply = kind === 'morning' ? setMorning : setEvening;
      apply(next);
      try {
        const settings = getSettingsRepository();
        if (kind === 'morning') {
          await settings.setMorningReminder(next);
        } else {
          await settings.setEveningReminder(next);
        }
        await syncRemindersFromSettings();
        showToast('Reminder updated', {type: 'success'});
      } catch {
        showToast('Could not save reminder', {type: 'error'});
      }
    },
    [showToast],
  );

  const handleReminderToggle = useCallback(
    async (kind: 'morning' | 'evening', enabled: boolean) => {
      const current = kind === 'morning' ? morning : evening;
      if (enabled && !current.enabled) {
        const granted = await requestNotificationPermission().catch(() => false);
        if (!granted) {
          showToast(
            'Notifications are off. The reminder is saved, but enable notifications in system settings to receive it.',
            {type: 'error', duration: 5000},
          );
        }
      }
      await persistReminder(kind, {...current, enabled});
    },
    [morning, evening, persistReminder, showToast],
  );

  const handleReminderTime = useCallback(
    (kind: 'morning' | 'evening', epochMs: number) => {
      const current = kind === 'morning' ? morning : evening;
      const time = dayjs(epochMs).format('HH:mm');
      persistReminder(kind, {...current, time});
    },
    [morning, evening, persistReminder],
  );

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const result = await exportTransactionsCsv();
      showToast(
        `Exported ${result.count} transaction${result.count === 1 ? '' : 's'}`,
        {type: 'success'},
      );
    } catch {
      showToast('Export failed — please try again', {type: 'error'});
    } finally {
      setExporting(false);
    }
  }, [showToast]);

  const handleLoadDemoRow = useCallback(() => {
    if (demoLoaded) {
      showToast('Demo data already loaded', {type: 'info'});
      return;
    }
    setDemoLoadSheetOpen(true);
  }, [demoLoaded, showToast]);

  const handleLoadDemo = useCallback(async () => {
    setDemoBusy(true);
    try {
      const result = await seedDemoData(getDb());
      bumpDataVersion();
      setDemoLoaded(true);
      setDemoLoadSheetOpen(false);
      showToast(
        result === 'already-loaded'
          ? 'Demo data already loaded'
          : 'Demo data loaded',
        {type: 'success'},
      );
    } catch {
      showToast('Could not load demo data — please try again', {type: 'error'});
    } finally {
      setDemoBusy(false);
    }
  }, [showToast]);

  const handleRemoveDemoRow = useCallback(() => {
    if (!demoLoaded) {
      showToast('No demo data to remove', {type: 'info'});
      return;
    }
    setDemoRemoveSheetOpen(true);
  }, [demoLoaded, showToast]);

  const handleRemoveDemo = useCallback(async () => {
    setDemoBusy(true);
    try {
      const result = await removeDemoData(getDb());
      bumpDataVersion();
      setDemoLoaded(false);
      setDemoRemoveSheetOpen(false);
      showToast(
        result === 'removed' ? 'Demo data removed' : 'No demo data to remove',
        {type: 'success'},
      );
    } catch {
      showToast('Could not remove demo data — please try again', {
        type: 'error',
      });
    } finally {
      setDemoBusy(false);
    }
  }, [showToast]);

  const handleDeleteAll = useCallback(async () => {
    setDeleting(true);
    try {
      await wipeAllLocalData();
      await getSettingsRepository().setOnboardingComplete(false);
      setTheme('system');
      bumpDataVersion();
      // RootNavigator swaps the tabs for the onboarding flow on this flip.
      useOnboardingStore.getState().setOnboardingComplete(false);
      showToast('All local data deleted', {type: 'success'});
    } catch {
      setDeleting(false);
      setDeleteSheetOpen(false);
      showToast('Could not delete data — please try again', {type: 'error'});
    }
  }, [setTheme, showToast]);

  if (loading) {
    return (
      <AppScreen>
        <AppHeader title="Settings" />
        <LoadingState message="Loading settings…" />
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <AppHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content}>
        <SectionHeader title="Preferences" />
        <Card style={styles.card}>
          <SelectField
            label="Currency"
            value={currency}
            options={CURRENCY_OPTIONS}
            onSelect={value => handleCurrency(value)}
          />
          <View style={styles.fieldGroup}>
            <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
              THEME
            </Text>
            <SegmentedControl<ThemePreference>
              options={THEME_OPTIONS}
              value={themePreference}
              onChange={value => handleTheme(value)}
              accessibilityLabel="Theme"
            />
          </View>
          <SelectField
            label="Budget cycle starts on"
            value={String(cycleStartDay)}
            options={CYCLE_DAY_OPTIONS}
            onSelect={value => handleCycleDay(value)}
            accessibilityLabel="Budget cycle start day"
          />
        </Card>

        <SectionHeader title="Reminders" style={styles.sectionGap} />
        <Card style={styles.card}>
          {!supportsBackgroundReminders ? (
            <Text variant="caption" color="textSecondary">
              On the web, reminders can only appear while PaisaFlow stays open
              in a tab. For reminders that wake your phone, use the Android app.
            </Text>
          ) : null}
          <SettingsRow
            icon={Bell}
            title="Morning reminder"
            subtitle={morning.enabled ? `Daily at ${morning.time}` : 'Off'}
            right={
              <Switch
                value={morning.enabled}
                onValueChange={value => handleReminderToggle('morning', value)}
                trackColor={{false: theme.colors.border, true: theme.colors.primarySoft}}
                thumbColor={morning.enabled ? theme.colors.primary : theme.colors.textMuted}
                accessibilityLabel="Morning reminder"
              />
            }
          />
          {morning.enabled ? (
            <DateTimeField
              mode="time"
              label="Morning time"
              value={timeToEpochMs(morning.time)}
              onChange={epochMs => handleReminderTime('morning', epochMs)}
            />
          ) : null}
          <SettingsRow
            icon={BellRing}
            title="Evening reminder"
            subtitle={evening.enabled ? `Daily at ${evening.time}` : 'Off'}
            right={
              <Switch
                value={evening.enabled}
                onValueChange={value => handleReminderToggle('evening', value)}
                trackColor={{false: theme.colors.border, true: theme.colors.primarySoft}}
                thumbColor={evening.enabled ? theme.colors.primary : theme.colors.textMuted}
                accessibilityLabel="Evening reminder"
              />
            }
          />
          {evening.enabled ? (
            <DateTimeField
              mode="time"
              label="Evening time"
              value={timeToEpochMs(evening.time)}
              onChange={epochMs => handleReminderTime('evening', epochMs)}
            />
          ) : null}
        </Card>

        <SectionHeader title="AI assistant" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Sparkles}
            title="AI settings"
            subtitle="Optional — summarize local totals with your own OpenRouter key"
            onPress={() => navigation.navigate('AiSettings')}
          />
        </Card>

        <SectionHeader title="Auto-tracking" style={styles.sectionGap} />
        <Card style={styles.card}>
          {supportsSmsInbox ? (
            <SettingsRow
              icon={ScanText}
              title="SMS expense detection"
              subtitle="Review transactions detected from bank alerts — parsed on-device"
              onPress={() =>
                navigation
                  .getParent<BottomTabNavigationProp<RootTabParamList>>()
                  ?.navigate('TransactionsTab', {screen: 'TrackingSettings'})
              }
            />
          ) : (
            <SettingsRow
              icon={ClipboardPaste}
              title="Paste bank alerts"
              subtitle="SMS scanning needs the Android app. On the web, paste a bank SMS or email alert — it is parsed in this browser"
              onPress={() =>
                navigation
                  .getParent<BottomTabNavigationProp<RootTabParamList>>()
                  ?.navigate('TransactionsTab', {screen: 'ExpenseReview'})
              }
            />
          )}
        </Card>

        <SectionHeader title="Money hub" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Repeat}
            title="Recurring payments"
            subtitle="Rent, subscriptions and credit-card bills — get reminded, confirm in one tap"
            onPress={() => navigation.navigate('Recurring')}
          />
          <SettingsRow
            icon={HandCoins}
            title="People & money"
            subtitle="Track money lent to or borrowed from people, with reminders"
            onPress={() => navigation.navigate('People')}
          />
          <SettingsRow
            icon={BadgeIndianRupee}
            title="Salary"
            subtitle="Expected date, credit confirmation and history"
            onPress={() => navigation.navigate('Salary')}
          />
          <SettingsRow
            icon={TrendingUp}
            title="Investments"
            subtitle="Manual tracking of mutual funds, FDs, stocks and more"
            onPress={() => navigation.navigate('Investments')}
          />
          <SettingsRow
            icon={PiggyBank}
            title="Savings goals"
            subtitle="Targets, contributions and save-money reminders"
            onPress={() => navigation.navigate('SavingsGoals')}
          />
          <SettingsRow
            icon={BellRing}
            title="Money reminders"
            subtitle="Choose what morning and evening reminders include"
            onPress={() => navigation.navigate('MoneyReminders')}
          />
        </Card>

        <SectionHeader title="Security" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Lock}
            title="App lock"
            subtitle="Require a PIN to open PaisaFlow"
            onPress={() => navigation.navigate('AppLock')}
          />
          <SettingsRow
            icon={Cloud}
            title="Cloud sync (optional)"
            subtitle={
              supportsCloudSync
                ? 'Back up and sync with your own Supabase project'
                : 'Available in the Android app'
            }
            onPress={() => navigation.navigate('CloudSync')}
          />
        </Card>

        <SectionHeader title="Data" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Database}
            title="Load demo data"
            subtitle={
              demoLoaded
                ? 'Demo data is loaded — remove it anytime below'
                : 'Add sample transactions, goals and more to explore the app'
            }
            onPress={handleLoadDemoRow}
          />
          <SettingsRow
            icon={Eraser}
            title="Remove demo data"
            subtitle="Delete only the sample records added by Load demo data"
            onPress={handleRemoveDemoRow}
          />
          <SettingsRow
            icon={FileDown}
            title="Export transactions (CSV)"
            subtitle={
              isWeb
                ? 'Download all transactions as a spreadsheet-friendly file'
                : 'Share all transactions as a spreadsheet-friendly file'
            }
            onPress={() => handleExport()}
            disabled={exporting}
            accessibilityLabel={exporting ? 'Exporting transactions' : 'Export transactions as CSV'}
          />
          <SettingsRow
            icon={Trash2}
            title="Delete all data"
            subtitle={
              isWeb
                ? 'Wipe every transaction, account and setting stored in this browser'
                : 'Wipe every transaction, account and setting on this device'
            }
            danger
            onPress={() => {
              setDeleteConfirmText('');
              setDeleteSheetOpen(true);
            }}
          />
        </Card>

        <SectionHeader title="About" style={styles.sectionGap} />
        <Card style={styles.card}>
          <SettingsRow
            icon={Info}
            title="About PaisaFlow"
            subtitle="Version, privacy and credits"
            onPress={() => navigation.navigate('About')}
          />
        </Card>
      </ScrollView>

      <BottomSheet
        visible={deleteSheetOpen}
        onClose={() => setDeleteSheetOpen(false)}
        title="Delete all data?">
        <View style={styles.deleteSheet}>
          <Text variant="body" color="textSecondary">
            This permanently deletes every transaction, account, category,
            budget and setting stored on this device. There is no backup and
            no undo — consider exporting a CSV first.
          </Text>
          <Input
            label={`Type ${DELETE_CONFIRM_WORD} to confirm`}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={DELETE_CONFIRM_WORD}
            testID="delete-confirm-input"
          />
          <Button
            title="Delete everything"
            variant="danger"
            icon={Trash2}
            fullWidth
            loading={deleting}
            disabled={deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
            onPress={() => handleDeleteAll()}
            accessibilityHint="Permanently deletes all local data"
          />
          <Button
            title="Cancel"
            variant="ghost"
            fullWidth
            onPress={() => setDeleteSheetOpen(false)}
          />
        </View>
      </BottomSheet>
      <BottomSheet
        visible={demoLoadSheetOpen}
        onClose={() => setDemoLoadSheetOpen(false)}
        title="Load demo data?">
        <View style={styles.deleteSheet}>
          <Text variant="body" color="textSecondary">
            This adds sample records — transactions, budgets, a recurring rent
            rule, an overdue credit-card bill, salary, investments, a savings
            goal, people you lent to or borrowed from, and detected expenses —
            so you can explore every screen. Your existing data is kept, and
            you can remove just the demo records anytime with "Remove demo
            data".
          </Text>
          <Button
            title="Load demo data"
            variant="primary"
            icon={Database}
            fullWidth
            loading={demoBusy}
            onPress={() => handleLoadDemo()}
            accessibilityHint="Adds sample records alongside your existing data"
          />
          <Button
            title="Cancel"
            variant="ghost"
            fullWidth
            onPress={() => setDemoLoadSheetOpen(false)}
          />
        </View>
      </BottomSheet>

      <BottomSheet
        visible={demoRemoveSheetOpen}
        onClose={() => setDemoRemoveSheetOpen(false)}
        title="Remove demo data?">
        <View style={styles.deleteSheet}>
          <Text variant="body" color="textSecondary">
            This deletes only the sample records added by "Load demo data".
            Everything you entered yourself stays untouched.
          </Text>
          <Button
            title="Remove demo data"
            variant="danger"
            icon={Eraser}
            fullWidth
            loading={demoBusy}
            onPress={() => handleRemoveDemo()}
            accessibilityHint="Deletes only the sample demo records"
          />
          <Button
            title="Cancel"
            variant="ghost"
            fullWidth
            onPress={() => setDemoRemoveSheetOpen(false)}
          />
        </View>
      </BottomSheet>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    card: {gap: theme.spacing.lg},
    sectionGap: {marginTop: theme.spacing.xxl},
    fieldGroup: {gap: theme.spacing.xs},
    fieldLabel: {textTransform: 'uppercase'},
    deleteSheet: {gap: theme.spacing.lg},
  });
