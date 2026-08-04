import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, Check, Pencil} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  Button,
  Card,
  Divider,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
  SectionHeader,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {GoalProgressBar} from '../components/GoalProgressBar';
import {RecordContributionSheet} from '../components/RecordContributionSheet';
import {SavingsGoalFormSheet} from '../components/SavingsGoalFormSheet';
import {useSavingsGoalDetailsData} from '../hooks/useSavingsGoalDetailsData';
import {getSavingsGoalsRepository} from '../services/savingsGoalsRepository';
import {
  describeNextContribution,
  frequencyAdverb,
  frequencyLabel,
  isGoalComplete,
  remainingMinor,
  suggestedContributionMinor,
} from '../utils/savingsGoalMath';

type Props = NativeStackScreenProps<SettingsStackParamList, 'SavingsGoalDetails'>;

/** One label/value line in the details card. */
function DetailRow({label, value}: {label: string; value: string}) {
  const {theme} = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        },
        value: {flexShrink: 1, textAlign: 'right'},
      }),
    [theme],
  );
  return (
    <View style={styles.row}>
      <Text variant="body" color="textSecondary">
        {label}
      </Text>
      <Text variant="bodyMedium" style={styles.value}>
        {value}
      </Text>
    </View>
  );
}

/** Goal detail: progress, record contributions, history, pause/delete. */
export function SavingsGoalDetailsScreen({navigation, route}: Props) {
  const {goalId} = route.params;
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {data, loading, error, reload} = useSavingsGoalDetailsData(goalId);

  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const goal = data?.goal ?? null;

  const toggleActive = useCallback(async () => {
    if (!goal) {
      return;
    }
    try {
      await getSavingsGoalsRepository().setGoalActive(goal.id, !goal.isActive);
      bumpDataVersion();
      showToast(goal.isActive ? 'Goal paused' : 'Goal resumed', {
        type: 'success',
      });
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not update the goal',
        {type: 'error'},
      );
    }
  }, [goal, showToast]);

  const confirmDelete = useCallback(async () => {
    if (!goal) {
      return;
    }
    setDeleteBusy(true);
    try {
      await getSavingsGoalsRepository().deleteGoal(goal.id);
      bumpDataVersion();
      showToast('Savings goal deleted', {type: 'success'});
      setDeleting(false);
      navigation.goBack();
    } catch (e) {
      showToast(
        e instanceof Error ? e.message : 'Could not delete the goal',
        {type: 'error'},
      );
    } finally {
      setDeleteBusy(false);
    }
  }, [goal, navigation, showToast]);

  // Single snapshot for all derived display values.
  const now = Date.now();
  const complete = goal ? isGoalComplete(goal) : false;
  const suggested = goal ? suggestedContributionMinor(goal, now) : null;
  const adverb = goal ? frequencyAdverb(goal.contributionFrequency) : null;
  const nextDue =
    goal && !complete && goal.isActive
      ? describeNextContribution(
          goal,
          now,
          data?.hasContributionThisPeriod ?? false,
        )
      : null;
  const savingsAccountName = goal
    ? data?.accountsById.get(goal.savingsAccountId)?.name ?? 'Savings account'
    : '';

  const scheduleSummary = useMemo(() => {
    if (!goal?.contributionFrequency) {
      return 'No schedule';
    }
    const cadence = frequencyLabel(goal.contributionFrequency);
    return goal.contributionAmountMinor !== null
      ? `${cadence} · ${formatMoney(goal.contributionAmountMinor, goal.currency)}`
      : cadence ?? 'No schedule';
  }, [goal]);

  return (
    <AppScreen>
      <AppHeader
        title={goal?.name ?? 'Savings goal'}
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          goal ? (
            <IconButton
              icon={Pencil}
              onPress={() => setEditing(true)}
              accessibilityLabel="Edit savings goal"
              testID="goal-edit"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading goal" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data && !goal ? (
        <EmptyState
          title="Goal not found"
          message="This savings goal may have been deleted."
          actionLabel="Go back"
          onAction={() => navigation.goBack()}
          style={styles.empty}
        />
      ) : data && goal ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          <Card style={styles.progressCard}>
            {complete ? (
              <View style={styles.completeRow}>
                <Check size={18} color={theme.colors.success} />
                <Text variant="bodyMedium" color="success" style={styles.flex}>
                  Target reached — nicely done.
                </Text>
              </View>
            ) : null}
            <View style={styles.savedRow}>
              <AmountText
                amountMinor={goal.savedMinor}
                currency={goal.currency}
                size="large"
                showSign={false}
                accessibilityLabel={`Saved ${formatMoney(
                  goal.savedMinor,
                  goal.currency,
                )}`}
                testID="goal-saved-amount"
              />
              <Text variant="body" color="textMuted">
                of {formatMoney(goal.targetMinor, goal.currency)}
              </Text>
            </View>
            <GoalProgressBar
              savedMinor={goal.savedMinor}
              targetMinor={goal.targetMinor}
              currency={goal.currency}
              testID="goal-progress"
            />
            {!complete ? (
              <Text variant="caption" color="textSecondary">
                {formatMoney(remainingMinor(goal), goal.currency)} to go
                {suggested !== null && adverb !== null
                  ? ` · about ${formatMoney(suggested, goal.currency)} ${adverb}`
                  : ''}
                {nextDue !== null ? ` · ${nextDue}` : ''}
              </Text>
            ) : null}
            {goal.isActive ? (
              <Button
                title="Record contribution"
                onPress={() => setRecording(true)}
                testID="goal-record"
              />
            ) : (
              <Text variant="caption" color="textMuted">
                This goal is paused — resume it to record contributions.
              </Text>
            )}
          </Card>

          <View style={styles.section}>
            <SectionHeader title="Details" />
            <Card style={styles.detailsCard}>
              <DetailRow label="Savings account" value={savingsAccountName} />
              <Divider />
              <DetailRow
                label="Target date"
                value={
                  goal.targetDate !== null
                    ? dayjs(goal.targetDate).format('D MMM YYYY')
                    : 'No deadline'
                }
              />
              <Divider />
              <DetailRow label="Schedule" value={scheduleSummary} />
              <Divider />
              <DetailRow
                label="Reminder"
                value={
                  goal.reminderSlot === 'morning'
                    ? 'Morning'
                    : goal.reminderSlot === 'evening'
                      ? 'Evening'
                      : 'None'
                }
              />
            </Card>
          </View>

          <View style={styles.section}>
            <SectionHeader title="Contributions" />
            {data.contributions.length > 0 ? (
              <Card style={styles.historyCard}>
                {data.contributions.map((contribution, index) => (
                  <React.Fragment key={contribution.id}>
                    {index > 0 ? <Divider /> : null}
                    <View style={styles.historyRow}>
                      <Text variant="body" color="textSecondary">
                        {dayjs(contribution.createdAt).format('D MMM YYYY')}
                      </Text>
                      <AmountText
                        amountMinor={contribution.amountMinor}
                        currency={goal.currency}
                        size="body"
                        showSign={false}
                        accessibilityLabel={`Contribution ${formatMoney(
                          contribution.amountMinor,
                          goal.currency,
                        )}`}
                      />
                    </View>
                  </React.Fragment>
                ))}
              </Card>
            ) : (
              <Text variant="body" color="textSecondary">
                No contributions yet. Record the first one above.
              </Text>
            )}
          </View>

          <View style={styles.actionsSection}>
            <Button
              title={goal.isActive ? 'Pause goal' : 'Resume goal'}
              variant="secondary"
              onPress={toggleActive}
              testID="goal-toggle-active"
            />
            <Button
              title="Delete goal"
              variant="danger"
              onPress={() => setDeleting(true)}
              testID="goal-delete"
            />
          </View>
        </ScrollView>
      ) : null}

      {goal && data ? (
        <>
          <SavingsGoalFormSheet
            visible={editing}
            onClose={() => setEditing(false)}
            editing={goal}
            accounts={data.accounts}
            currency={data.currency}
          />
          <RecordContributionSheet
            visible={recording}
            onClose={() => setRecording(false)}
            goal={goal}
            accounts={data.accounts}
          />
        </>
      ) : null}

      <Modal
        visible={deleting}
        onClose={() => setDeleting(false)}
        title="Delete savings goal?"
        actions={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setDeleting(false)}
            />
            <Button
              title="Delete"
              variant="danger"
              onPress={confirmDelete}
              loading={deleteBusy}
              testID="confirm-delete-goal"
            />
          </>
        }>
        <Text variant="body" color="textSecondary">
          {goal
            ? `This deletes ${goal.name} and its contribution history. The transfers already recorded into ${savingsAccountName} are kept — the money stays where it is.`
            : ''}
        </Text>
      </Modal>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    progressCard: {gap: theme.spacing.md},
    completeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: theme.spacing.sm,
    },
    section: {gap: theme.spacing.sm},
    detailsCard: {gap: theme.spacing.md},
    historyCard: {gap: theme.spacing.md},
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    actionsSection: {gap: theme.spacing.sm},
    flex: {flex: 1},
    empty: {marginTop: theme.spacing.xxxl},
  });
