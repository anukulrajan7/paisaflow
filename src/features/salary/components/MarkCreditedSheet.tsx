import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  Input,
  MoneyInput,
  SegmentedControl,
  Text,
  useToast,
} from '../../../design-system/components';
import type {SegmentedOption} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {formatMoney} from '../../../utils/money';
import {createConfirmSalarySchema} from '../schemas/confirmSalarySchema';
import type {ConfirmSalaryFormValues} from '../schemas/confirmSalarySchema';
import {confirmSalary} from '../services/confirmSalary';
import type {SalaryConfig, SalaryRecordStatus} from '../types/salary';

export interface MarkCreditedSheetProps {
  visible: boolean;
  onClose: () => void;
  config: SalaryConfig;
  /** 'YYYY-MM' period being confirmed. */
  periodKey: string;
}

const STATUS_OPTIONS: ReadonlyArray<SegmentedOption<SalaryRecordStatus>> = [
  {value: 'credited', label: 'Full'},
  {value: 'partial', label: 'Partial'},
  {value: 'bonus', label: 'Bonus'},
  {value: 'delayed', label: 'Delayed'},
];

const SUCCESS_MESSAGE: Record<SalaryRecordStatus, string> = {
  credited: 'Salary marked as credited',
  partial: 'Partial salary recorded',
  bonus: 'Salary with bonus recorded',
  delayed: 'Marked as delayed',
};

/**
 * Confirms a month's salary: full / partial / bonus create the income
 * transaction; 'delayed' only records the miss (no money moves) until the
 * salary actually arrives and is confirmed here.
 */
export function MarkCreditedSheet({
  visible,
  onClose,
  config,
  periodKey,
}: MarkCreditedSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const schema = useMemo(
    () => createConfirmSalarySchema(config.amountMinor),
    [config.amountMinor],
  );

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<ConfirmSalaryFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {status: 'credited', amountMinor: config.amountMinor, note: ''},
  });

  const status = watch('status');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset({status: 'credited', amountMinor: config.amountMinor, note: ''});
  }, [visible, config.amountMinor, reset]);

  const onSubmit = handleSubmit(async values => {
    try {
      await confirmSalary({
        config,
        periodKey,
        status: values.status,
        amountMinor: values.amountMinor ?? undefined,
        note: values.note || null,
      });
      bumpDataVersion();
      showToast(SUCCESS_MESSAGE[values.status], {type: 'success'});
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not record the salary',
      );
    }
  });

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Record salary">
      {/* Keyed remount so MoneyInput re-seeds to the expected amount. */}
      <View key={`${periodKey}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="status"
          render={({field}) => (
            <SegmentedControl
              options={STATUS_OPTIONS}
              value={field.value}
              onChange={field.onChange}
              accessibilityLabel="What happened with this month's salary"
              testID="salary-confirm-status"
            />
          )}
        />

        {status === 'delayed' ? (
          <Text variant="body" color="textSecondary">
            No transaction is created. When the salary arrives, confirm it here
            as full, partial or bonus.
          </Text>
        ) : (
          <Controller
            control={control}
            name="amountMinor"
            render={({field: {value, onChange}}) => (
              <MoneyInput
                label="Received amount"
                valueMinor={value}
                onChangeMinor={onChange}
                currency={config.currency}
                error={errors.amountMinor?.message}
                hint={`Expected ${formatMoney(
                  config.amountMinor,
                  config.currency,
                )}`}
                accessibilityLabel="Received amount"
                testID="salary-confirm-amount"
              />
            )}
          />
        )}

        <Controller
          control={control}
          name="note"
          render={({field}) => (
            <Input
              label="Note"
              placeholder={
                status === 'bonus' ? 'e.g. Diwali bonus' : 'Optional note'
              }
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
            title="Confirm"
            onPress={onSubmit}
            loading={isSubmitting}
            testID="salary-confirm-submit"
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
