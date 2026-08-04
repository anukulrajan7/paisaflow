import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  BottomSheet,
  Button,
  Input,
  MoneyInput,
  SelectField,
  Text,
  useToast,
} from '../../../design-system/components';
import type {SelectOption} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  isDuplicateContributionError,
  recordSavingsContribution,
} from '../services/recordSavingsContribution';
import type {SavingsGoal} from '../types/savingsGoal';
import {isGoalComplete} from '../utils/savingsGoalMath';

export interface RecordContributionSheetProps {
  visible: boolean;
  onClose: () => void;
  goal: SavingsGoal;
  /** Real accounts only (virtual types filtered out by the caller). */
  accounts: Account[];
}

/**
 * Records one contribution: a transfer from the chosen source account into
 * the goal's savings account (not an expense) plus the contribution log row.
 */
export function RecordContributionSheet({
  visible,
  onClose,
  goal,
  accounts,
}: RecordContributionSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();

  const [amountMinor, setAmountMinor] = useState<number | null>(null);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // The goal's own savings account can never be its contribution source.
  const sourceOptions = useMemo<ReadonlyArray<SelectOption>>(
    () =>
      accounts
        .filter(a => a.id !== goal.savingsAccountId)
        .map(a => ({value: a.id, label: a.name})),
    [accounts, goal.savingsAccountId],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    setNote('');
    setAmountMinor(goal.contributionAmountMinor);
    const fallback =
      accounts.find(a => a.isDefault && a.id !== goal.savingsAccountId) ??
      accounts.find(a => a.id !== goal.savingsAccountId);
    setSourceAccountId(fallback?.id ?? '');
  }, [visible, goal, accounts]);

  const onRecord = async () => {
    if (amountMinor === null || amountMinor <= 0) {
      setSubmitError('Enter an amount greater than zero');
      return;
    }
    if (!sourceAccountId) {
      setSubmitError('Choose a source account');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await recordSavingsContribution({
        goalId: goal.id,
        amountMinor,
        sourceAccountId,
        note: note.trim() || null,
      });
      bumpDataVersion();
      showToast(
        isGoalComplete(result.goal)
          ? 'Target reached — goal complete'
          : 'Contribution recorded',
        {type: 'success'},
      );
      onClose();
    } catch (e) {
      if (isDuplicateContributionError(e)) {
        showToast('Already recorded for this period', {type: 'info'});
        onClose();
      } else {
        setSubmitError(
          e instanceof Error ? e.message : 'Could not record the contribution',
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Record contribution"
      footer={
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title="Record"
            onPress={onRecord}
            loading={submitting}
            testID="contribution-submit"
          />
        </View>
      }>
      {/* Keyed remount so MoneyInput re-seeds the planned amount per open. */}
      <View key={`${goal.id}-${String(visible)}`} style={styles.form}>
        <Text variant="caption" color="textMuted">
          Moves money into {goal.name}'s savings account — a transfer, not an
          expense.
        </Text>
        <MoneyInput
          label="Amount"
          valueMinor={amountMinor}
          onChangeMinor={setAmountMinor}
          currency={goal.currency}
          accessibilityLabel="Contribution amount"
          testID="contribution-amount"
        />
        <SelectField
          label="From account"
          placeholder="Choose a source"
          value={sourceAccountId || null}
          options={sourceOptions}
          onSelect={setSourceAccountId}
          accessibilityLabel="Source account"
          testID="contribution-source"
        />
        <Input
          label="Note"
          placeholder="Optional note"
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          accessibilityLabel="Contribution note"
          testID="contribution-note"
        />
        {submitError ? (
          <Text variant="caption" color="danger">
            {submitError}
          </Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
