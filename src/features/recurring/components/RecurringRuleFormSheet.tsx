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
import type {SelectOption, SegmentedOption} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account, Category} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  defaultRecurringRuleFormValues,
  recurringRuleFormSchema,
} from '../schemas/recurringRuleFormSchema';
import type {RecurringRuleFormValues} from '../schemas/recurringRuleFormSchema';
import {getRecurringRulesRepository} from '../services/recurringRulesRepository';
import type {
  RecurringFrequency,
  RecurringRule,
  RecurringRuleType,
} from '../types/recurringRule';

export interface RecurringRuleFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Rule being edited; null creates a new one. */
  editing: RecurringRule | null;
  accounts: Account[];
  categories: Category[];
  currency: string;
}

const TYPE_OPTIONS: ReadonlyArray<SegmentedOption<RecurringRuleType>> = [
  {value: 'expense', label: 'Expense'},
  {value: 'income', label: 'Income'},
  {value: 'transfer', label: 'Transfer'},
];

const FREQUENCY_OPTIONS: ReadonlyArray<SegmentedOption<RecurringFrequency>> = [
  {value: 'daily', label: 'Daily'},
  {value: 'weekly', label: 'Weekly'},
  {value: 'monthly', label: 'Monthly'},
  {value: 'yearly', label: 'Yearly'},
];

const FREQUENCY_UNIT: Record<RecurringFrequency, string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
  yearly: 'years',
};

