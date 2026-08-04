import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {BellRing, ShieldCheck} from 'lucide-react-native';

import {
  AppScreen,
  Button,
  Card,
  SegmentedControl,
  SelectField,
  Text,
} from '../../../design-system/components';
import type {SelectOption} from '../../../design-system/components';
import {
  PreferencesIllustration,
  RemindersIllustration,
  WelcomeIllustration,
} from '../../../design-system/illustrations';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {getSettingsRepository} from '../../../database/repositories';
import {
  requestNotificationPermission,
  syncRemindersFromSettings,
} from '../../../services/notifications';
import {markOnboardingComplete} from '../../../app/bootstrap/onboarding';
import {dayjs} from '../../../utils/date';
import type {RootStackParamList} from '../../../app/navigation/types';
import type {ThemePreference} from '../../../store/themeStore';
import {StepProgress} from '../components/StepProgress';
import {ReminderRow} from '../components/ReminderRow';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

const TOTAL_STEPS = 3;

const CURRENCY_OPTIONS: ReadonlyArray<SelectOption> = [
  {value: 'INR', label: 'Indian Rupee (₹)'},
  {value: 'USD', label: 'US Dollar ($)'},
  {value: 'EUR', label: 'Euro (€)'},
  {value: 'GBP', label: 'British Pound (£)'},
];

const THEME_OPTIONS: ReadonlyArray<{value: ThemePreference; label: string}> = [
  {value: 'system', label: 'System'},
  {value: 'light', label: 'Light'},
  {value: 'dark', label: 'Dark'},
];

function ordinal(day: number): string {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

const CYCLE_DAY_OPTIONS: ReadonlyArray<SelectOption> = Array.from(
  {length: 28},
  (_, index) => {
    const day = index + 1;
    return {value: String(day), label: `${ordinal(day)} of the month`};
  },
);

/** Today's date at the given local time, as epoch milliseconds. */
function timeToEpoch(hour: number, minute: number): number {
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0).valueOf();
}

function epochToHHmm(epochMs: number): string {
  return dayjs(epochMs).format('HH:mm');
}

type PermissionState = 'unknown' | 'granted' | 'denied';

