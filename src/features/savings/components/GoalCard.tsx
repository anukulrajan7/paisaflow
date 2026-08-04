import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {Card, Chip, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import type {SavingsGoal} from '../types/savingsGoal';
import {
  describeNextContribution,
  frequencyAdverb,
  isGoalComplete,
  remainingMinor,
  suggestedContributionMinor,
} from '../utils/savingsGoalMath';
import {GoalProgressBar} from './GoalProgressBar';

export interface GoalCardProps {
  goal: SavingsGoal;
  /** Name of the account holding this goal's money. */
  accountName: string;
  /** Snapshot timestamp shared by every card on the screen. */
  now: number;
  hasContributionThisPeriod: boolean;
  onPress: (goal: SavingsGoal) => void;
  testID?: string;
}

/** Goal summary card for the list screen: progress, remaining, suggestion. */
export function GoalCard({
  goal,
  accountName,
  now,
  hasContributionThisPeriod,
  onPress,
  testID,
}: GoalCardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const complete = isGoalComplete(goal);
  const suggested = suggestedContributionMinor(goal, now);
  const adverb = frequencyAdverb(goal.contributionFrequency);
  const nextDue = complete
    ? null
    : describeNextContribution(goal, now, hasContributionThisPeriod);

  return (
    <Card
      onPress={() => onPress(goal)}
      accessibilityLabel={`Goal ${goal.name}`}
      testID={testID}
      style={styles.card}>
      <View style={styles.titleRow}>
        <Text variant="bodyMedium" style={styles.title} numberOfLines={1}>
          {goal.name}
        </Text>
        {!goal.isActive ? <Chip label="Paused" selected={false} /> : null}
      </View>
      <Text variant="caption" color="textMuted">
        In {accountName}
      </Text>
      <GoalProgressBar
        savedMinor={goal.savedMinor}
        targetMinor={goal.targetMinor}
        currency={goal.currency}
      />
      {complete ? (
        <Text variant="caption" color="success">
          Target reached
        </Text>
      ) : (
        <Text variant="caption" color="textSecondary">
          {formatMoney(remainingMinor(goal), goal.currency)} to go
          {suggested !== null && adverb !== null
            ? ` · about ${formatMoney(suggested, goal.currency)} ${adverb}`
            : ''}
          {nextDue !== null ? ` · ${nextDue}` : ''}
        </Text>
      )}
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {gap: theme.spacing.sm},
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    title: {flex: 1},
  });
