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
import {
  contributionFormSchema,
  defaultContributionFormValues,
} from '../schemas/investmentFormSchemas';
import type {ContributionFormValues} from '../schemas/investmentFormSchemas';
import {addInvestmentContribution} from '../services/addInvestmentContribution';
import type {Investment} from '../types/investment';

export interface ContributionFormSheetProps {
  visible: boolean;
  onClose: () => void;
  investment: Investment;
  /** Real accounts usable as payment sources. */
  paymentAccounts: Account[];
  currency: string;
}

/**
 * 'Add contribution' sheet: amount + payment account + date + note. Saves as
 * a transfer into the investment's holding account — money moved, not spent.
 */
export function ContributionFormSheet({
  visible,
  onClose,
  investment,
  paymentAccounts,
  currency,
}: ContributionFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<ContributionFormValues>({
    resolver: zodResolver(contributionFormSchema),
    defaultValues: defaultContributionFormValues(),
  });

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      defaultContributionFormValues(
        paymentAccounts.find(a => a.isDefault)?.id ?? '',
      ),
    );
  }, [visible, paymentAccounts, reset]);

  const accountOptions = useMemo<ReadonlyArray<SelectOption>>(
    () => paymentAccounts.map(a => ({value: a.id, label: a.name})),
    [paymentAccounts],
  );

  const onSubmit = handleSubmit(async values => {
    if (values.amountMinor === null) {
      return; // refine already surfaced the message
    }
    try {
      await addInvestmentContribution({
        investmentId: investment.id,
        amountMinor: values.amountMinor,
        accountId: values.accountId,
        occurredAt: values.occurredAt,
        note: values.note || null,
      });
      showToast('Contribution added', {type: 'success'});
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not add the contribution',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={`Add contribution · ${investment.name}`}
      footer={
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title="Add contribution"
            onPress={onSubmit}
            loading={isSubmitting}
            testID="contribution-form-submit"
          />
        </View>
      }>
      {/* Keyed remount so MoneyInput re-seeds its text each time. */}
      <View key={String(visible)} style={styles.form}>
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
              autoFocus
              accessibilityLabel="Contribution amount"
              testID="contribution-form-amount"
            />
          )}
        />

        <Controller
          control={control}
          name="accountId"
          render={({field}) => (
            <SelectField
              label="From account"
              placeholder="Choose a payment account"
              value={field.value || null}
              options={accountOptions}
              onSelect={field.onChange}
              error={errors.accountId?.message}
              accessibilityLabel="Payment account"
              testID="contribution-form-account"
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
              accessibilityLabel="Contribution date"
              testID="contribution-form-date"
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

        <Text variant="caption" color="textMuted">
          This moves money from your account into the investment — it is not
          counted as spending.
        </Text>

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
