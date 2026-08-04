import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Plus, TriangleAlert} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  MetricCard,
  SectionHeader,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {RemindersIllustration} from '../../../design-system/illustrations';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {PersonFormSheet} from '../components/PersonFormSheet';
import {PersonRow} from '../components/PersonRow';
import {usePeopleData} from '../hooks/usePeopleData';
import type {Person} from '../types/person';

type Props = NativeStackScreenProps<SettingsStackParamList, 'People'>;

interface FormState {
  visible: boolean;
  editing: Person | null;
}

const CLOSED_FORM: FormState = {visible: false, editing: null};

/** People with open lending balances; add/edit via a bottom-sheet form. */
export function PeopleScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [now] = useState(() => Date.now());
  const {data, loading, error, reload} = usePeopleData(now);

  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const openCreate = useCallback(
    () => setForm({visible: true, editing: null}),
    [],
  );

  const openLedger = useCallback(
    (personId: string) => navigation.navigate('PersonLedger', {personId}),
    [navigation],
  );

  const hasPeople = (data?.summaries.length ?? 0) > 0;

  return (
    <AppScreen>
      <AppHeader
        title="People"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          hasPeople ? (
            <IconButton
              icon={Plus}
              onPress={openCreate}
              accessibilityLabel="Add person"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading people" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {hasPeople ? (
            <>
              <View style={styles.metrics}>
                <MetricCard
                  label="Owed to you"
                  amountMinor={data.totalOwedToMeMinor}
                  currency={data.currency}
                  type="income"
                  style={styles.metric}
                  testID="people-owed-to-you"
                />
                <MetricCard
                  label="You owe"
                  amountMinor={data.totalIOweMinor}
                  currency={data.currency}
                  type="expense"
                  style={styles.metric}
                  testID="people-you-owe"
                />
              </View>
              {data.overdueCount > 0 ? (
                <View
                  style={[
                    styles.overdueBanner,
                    {
                      backgroundColor: theme.colors.dangerSoft,
                      borderRadius: theme.radius.md,
                    },
                  ]}
                  accessibilityRole="text"
                  testID="people-overdue-banner">
                  <TriangleAlert size={16} color={theme.colors.danger} />
                  <Text variant="bodyMedium" color="danger">
                    {`${data.overdueCount} ${
                      data.overdueCount === 1 ? 'repayment is' : 'repayments are'
                    } overdue`}
                  </Text>
                </View>
              ) : null}
              <View style={styles.section}>
                <SectionHeader title="People" />
                {data.summaries.map(summary => (
                  <PersonRow
                    key={summary.person.id}
                    summary={summary}
                    currency={data.currency}
                    onPress={openLedger}
                    testID={`person-row-${summary.person.id}`}
                  />
                ))}
              </View>
            </>
          ) : (
            <EmptyState
              illustration={<RemindersIllustration />}
              title="No one added yet"
              message="Track money you lend to or borrow from friends and family. Each person gets a ledger with due dates and reminders."
              actionLabel="Add person"
              onAction={openCreate}
              style={styles.empty}
            />
          )}
        </ScrollView>
      ) : null}

      <PersonFormSheet
        visible={form.visible}
        onClose={() => setForm(CLOSED_FORM)}
        editing={form.editing}
      />
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    metrics: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    metric: {flex: 1},
    overdueBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    section: {gap: theme.spacing.sm},
    empty: {marginTop: theme.spacing.xxxl},
  });