export function OnboardingScreen(_props: Props) {
  const {theme, preference, setTheme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [step, setStep] = useState(0);

  // Step 2 — preferences
  const [currency, setCurrency] = useState('INR');
  const [cycleDay, setCycleDay] = useState(1);
  const [themeChoice, setThemeChoice] = useState<ThemePreference>(preference);

  // Step 3 — reminders
  const [morningEnabled, setMorningEnabled] = useState(true);
  const [morningTime, setMorningTime] = useState(() => timeToEpoch(8, 30));
  const [eveningEnabled, setEveningEnabled] = useState(true);
  const [eveningTime, setEveningTime] = useState(() => timeToEpoch(20, 30));
  const [permission, setPermission] = useState<PermissionState>('unknown');

  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleThemeChange = (value: ThemePreference) => {
    setThemeChoice(value);
    // Live preview; the preference is persisted when the flow finishes.
    setTheme(value);
  };

  const handleRequestPermission = async () => {
    try {
      const granted = await requestNotificationPermission();
      setPermission(granted ? 'granted' : 'denied');
    } catch {
      setPermission('denied');
    }
  };

  const handleFinish = async () => {
    setFinishing(true);
    setError(null);
    const settings = getSettingsRepository();
    try {
      await settings.setCurrency(currency);
      await settings.setBudgetCycleStartDay(cycleDay);
      await settings.setThemePreference(themeChoice);
      await settings.setMorningReminder({
        enabled: morningEnabled,
        time: epochToHHmm(morningTime),
      });
      await settings.setEveningReminder({
        enabled: eveningEnabled,
        time: epochToHHmm(eveningTime),
      });
    } catch {
      setError('Could not save your preferences. Please try again.');
      setFinishing(false);
      return;
    }
    try {
      await syncRemindersFromSettings();
    } catch {
      // Reminders can be rescheduled later from Settings — don't block onboarding.
    }
    try {
      await markOnboardingComplete();
    } catch {
      setError('Something went wrong. Please try again.');
      setFinishing(false);
    }
  };

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <AppScreen padded>
      <View style={styles.progress}>
        <StepProgress step={step} total={TOTAL_STEPS} />
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {step === 0 ? (
          <View style={styles.stepBody}>
            <View style={styles.heroIllustration}>
              <WelcomeIllustration size={160} />
            </View>
            <Text variant="heading" align="center">
              Welcome to PaisaFlow
            </Text>
            <Text variant="body" color="textSecondary" align="center">
              A calm, offline-first way to track where your money goes.
            </Text>
            <Card style={styles.privacyCard}>
              <ShieldCheck size={22} color={theme.colors.success} />
              <Text
                variant="body"
                color="textSecondary"
                style={styles.privacyText}>
                All your data stays on this device. No account, no cloud, no
                tracking — your finances are yours alone.
              </Text>
            </Card>
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.stepBody}>
            <View style={styles.stepIllustration}>
              <PreferencesIllustration size={160} />
            </View>
            <Text variant="title">Set your preferences</Text>
            <Text variant="body" color="textSecondary">
              You can change any of these later from Settings.
            </Text>
            <SelectField
              label="Currency"
              value={currency}
              options={CURRENCY_OPTIONS}
              onSelect={setCurrency}
              accessibilityLabel="Currency"
            />
            <SelectField
              label="Budget cycle starts on"
              value={String(cycleDay)}
              options={CYCLE_DAY_OPTIONS}
              onSelect={value => setCycleDay(Number(value))}
              accessibilityLabel="Budget cycle start day"
            />
            <View style={styles.themeField}>
              <Text variant="label" color="textSecondary" style={styles.label}>
                Theme
              </Text>
              <SegmentedControl
                options={THEME_OPTIONS}
                value={themeChoice}
                onChange={handleThemeChange}
                accessibilityLabel="Theme"
              />
            </View>
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.stepBody}>
            <View style={styles.stepIllustration}>
              <RemindersIllustration size={160} />
            </View>
            <Text variant="title">Gentle reminders</Text>
            <Text variant="body" color="textSecondary">
              A quick nudge to log your spending keeps the habit alive. Both are
              optional.
            </Text>
            <ReminderRow
              title="Morning"
              description="Plan the day ahead"
              enabled={morningEnabled}
              onToggle={setMorningEnabled}
              time={morningTime}
              onTimeChange={setMorningTime}
            />
            <ReminderRow
              title="Evening"
              description="Log today's spending"
              enabled={eveningEnabled}
              onToggle={setEveningEnabled}
              time={eveningTime}
              onTimeChange={setEveningTime}
            />
            <Card style={styles.permissionCard}>
              <View style={styles.permissionHeader}>
                <BellRing size={22} color={theme.colors.primary} />
                <Text variant="bodyMedium" style={styles.flex}>
                  Notifications stay on-device
                </Text>
              </View>
              <Text variant="body" color="textSecondary">
                PaisaFlow only uses notifications for these reminders. Nothing
                is sent to a server — Android just needs your permission to
                show them.
              </Text>
              <Button
                title={
                  permission === 'granted'
                    ? 'Notifications enabled'
                    : 'Allow notifications'
                }
                variant="secondary"
                onPress={handleRequestPermission}
                disabled={permission === 'granted'}
                fullWidth
              />
              {permission === 'denied' ? (
                <Text variant="caption" color="textMuted">
                  Permission was declined — no problem, you can enable it later
                  from Settings.
                </Text>
              ) : null}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      {error ? (
        <Text variant="caption" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.footer}>
        {step > 0 ? (
          <Button
            title="Back"
            variant="ghost"
            onPress={() => setStep(current => current - 1)}
            disabled={finishing}
          />
        ) : null}
        <View style={styles.flex}>
          <Button
            title={step === 0 ? 'Continue' : isLastStep ? 'Finish setup' : 'Next'}
            onPress={
              isLastStep
                ? handleFinish
                : () => setStep(current => current + 1)
            }
            loading={finishing}
            fullWidth
          />
        </View>
      </View>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    flex: {flex: 1},
    progress: {
      paddingTop: theme.spacing.md,
      paddingBottom: theme.spacing.lg,
    },
    scrollContent: {
      paddingBottom: theme.spacing.xl,
    },
    stepBody: {
      gap: theme.spacing.lg,
    },
    heroIllustration: {
      alignSelf: 'center',
      marginTop: theme.spacing.xl,
    },
    stepIllustration: {
      alignSelf: 'center',
      marginTop: theme.spacing.md,
    },
    privacyCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: theme.spacing.md,
      marginTop: theme.spacing.md,
    },
    privacyText: {
      flex: 1,
    },
    label: {
      textTransform: 'uppercase',
    },
    themeField: {
      gap: theme.spacing.xs,
    },
    permissionCard: {
      gap: theme.spacing.md,
    },
    permissionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    error: {
      paddingBottom: theme.spacing.sm,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingTop: theme.spacing.md,
    },
  });
