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
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {
  defaultInvestmentFormValues,
  investmentFormSchema,
} from '../schemas/investmentFormSchemas';
import type {InvestmentFormValues} from '../schemas/investmentFormSchemas';
import {getInvestmentsRepository} from '../services/investmentsRepository';
import {
  INVESTMENT_TYPES,
  INVESTMENT_TYPE_ICONS,
  INVESTMENT_TYPE_LABELS,
} from '../types/investment';
import type {Investment} from '../types/investment';

export interface InvestmentFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Investment being edited; null creates a new one. */
  editing: Investment | null;
  currency: string;
}

/** Add/edit investment form in a bottom sheet (RHF + Zod). */
export function InvestmentFormSheet({
  visible,
  onClose,
  editing,
  currency,
}: InvestmentFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: {errors, isSubmitting},
  } = useForm<InvestmentFormValues>({
    resolver: zodResolver(investmentFormSchema),
    defaultValues: defaultInvestmentFormValues(),
  });

  const hasMaturity = watch('hasMaturity');

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSubmitError(null);
    reset(
      editing
        ? {
            name: editing.name,
            type: editing.type,
            // Invested totals only move via contributions; never edited here.
            initialInvestedMinor: null,
            startedAt: editing.startedAt,
            hasMaturity: editing.maturityAt !== null,
            maturityAt: editing.maturityAt,
            monthlyContributionMinor: editing.monthlyContributionMinor,
            reminderDayText:
              editing.reminderDay === null ? '' : String(editing.reminderDay),
            notes: editing.notes ?? '',
          }
        : defaultInvestmentFormValues(),
    );
  }, [visible, editing, reset]);

  const onSubmit = handleSubmit(async values => {
    const reminderDay =
      values.reminderDayText === '' ? null : Number(values.reminderDayText);
    const input = {
      name: values.name,
      type: values.type,
      startedAt: values.startedAt,
      maturityAt: values.hasMaturity ? values.maturityAt : null,
      monthlyContributionMinor: values.monthlyContributionMinor,
      reminderDay,
      notes: values.notes || null,
    };
    try {
      const repo = getInvestmentsRepository();
      if (editing) {
        await repo.updateInvestment(editing.id, input);
        showToast('Investment updated', {type: 'success'});
      } else {
        await repo.createInvestment({
          ...input,
          currency,
          initialInvestedMinor: values.initialInvestedMinor ?? 0,
        });
        showToast('Investment added', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(
        e instanceof Error ? e.message : 'Could not save the investment',
      );
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit investment' : 'Add investment'}
      maxHeightFraction={0.9}
      footer={
        <View style={styles.actions}>
          <Button title="Cancel" variant="ghost" onPress={onClose} />
          <Button
            title={editing ? 'Save changes' : 'Add investment'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="investment-form-submit"
          />
        </View>
      }>
      {/* Keyed remount so MoneyInputs re-seed their text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="name"
          render={({field}) => (
            <Input
              label="Name"
              placeholder="e.g. Nifty 50 index fund"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.name?.message}
              autoCapitalize="words"
              returnKeyType="next"
              accessibilityLabel="Investment name"
              testID="investment-form-name"
            />
          )}
        />

        <View style={styles.field}>
          <Text variant="label" color="textSecondary" style={styles.fieldLabel}>
            Type
          </Text>
          <Controller
            control={control}
            name="type"
            render={({field}) => (
              <View style={styles.chipsWrap}>
                {INVESTMENT_TYPES.map(type => (
                  <Chip
                    key={type}
                    label={INVESTMENT_TYPE_LABELS[type]}
                    icon={INVESTMENT_TYPE_ICONS[type]}
                    selected={field.value === type}
                    onPress={() => field.onChange(type)}
                    accessibilityLabel={`Type ${INVESTMENT_TYPE_LABELS[type]}`}
                    testID={`investment-form-type-${type}`}
                  />
                ))}
              </View>
            )}
          />
        </View>

        {!editing ? (
          <Controller
            control={control}
            name="initialInvestedMinor"
            render={({field: {value, onChange}}) => (
              <MoneyInput
                label="Already invested (optional)"
                valueMinor={value}
                onChangeMinor={onChange}
                currency={currency}
                error={errors.initialInvestedMinor?.message}
                hint="Money already in this investment. Later additions are recorded as contributions."
                accessibilityLabel="Already invested amount"
                testID="investment-form-initial"
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="startedAt"
          render={({field}) => (
            <DateTimeField
              label="Start date"
              value={field.value}
              onChange={field.onChange}
              error={errors.startedAt?.message}
              accessibilityLabel="Start date"
              testID="investment-form-started"
            />
          )}
        />

        <View style={styles.field}>
          <Controller
            control={control}
            name="hasMaturity"
            render={({field}) => (
              <Chip
                label="Has a maturity date"
                selected={field.value}
                onPress={() => field.onChange(!field.value)}
                accessibilityLabel="Toggle maturity date"
                testID="investment-form-has-maturity"
              />
            )}
          />
          {hasMaturity ? (
            <Controller
              control={control}
              name="maturityAt"
              render={({field}) => (
                <DateTimeField
                  label="Maturity date"
                  value={field.value ?? Date.now()}
                  onChange={field.onChange}
                  error={errors.maturityAt?.message}
                  accessibilityLabel="Maturity date"
                  testID="investment-form-maturity"
                />
              )}
            />
          ) : null}
        </View>

        <Controller
          control={control}
          name="monthlyContributionMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Monthly contribution (optional)"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.monthlyContributionMinor?.message}
              hint="Planned SIP/deposit amount, if you contribute regularly"
              accessibilityLabel="Monthly contribution"
              testID="investment-form-monthly"
            />
          )}
        />

        <Controller
          control={control}
          name="reminderDayText"
          render={({field}) => (
            <Input
              label="Reminder day (optional)"
              placeholder="Day of month, 1–28"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.reminderDayText?.message}
              keyboardType="number-pad"
              maxLength={2}
              accessibilityLabel="Reminder day"
              testID="investment-form-reminder-day"
            />
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({field}) => (
            <Input
              label="Notes"
              placeholder="Optional notes"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors.notes?.message}
              returnKeyType="done"
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
