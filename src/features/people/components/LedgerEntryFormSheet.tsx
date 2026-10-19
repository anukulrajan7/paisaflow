import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  DateTimeField,
  Input,
  MoneyInput,
  SegmentedControl,
  SelectField,
  Text,
  useToast,
  Switch,
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
  defaultLedgerEntryFormValues,
  ledgerEntryFormSchema,
} from '../schemas/ledgerEntryFormSchema';
import type {LedgerEntryFormValues} from '../schemas/ledgerEntryFormSchema';
import {getPeopleRepository} from '../services/peopleRepository';
import type {
  LedgerDirection,
  LedgerEntry,
  ReminderSlot,
} from '../types/person';

export interface LedgerEntryFormSheetProps {
  visible: boolean;
  onClose: () => void;
  personId: string;
  /** Entry being edited; null creates a new one. */
  editing: LedgerEntry | null;
  /** Real payment accounts (virtual accounts already excluded). */
  paymentAccounts: Account[];
  currency: string;
}

const DIRECTION_OPTIONS: ReadonlyArray<SegmentedOption<LedgerDirection>> = [
  {value: 'lent', label: 'I gave'},
  {value: 'borrowed', label: 'I borrowed'},
];

const SLOT_OPTIONS: ReadonlyArray<SegmentedOption<ReminderSlot>> = [
  {value: 'morning', label: 'Morning'},
  {value: 'evening', label: 'Evening'},
];

/**
 * Add/edit ledger entry form in a bottom sheet (RHF + Zod).
 *
 * Edit policy: while no repayment is recorded, financial fields (direction,
 * amount, account, date) are editable and the repository rewrites the
 * backing transfer atomically. Once a repayment exists those fields lock —
 * only due date, notes and reminder settings remain editable.
 */
