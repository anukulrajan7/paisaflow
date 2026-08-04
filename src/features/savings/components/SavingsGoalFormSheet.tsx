import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  Chip,
  DateTimeField,
  Input,
  MoneyInput,
  SegmentedControl,
  SelectField,
  Text,
  useToast,
} from '../../../design-system/components';
import type {
  SegmentedOption,
  SelectOption,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  defaultSavingsGoalFormValues,
  savingsGoalFormSchema,
} from '../schemas/savingsGoalFormSchema';
import type {SavingsGoalFormValues} from '../schemas/savingsGoalFormSchema';
import {
  getSavingsGoalsRepository,
  type SavingsGoalInput,
} from '../services/savingsGoalsRepository';
import type {
  ContributionFrequency,
  ReminderSlot,
  SavingsGoal,
} from '../types/savingsGoal';

export interface SavingsGoalFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Goal being edited; null creates a new one. */
  editing: SavingsGoal | null;
  /** Real accounts only (virtual types filtered out by the caller). */
  accounts: Account[];
  currency: string;
}

type FrequencyChoice = 'none' | ContributionFrequency;
type ReminderChoice = 'none' | ReminderSlot;

const FREQUENCY_OPTIONS: ReadonlyArray<SegmentedOption<FrequencyChoice>> = [
  {value: 'none', label: 'None'},
  {value: 'daily', label: 'Daily'},
  {value: 'weekly', label: 'Weekly'},
  {value: 'monthly', label: 'Monthly'},
];

const REMINDER_OPTIONS: ReadonlyArray<SelectOption<ReminderChoice>> = [
  {value: 'none', label: 'No reminder'},
  {value: 'morning', label: 'Morning'},
  {value: 'evening', label: 'Evening'},
];

