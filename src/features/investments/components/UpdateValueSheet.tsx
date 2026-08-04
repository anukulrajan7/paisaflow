import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Controller, useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  MoneyInput,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {currentValueFormSchema} from '../schemas/investmentFormSchemas';
import type {CurrentValueFormValues} from '../schemas/investmentFormSchemas';
import {getInvestmentsRepository} from '../services/investmentsRepository';
import type {Investment} from '../types/investment';

export interface UpdateValueSheetProps {
  visible: boolean;
  onClose: () => void;
  investment: Investment;
  currency: string;
}

/**
 * Manual valuation sheet. There are no market APIs — the user types the
 * latest value (from their broker statement, app, etc.).
 */
export function UpdateValueSheet({
  visible,
  onClose,
  investment,
  currency,
}: UpdateValueSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<CurrentValueFormValues>({
    resolver: zodResolver(currentValueFormSchema),
    defaultValues: {currentValueMinor: null},
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset({currentValueMinor: investment.currentValueMinor});
  }, [visible, investment.currentValueMinor, reset]);

  const onSubmit = handleSubmit(async values => {
    if (values.currentValueMinor === null) {
      return; // refine already surfaced the message
    }
    try {
      await getInvestmentsRepository().updateCurrentValue(
        investment.id,
        values.currentValueMinor,
      );
      showToast('Current value updated', {type: 'success'});
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not update the value',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Update value · ${investment.name}`}
      footer={
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title="Save value"
            onPress={onSubmit}
            loading={isSubmitting}
            testID="update-value-submit"
          />
        </View>
      }>
      {/* Keyed remount so MoneyInput re-seeds its text each time. */}
      <View key={String(visible)} style={styles.form}>
        <Controller
          control={control}
          name="currentValueMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Current value"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.currentValueMinor?.message}
              hint="Check your broker or fund statement and enter the latest value"
              autoFocus
              accessibilityLabel="Current value"
              testID="update-value-input"
            />
          )}
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
    form: {gap: theme.spacing.lg, paddingBottom: theme.spacing.lg},
    actions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: theme.spacing.sm,
    },
  });