export function LedgerEntryFormSheet({
  visible,
  onClose,
  personId,
  editing,
  paymentAccounts,
  currency,
}: LedgerEntryFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const financialsLocked = editing !== null && editing.repaidMinor > 0;

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<LedgerEntryFormValues>({
    resolver: zodResolver(ledgerEntryFormSchema),
    defaultValues: defaultLedgerEntryFormValues(),
  });

  const hasExpectedReturn = watch('hasExpectedReturn');
  const reminderEnabled = watch('reminderEnabled');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      editing
        ? {
            direction: editing.direction,
            amountMinor: editing.amountMinor,
            accountId: editing.accountId,
            occurredAt: editing.occurredAt,
            hasExpectedReturn: editing.expectedReturnAt !== null,
            expectedReturnAt: editing.expectedReturnAt,
            notes: editing.notes ?? '',
            reminderEnabled: editing.reminderEnabled,
            reminderSlot: editing.reminderSlot ?? 'morning',
          }
        : defaultLedgerEntryFormValues(
            paymentAccounts.find(a => a.isDefault)?.id ??
              paymentAccounts[0]?.id ??
              '',
          ),
    );
  }, [visible, editing, paymentAccounts, reset]);

  const accountOptions = useMemo<ReadonlyArray<SelectOption>>(
    () =>
      paymentAccounts.map(account => ({
        value: account.id,
        label: account.name,
      })),
    [paymentAccounts],
  );

  const onSubmit = handleSubmit(async values => {
    if (values.amountMinor === null) {
      return; // refine already surfaced the message
    }
    const details = {
      expectedReturnAt: values.hasExpectedReturn
        ? values.expectedReturnAt
        : null,
      notes: values.notes || null,
      reminderEnabled: values.reminderEnabled,
      reminderSlot: values.reminderEnabled ? values.reminderSlot : null,
    };
    try {
      const repo = getPeopleRepository();
      if (editing) {
        if (!financialsLocked) {
          await repo.editLedgerEntry(editing.id, {
            direction: values.direction,
            amountMinor: values.amountMinor,
            accountId: values.accountId,
            occurredAt: values.occurredAt,
          });
        }
        await repo.updateLedgerEntryDetails(editing.id, details);
        showToast('Entry updated', {type: 'success'});
      } else {
        await repo.addLedgerEntry({
          personId,
          direction: values.direction,
          amountMinor: values.amountMinor,
          currency,
          accountId: values.accountId,
          occurredAt: values.occurredAt,
          ...details,
        });
        showToast('Entry added', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the entry',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit entry' : 'Add entry'}>
      {/* Keyed remount so MoneyInput re-seeds its text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        {financialsLocked ? null : (
          <>
            <Controller
              control={control}
              name="direction"
              render={({field}) => (
                <SegmentedControl
                  options={DIRECTION_OPTIONS}
                  value={field.value}
                  onChange={field.onChange}
                  accessibilityLabel="Direction"
                  testID="ledger-form-direction"
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
                  accessibilityLabel="Ledger amount"
                  testID="ledger-form-amount"
                />
              )}
            />

            <Controller
              control={control}
              name="accountId"
              render={({field}) => (
                <SelectField
                  label="Payment account"
                  placeholder="Choose an account"
                  value={field.value || null}
                  options={accountOptions}
                  onSelect={field.onChange}
                  error={errors.accountId?.message}
                  accessibilityLabel="Payment account"
                  testID="ledger-form-account"
                />
              )}
            />

            <Controller
              control={control}
              name="occurredAt"
              render={({field}) => (
                <DateTimeField
                  label="Date"
                  value={field.value}
                  onChange={field.onChange}
                  error={errors.occurredAt?.message}
                  accessibilityLabel="Entry date"
                  testID="ledger-form-date"
                />
              )}
            />
          </>
        )}

        {financialsLocked ? (
          <Text variant="caption" color="textMuted">
            Amount, account and direction are locked because a repayment has
            been recorded.
          </Text>
        ) : null}

        <View style={styles.switchRow}>
          <View style={styles.switchTexts}>
            <Text variant="bodyMedium">Expected return date</Text>
            <Text variant="caption" color="textMuted">
              {hasExpectedReturn ? 'Used to flag overdue entries' : 'Not set'}
            </Text>
          </View>
          <Controller
            control={control}
            name="hasExpectedReturn"
            render={({field}) => (
              <Switch
                value={field.value}
                onValueChange={next => {
                  field.onChange(next);
                }}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primarySoft,
                }}
                thumbColor={
                  field.value ? theme.colors.primary : theme.colors.textMuted
                }
                accessibilityLabel="Set expected return date"
              />
            )}
          />
        </View>

        {hasExpectedReturn ? (
          <Controller
            control={control}
            name="expectedReturnAt"
            render={({field}) => (
              <DateTimeField
                label="Expected back by"
                value={field.value ?? Date.now()}
                onChange={field.onChange}
                error={errors.expectedReturnAt?.message}
                accessibilityLabel="Expected return date"
                testID="ledger-form-due-date"
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="notes"
          render={({field}) => (
            <Input
              label="Notes"
              placeholder="Optional note"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.notes?.message}
              returnKeyType="done"
              accessibilityLabel="Entry notes"
              testID="ledger-form-notes"
            />
          )}
        />

        <View style={styles.switchRow}>
          <View style={styles.switchTexts}>
            <Text variant="bodyMedium">Remind me</Text>
            <Text variant="caption" color="textMuted">
              {reminderEnabled
                ? 'A reminder is scheduled for this entry'
                : 'No reminder'}
            </Text>
          </View>
          <Controller
            control={control}
            name="reminderEnabled"
            render={({field}) => (
              <Switch
                value={field.value}
                onValueChange={field.onChange}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primarySoft,
                }}
                thumbColor={
                  field.value ? theme.colors.primary : theme.colors.textMuted
                }
                accessibilityLabel="Toggle reminder"
                testID="ledger-form-reminder"
              />
            )}
          />
        </View>

        {reminderEnabled ? (
          <Controller
            control={control}
            name="reminderSlot"
            render={({field}) => (
              <SegmentedControl
                options={SLOT_OPTIONS}
                value={field.value ?? 'morning'}
                onChange={field.onChange}
                accessibilityLabel="Reminder slot"
                testID="ledger-form-reminder-slot"
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
            title={editing ? 'Save changes' : 'Add entry'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="ledger-form-submit"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    switchRow: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    switchTexts: {flex: 1, gap: theme.spacing.xs},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