/** Add/edit savings goal form in a bottom sheet (RHF + Zod). */
export function SavingsGoalFormSheet({
  visible,
  onClose,
  editing,
  accounts,
  currency,
}: SavingsGoalFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<SavingsGoalFormValues>({
    resolver: zodResolver(savingsGoalFormSchema),
    defaultValues: defaultSavingsGoalFormValues(),
  });

  const hasTargetDate = watch('hasTargetDate');
  const frequency = watch('frequency');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    if (editing) {
      reset({
        name: editing.name,
        targetMinor: editing.targetMinor,
        startingSavedMinor: null,
        hasTargetDate: editing.targetDate !== null,
        targetDate: editing.targetDate ?? Date.now(),
        savingsAccountId: editing.savingsAccountId,
        contributionAmountMinor: editing.contributionAmountMinor,
        frequency: editing.contributionFrequency ?? 'none',
        reminderSlot: editing.reminderSlot ?? 'none',
      });
    } else {
      reset(
        defaultSavingsGoalFormValues(
          accounts.find(a => a.isDefault)?.id ?? accounts[0]?.id ?? '',
        ),
      );
    }
  }, [visible, editing, accounts, reset]);

  const accountOptions = useMemo<ReadonlyArray<SelectOption>>(
    () => accounts.map(a => ({value: a.id, label: a.name})),
    [accounts],
  );

  const onSubmit = handleSubmit(async values => {
    if (values.targetMinor === null) {
      return; // refine already surfaced the message
    }
    const input: SavingsGoalInput = {
      name: values.name,
      targetMinor: values.targetMinor,
      // savedMinor is only settable at creation; afterwards contributions move it.
      savedMinor: editing ? undefined : values.startingSavedMinor ?? 0,
      currency,
      targetDate: values.hasTargetDate ? values.targetDate : null,
      savingsAccountId: values.savingsAccountId,
      contributionAmountMinor: values.contributionAmountMinor,
      contributionFrequency:
        values.frequency === 'none' ? null : values.frequency,
      reminderSlot:
        values.frequency === 'none' || values.reminderSlot === 'none'
          ? null
          : values.reminderSlot,
    };
    try {
      const repo = getSavingsGoalsRepository();
      if (editing) {
        await repo.updateGoal(editing.id, input);
        showToast('Goal updated', {type: 'success'});
      } else {
        await repo.createGoal(input);
        showToast('Savings goal created', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the goal',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit savings goal' : 'New savings goal'}>
      {/* Keyed remount so MoneyInputs re-seed their text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({field}) => (
            <Input
              label="Goal name"
              placeholder="e.g. New bike, Emergency fund"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.name?.message}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Goal name"
              testID="goal-form-name"
            />
          )}
        />

        <Controller
          control={control}
          name="targetMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Target amount"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.targetMinor?.message}
              accessibilityLabel="Target amount"
              testID="goal-form-target"
            />
          )}
        />

        {!editing ? (
          <Controller
            control={control}
            name="startingSavedMinor"
            render={({field: {value, onChange}}) => (
              <MoneyInput
                label="Already saved (optional)"
                valueMinor={value}
                onChangeMinor={onChange}
                currency={currency}
                error={errors.startingSavedMinor?.message}
                hint="Money already set aside for this goal — no transfer is created"
                accessibilityLabel="Amount already saved"
                testID="goal-form-starting-saved"
              />
            )}
          />
        ) : null}

        <View style={styles.field}>
          <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
            Target date (optional)
          </Text>
          <View style={styles.chipsWrap}>
            <Chip
              label="No deadline"
              selected={!hasTargetDate}
              onPress={() => setValue('hasTargetDate', false)}
              accessibilityLabel="No target date"
              testID="goal-form-no-deadline"
            />
            <Chip
              label="Set a date"
              selected={hasTargetDate}
              onPress={() => setValue('hasTargetDate', true)}
              accessibilityLabel="Set a target date"
              testID="goal-form-set-date"
            />
          </View>
        </View>

        {hasTargetDate ? (
          <Controller
            control={control}
            name="targetDate"
            render={({field}) => (
              <DateTimeField
                label="Reach it by"
                value={field.value}
                onChange={field.onChange}
                error={errors.targetDate?.message}
                accessibilityLabel="Target date"
                testID="goal-form-target-date"
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="savingsAccountId"
          render={({field}) => (
            <SelectField
              label="Savings account"
              placeholder="Choose an account"
              value={field.value || null}
              options={accountOptions}
              onSelect={field.onChange}
              error={errors.savingsAccountId?.message}
              accessibilityLabel="Savings account"
              testID="goal-form-account"
            />
          )}
        />
        <Text variant="caption" color="textMuted" style={styles.accountHint}>
          Contributions move money into this account with a transfer — never an
          expense.
        </Text>

        <Controller
          control={control}
          name="contributionAmountMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Planned contribution (optional)"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.contributionAmountMinor?.message}
              hint="Pre-fills the amount when you record a contribution"
              accessibilityLabel="Planned contribution amount"
              testID="goal-form-contribution-amount"
            />
          )}
        />

        <View style={styles.field}>
          <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
            Contribution frequency
          </Text>
          <Controller
            control={control}
            name="frequency"
            render={({field: {value, onChange}}) => (
              <SegmentedControl
                options={FREQUENCY_OPTIONS}
                value={value}
                onChange={onChange}
                accessibilityLabel="Contribution frequency"
                testID="goal-form-frequency"
              />
            )}
          />
        </View>

        {frequency !== 'none' ? (
          <Controller
            control={control}
            name="reminderSlot"
            render={({field}) => (
              <SelectField
                label="Reminder"
                placeholder="No reminder"
                value={field.value}
                options={REMINDER_OPTIONS}
                onSelect={field.onChange}
                error={errors.reminderSlot?.message}
                accessibilityLabel="Reminder slot"
                testID="goal-form-reminder"
              />
            )}
          />
        ) : null}

        {submitError ? (
          <Text variant="caption" color="danger">
            {submitError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title={editing ? 'Save changes' : 'Create goal'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="goal-form-submit"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    field: {gap: theme.spacing.xs},
    fieldLabel: {textTransform: 'uppercase'},
    accountHint: {marginTop: -theme.spacing.sm},
    chipsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