/** Add/edit recurring rule form in a bottom sheet (RHF + Zod). */
export function RecurringRuleFormSheet({
  visible,
  onClose,
  editing,
  accounts,
  categories,
  currency,
}: RecurringRuleFormSheetProps) {
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
  } = useForm<RecurringRuleFormValues>({
    resolver: zodResolver(recurringRuleFormSchema),
    defaultValues: defaultRecurringRuleFormValues(),
  });

  const type = watch('type');
  const accountId = watch('accountId');
  const destinationAccountId = watch('destinationAccountId');
  const frequency = watch('frequency');
  const isTransfer = type === 'transfer';

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      editing
        ? {
            type: editing.type,
            amountMinor: editing.amountMinor,
            accountId: editing.accountId,
            destinationAccountId: editing.destinationAccountId,
            categoryId: editing.categoryId,
            merchant: editing.merchant ?? '',
            note: editing.note ?? '',
            frequency: editing.frequency,
            intervalText: String(editing.intervalCount),
            firstDueAt: editing.nextDueAt,
          }
        : defaultRecurringRuleFormValues(
            accounts.find(a => a.isDefault)?.id ?? '',
          ),
    );
  }, [visible, editing, accounts, reset]);

  const accountOptions = useMemo<ReadonlyArray<SelectOption>>(
    () => accounts.map(a => ({value: a.id, label: a.name})),
    [accounts],
  );

  const destinationOptions = useMemo<ReadonlyArray<SelectOption>>(
    () => accountOptions.filter(option => option.value !== accountId),
    [accountOptions, accountId],
  );

  const typeCategories = useMemo(
    () => categories.filter(c => c.type === (type === 'income' ? 'income' : 'expense')),
    [categories, type],
  );

  const destinationIsCreditCard =
    isTransfer &&
    destinationAccountId !== null &&
    accounts.find(a => a.id === destinationAccountId)?.type === 'credit_card';

  const handleTypeChange = (next: RecurringRuleType) => {
    setValue('type', next);
    if (next === 'transfer') {
      setValue('categoryId', null);
    } else {
      setValue('destinationAccountId', null);
    }
  };

  const onSubmit = handleSubmit(async values => {
    if (values.amountMinor === null) {
      return; // refine already surfaced the message
    }
    const input = {
      type: values.type,
      amountMinor: values.amountMinor,
      currency,
      accountId: values.accountId,
      destinationAccountId:
        values.type === 'transfer' ? values.destinationAccountId : null,
      categoryId: values.type === 'transfer' ? null : values.categoryId,
      merchant: values.merchant || null,
      note: values.note || null,
      frequency: values.frequency,
      intervalCount: Number(values.intervalText),
      nextDueAt: values.firstDueAt,
    };
    try {
      const repo = getRecurringRulesRepository();
      if (editing) {
        await repo.updateRule(editing.id, input);
        showToast('Recurring payment updated', {type: 'success'});
      } else {
        await repo.createRule(input);
        showToast('Recurring payment created', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the recurring payment',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit recurring payment' : 'Add recurring payment'}>
      {/* Keyed remount so MoneyInput re-seeds its text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="type"
          render={({field: {value}}) => (
            <SegmentedControl
              options={TYPE_OPTIONS}
              value={value}
              onChange={handleTypeChange}
              accessibilityLabel="Transaction type"
              testID="recurring-form-type"
            />
          )}
        />

        <Controller
          control={control}
          name="amountMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Amount"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.amountMinor?.message}
              accessibilityLabel="Recurring amount"
              testID="recurring-form-amount"
            />
          )}
        />

        <Controller
          control={control}
          name="accountId"
          render={({field}) => (
            <SelectField
              label={isTransfer ? 'From account' : 'Account'}
              placeholder="Choose an account"
              value={field.value || null}
              options={accountOptions}
              onSelect={field.onChange}
              error={errors.accountId?.message}
              accessibilityLabel="Account"
              testID="recurring-form-account"
            />
          )}
        />

        {isTransfer ? (
          <Controller
            control={control}
            name="destinationAccountId"
            render={({field}) => (
              <View style={styles.field}>
                <SelectField
                  label="To account"
                  placeholder="Choose a destination"
                  value={field.value}
                  options={destinationOptions}
                  onSelect={field.onChange}
                  error={errors.destinationAccountId?.message}
                  accessibilityLabel="Destination account"
                  testID="recurring-form-destination"
                />
                {destinationIsCreditCard ? (
                  <Text variant="caption" color="textMuted">
                    Transfers to a credit card are tracked as card bill payments.
                  </Text>
                ) : null}
              </View>
            )}
          />
        ) : null}

        {!isTransfer ? (
          <View style={styles.field}>
            <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
              Category
            </Text>
            <Controller
              control={control}
              name="categoryId"
              render={({field}) => (
                <View style={styles.chipsWrap}>
                  {typeCategories.map(category => (
                    <Chip
                      key={category.id}
                      label={category.name}
                      icon={getCategoryIcon(category.icon)}
                      selected={field.value === category.id}
                      onPress={() =>
                        field.onChange(
                          field.value === category.id ? null : category.id,
                        )
                      }
                    />
                  ))}
                </View>
              )}
            />
          </View>
        ) : null}

        <Controller
          control={control}
          name="merchant"
          render={({field}) => (
            <Input
              label={type === 'income' ? 'Source' : 'Merchant'}
              placeholder={
                type === 'income' ? 'e.g. Employer, client' : 'e.g. Netflix, Rent'
              }
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.merchant?.message}
              autoCapitalize="words"
              returnKeyType="next"
            />
          )}
        />

        <View style={styles.field}>
          <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
            Repeats
          </Text>
          <Controller
            control={control}
            name="frequency"
            render={({field: {value, onChange}}) => (
              <SegmentedControl
                options={FREQUENCY_OPTIONS}
                value={value}
                onChange={onChange}
                accessibilityLabel="Frequency"
                testID="recurring-form-frequency"
              />
            )}
          />
        </View>

        <Controller
          control={control}
          name="intervalText"
          render={({field}) => (
            <Input
              label="Repeat every"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.intervalText?.message}
              hint={`Number of ${FREQUENCY_UNIT[frequency]} between occurrences (usually 1)`}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Repeat interval"
              testID="recurring-form-interval"
            />
          )}
        />

        <Controller
          control={control}
          name="firstDueAt"
          render={({field}) => (
            <DateTimeField
              label={editing ? 'Next due date' : 'First due date'}
              value={field.value}
              onChange={field.onChange}
              error={errors.firstDueAt?.message}
              accessibilityLabel="Due date"
              testID="recurring-form-due-date"
            />
          )}
        />

        <Controller
          control={control}
          name="note"
          render={({field}) => (
            <Input
              label="Note"
              placeholder="Optional note"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.note?.message}
              returnKeyType="done"
            />
          )}
        />

        {submitError ? (
          <Text variant="caption" color="danger">
            {submitError}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title={editing ? 'Save changes' : 'Create rule'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="recurring-form-submit"
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
