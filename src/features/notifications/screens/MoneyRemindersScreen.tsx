import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {ScrollView, StyleSheet} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {
  ArrowLeft,
  BadgeIndianRupee,
  HandCoins,
  PiggyBank,
  TrendingUp,
  Wallet,
} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Card,
  IconButton,
  LoadingState,
  SectionHeader,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {getSettingsRepository} from '../../../database/repositories';
import {
  REMINDER_INCLUDE_KEYS,
  syncRemindersFromSettings,
} from '../../../services/notifications';
import type {ReminderIncludeCategory} from '../../../services/notifications';
import {IncludeToggleRow} from '../components/IncludeToggleRow';

type Props = NativeStackScreenProps<SettingsStackParamList, 'MoneyReminders'>;

type IncludeState = Record<ReminderIncludeCategory, boolean>;

const CATEGORIES: Array<{
  category: ReminderIncludeCategory;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}> = [
  {
    category: 'lent',
    icon: HandCoins,
    title: 'Money lent & borrowed',
    subtitle: 'Due and overdue payments (morning), repayments (evening)',
  },
  {
    category: 'salary',
    icon: BadgeIndianRupee,
    title: 'Salary',
    subtitle: 'Expected today (morning) or still unconfirmed (evening)',
  },
  {
    category: 'investments',
    icon: TrendingUp,
    title: 'Investments',
    subtitle: 'Contributions due on their reminder day (morning)',
  },
  {
    category: 'savings',
    icon: PiggyBank,
    title: 'Savings goals',
    subtitle: "Contributions due in each goal's reminder slot",
  },
  {
    category: 'spending',
    icon: Wallet,
    title: "Today's spending",
    subtitle: 'Evening summary of what you spent today',
  },
];

/**
 * Chooses which local data categories the morning/evening reminders mention.
 * Toggles persist as raw app_settings keys; every change re-syncs the
 * scheduled notifications so the next copy reflects the new selection.
 */
export function MoneyRemindersScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  const [includes, setIncludes] = useState<IncludeState | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const settings = getSettingsRepository();
      const entries = await Promise.all(
        CATEGORIES.map(async ({category}) => {
          const raw = await settings.getValue(REMINDER_INCLUDE_KEYS[category]);
          return [category, raw !== 'false'] as const;
        }),
      );
      if (mounted) {
        setIncludes(Object.fromEntries(entries) as IncludeState);
      }
    })().catch(() => {
      if (mounted) {
        showToast('Could not load reminder settings', {type: 'error'});
      }
    });
    return () => {
      mounted = false;
    };
  }, [showToast]);

  const handleToggle = useCallback(
    async (category: ReminderIncludeCategory, value: boolean) => {
      setIncludes(prev => (prev ? {...prev, [category]: value} : prev));
      try {
        await getSettingsRepository().setValue(
          REMINDER_INCLUDE_KEYS[category],
          value ? 'true' : 'false',
        );
        // Re-compose and re-schedule so the next reminder honors the change.
        await syncRemindersFromSettings();
      } catch {
        showToast('Could not save reminder setting', {type: 'error'});
      }
    },
    [showToast],
  );

  return (
    <AppScreen>
      <AppHeader
        title="Money reminders"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
      />
      {includes == null ? (
        <LoadingState message="Loading reminder settings…" />
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text variant="body" color="textSecondary">
              Your morning and evening reminders can mention what needs
              attention — money due back, salary, investments, savings and
              spending. Content is computed on this device from your local
              data; nothing is sent to a server.
            </Text>
          </Card>

          <SectionHeader
            title="Include in reminders"
            style={styles.sectionGap}
          />
          <Card style={styles.rowsCard}>
            {CATEGORIES.map(({category, icon, title, subtitle}) => (
              <IncludeToggleRow
                key={category}
                icon={icon}
                title={title}
                subtitle={subtitle}
                value={includes[category]}
                onToggle={value => handleToggle(category, value)}
                testID={`reminder-include-${category}`}
              />
            ))}
          </Card>

          <Text variant="caption" color="textMuted" style={styles.footer}>
            Content is computed when a reminder is scheduled and refreshed
            after your data changes — it reflects your data at that moment, not
            live at notification time. Reminder times and on/off switches live
            on the Settings screen.
          </Text>
        </ScrollView>
      )}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxxl,
    },
    rowsCard: {gap: theme.spacing.xs},
    sectionGap: {marginTop: theme.spacing.xxl},
    footer: {marginTop: theme.spacing.lg},
  });
