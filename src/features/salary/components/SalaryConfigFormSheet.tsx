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
  SelectField,
  Text,
  useToast,
} from '../../../design-system/components';
import type {SelectOption} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {dayjs} from '../../../utils/date';
import {
  defaultSalaryConfigFormValues,
  salaryConfigFormSchema,
} from '../schemas/salaryConfigFormSchema';
import type {SalaryConfigFormValues} from '../schemas/salaryConfigFormSchema';
import {getSalaryRepository} from '../services/salaryRepository';
import type {SalaryConfig} from '../types/salary';

export interface SalaryConfigFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Existing config being edited; null creates the setup. */
  editing: SalaryConfig | null;
  /** Real accounts only (caller filters out virtual ones). */
  accounts: Account[];
  currency: string;
}

/** 'HH:mm' -> epoch ms today at that time (DateTimeField is epoch-based). */
function reminderTimeToEpoch(reminderTime: string | null): number {
  const [hour, minute] = (reminderTime ?? '09:00').split(':').map(Number);
  return dayjs().hour(hour).minute(minute).second(0).millisecond(0).valueOf();
}

/** Setup/edit form for the single salary config, in a bottom sheet (RHF + Zod). */
export function SalaryConfigFormSheet({
  visible,
  onClose,
  editing,
  accounts,
  currency,
}: SalaryConfigFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<SalaryConfigFormValues>({
    resolver: zodResolver(salaryConfigFormSchema),
    defaultValues: defaultSalaryConfigFormValues(),
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      editing
        ? {
            amountMinor: editing.amountMinor,
            accountId: editing.accountId,
            employer: editing.employer ?? '',
            expectedDayText: String(editing.expectedDay),
            reminderAt: reminderTimeToEpoch(editing.reminderTime),
          }
        : defaultSalaryConfigFormValues(
            accounts.find(a => a.isDefault)?.id ?? '',
          ),
    );
  }, [visible, editing, accounts, reset]);

  const accountOptions = useMemo<ReadonlyArray<SelectOption>>(
    () => accounts.map(a => ({value: a.id, label: a.name})),
    [accounts],
  );

  const onSubmit = handleSubmit(async values => {
    if (values.amountMinor === null) {
      return; // refine already surfaced the message
    }
    try {
      await getSalaryRepository().saveConfig({
        amountMinor: values.amountMinor,
        currency,
        accountId: values.accountId,
        employer: values.employer || null,
        expectedDay: Number(values.expectedDayText),
        reminderTime: dayjs(values.reminderAt).format('HH:mm'),
      });
      bumpDataVersion();
      showToast(editing ? 'Salary details updated' : 'Salary set up', {
        type: 'success',
      });
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the salary details',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit salary' : 'Set up salary'}>
      {/* Keyed remount so MoneyInput re-seeds its text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="amountMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Monthly salary"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.amountMinor?.message}
              accessibilityLabel="Monthly salary amount"
              testID="salary-form-amount"
            />
          )}
        />

        <Controller
          control={control}
          name="accountId"
          render={({field}) => (
            <SelectField
              label="Credited to"
              placeholder="Choose an account"
              value={field.value || null}
              options={accountOptions}
              onSelect={field.onChange}
              error={errors.accountId?.message}
              accessibilityLabel="Destination account"
              testID="salary-form-account"
            />
          )}
        />

        <Controller
          control={control}
          name="employer"
          render={({field}) => (
            <Input
              label="Employer"
              placeholder="e.g. Acme Corp"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.employer?.message}
              autoCapitalize="words"
              returnKeyType="next"
            />
          )}
        />

        <Controller
          control={control}
          name="expectedDayText"
          render={({field}) => (
            <Input
              label="Expected day of month"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.expectedDayText?.message}
              hint="Day of the month the salary usually arrives (1-28)"
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Expected day of month"
              testID="salary-form-expected-day"
            />
          )}
        />

        <Controller
          control={control}
          name="reminderAt"
          render={({field}) => (
            <DateTimeField
              label="Reminder time"
              mode="time"
              value={field.value}
              onChange={field.onChange}
              error={errors.reminderAt?.message}
              accessibilityLabel="Reminder time"
              testID="salary-form-reminder-time"
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
            title={editing ? 'Save changes' : 'Save'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="salary-form-submit"
          />
        </View>
      </View>
    </BottomSheet>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
