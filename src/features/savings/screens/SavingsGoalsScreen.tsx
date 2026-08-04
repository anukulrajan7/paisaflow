import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, PiggyBank, Plus} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  MetricCard,
  SectionHeader,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import {EmptyBudgetsIllustration} from '../../../design-system/illustrations';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {GoalCard} from '../components/GoalCard';
import {SavingsGoalFormSheet} from '../components/SavingsGoalFormSheet';
import {useSavingsGoalsData} from '../hooks/useSavingsGoalsData';
import type {SavingsGoal} from '../types/savingsGoal';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SavingsGoals'>;

interface FormState {
  visible: boolean;
  editing: SavingsGoal | null;
}

const CLOSED_FORM: FormState = {visible: false, editing: null};

/** Lists savings goals with total saved; add via a bottom-sheet form. */
export function SavingsGoalsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {data, loading, error, reload} = useSavingsGoalsData();

  const [form, setForm] = useState<FormState>(CLOSED_FORM);

  const openCreate = useCallback(
    () => setForm({visible: true, editing: null}),
    [],
  );
  const openDetails = useCallback(
    (goal: SavingsGoal) =>
      navigation.navigate('SavingsGoalDetails', {goalId: goal.id}),
    [navigation],
  );

  const activeGoals = useMemo(
    () => data?.goals.filter(goal => goal.isActive) ?? [],
    [data?.goals],
  );
  const pausedGoals = useMemo(
    () => data?.goals.filter(goal => !goal.isActive) ?? [],
    [data?.goals],
  );
  const hasGoals = activeGoals.length > 0 || pausedGoals.length > 0;
  // Single snapshot so every card compares against the same "now".
  const now = Date.now();

  const accountName = (accountId: string) =>
    data?.accounts.find(a => a.id === accountId)?.name ?? 'savings account';

  return (
    <AppScreen>
      <AppHeader
        title="Savings goals"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          hasGoals ? (
            <IconButton
              icon={Plus}
              onPress={openCreate}
              accessibilityLabel="Add savings goal"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading savings goals" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {hasGoals ? (
            <>
              <MetricCard
                label="Total saved"
                amountMinor={data.totalSavedMinor}
                currency={data.currency}
                icon={PiggyBank}
                caption={`Across ${data.goals.length} ${
                  data.goals.length === 1 ? 'goal' : 'goals'
                }`}
                accessibilityLabel="Total saved across goals"
                testID="savings-total-saved"
              />
              <View style={styles.section}>
                <SectionHeader title="Active" />
                {activeGoals.length > 0 ? (
                  activeGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      accountName={accountName(goal.savingsAccountId)}
                      now={now}
                      hasContributionThisPeriod={data.contributedThisPeriod.has(
                        goal.id,
                      )}
                      onPress={openDetails}
                      testID={`savings-goal-${goal.id}`}
                    />
                  ))
                ) : (
                  <EmptyState
                    title="All goals are paused"
                    message="Resume a goal below to keep contributing."
                  />
                )}
              </View>
              {pausedGoals.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Paused" />
                  {pausedGoals.map(goal => (
                    <GoalCard
                      key={goal.id}
                      goal={goal}
                      accountName={accountName(goal.savingsAccountId)}
                      now={now}
                      hasContributionThisPeriod={data.contributedThisPeriod.has(
                        goal.id,
                      )}
                      onPress={openDetails}
                      testID={`savings-goal-${goal.id}`}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <EmptyState
              illustration={<EmptyBudgetsIllustration />}
              title="No savings goals yet"
              message="Put money aside for something specific. Contributions move into an account you choose — as transfers, never expenses."
              actionLabel="Create a goal"
              onAction={openCreate}
              style={styles.empty}
            />
          )}
        </ScrollView>
      ) : null}

      {data ? (
        <SavingsGoalFormSheet
          visible={form.visible}
          onClose={() => setForm(CLOSED_FORM)}
          editing={form.editing}
          accounts={data.accounts}
          currency={data.currency}
        />
      ) : null}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    section: {gap: theme.spacing.sm},
    empty: {marginTop: theme.spacing.xxxl},
  });
