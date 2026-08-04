import React, {useEffect, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useForm, Controller} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';

import {
  BottomSheet,
  Button,
  MoneyInput,
  SelectField,
  Text,
} from '../../../design-system/components';
import type {SelectOption} from '../../../design-system/components';
import {useToast} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {getBudgetsRepository} from '../../../database/repositories';
import type {Budget, Category, Period} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {formatPeriodLabel} from '../../../utils/date';
import {
  budgetFormSchema,
  OVERALL_CATEGORY_VALUE,
} from '../schemas/budgetFormSchema';
import type {BudgetFormValues} from '../schemas/budgetFormSchema';

export interface BudgetFormSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Budget being edited; null creates a new one for `period`. */
  editing: Budget | null;
  /** Preselected category when creating ('overall' or a category id). */
  initialCategoryValue: string;
  /** Current monthly cycle; used as the period for new budgets. */
  period: Period;
  currency: string;
  expenseCategories: Category[];
  /** Category values already budgeted by OTHER budgets (duplicate guard). */
  takenCategoryValues: ReadonlyArray<string>;
}

/** Add/edit budget form in a bottom sheet (RHF + Zod). */
export function BudgetFormSheet({
  visible,
  onClose,
  editing,
  initialCategoryValue,
  period,
  currency,
  expenseCategories,
  takenCategoryValues,
}: BudgetFormSheetProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: {errors, isSubmitting},
  } = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    defaultValues: {
      categoryValue: OVERALL_CATEGORY_VALUE,
      limitMinor: null,
    },
  });

  useEffect(() => {
    if (visible) {
      setSubmitError(null);
      reset({
        categoryValue: editing
          ? editing.categoryId ?? OVERALL_CATEGORY_VALUE
          : initialCategoryValue,
        limitMinor: editing ? editing.limitMinor : null,
      });
    }
  }, [visible, editing, initialCategoryValue, reset]);

  const options = useMemo<ReadonlyArray<SelectOption>>(
    () => [
      {value: OVERALL_CATEGORY_VALUE, label: 'Overall (all expenses)'},
      ...expenseCategories.map(c => ({value: c.id, label: c.name})),
    ],
    [expenseCategories],
  );

  const onSubmit = handleSubmit(async values => {
    if (values.limitMinor === null) {
      return; // refine already surfaced the message
    }
    if (takenCategoryValues.includes(values.categoryValue)) {
      setError('categoryValue', {
        message: 'A budget already exists for this selection',
      });
      return;
    }
    const categoryId =
      values.categoryValue === OVERALL_CATEGORY_VALUE ? null : values.categoryValue;
    try {
      const repo = getBudgetsRepository();
      if (editing) {
        await repo.updateBudget(editing.id, {
          categoryId,
          limitMinor: values.limitMinor,
        });
        showToast('Budget updated', {type: 'success'});
      } else {
        await repo.createBudget({
          categoryId,
          limitMinor: values.limitMinor,
          currency,
          periodStart: period.start,
          periodEnd: period.end,
        });
        showToast('Budget created', {type: 'success'});
      }
      bumpDataVersion();
      onClose();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Could not save the budget');
    }
  });

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit budget' : 'Add budget'}>
      {/* Keyed remount so MoneyInput re-seeds its text for each target. */}
      <View key={`${editing?.id ?? 'new'}-${String(visible)}`} style={styles.form}>
        <Controller
          control={control}
          name="categoryValue"
          render={({field: {value, onChange}}) => (
            <SelectField
              label="Applies to"
              value={value}
              options={options}
              onSelect={onChange}
              error={errors.categoryValue?.message}
              accessibilityLabel="Budget category"
              testID="budget-form-category"
            />
          )}
        />
        <Controller
          control={control}
          name="limitMinor"
          render={({field: {value, onChange}}) => (
            <MoneyInput
              label="Monthly limit"
              valueMinor={value}
              onChangeMinor={onChange}
              currency={currency}
              error={errors.limitMinor?.message}
              hint={
                editing
                  ? undefined
                  : `For the current cycle: ${formatPeriodLabel(period)}`
              }
              accessibilityLabel="Budget limit"
              testID="budget-form-limit"
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
            title={editing ? 'Save changes' : 'Create budget'}
            onPress={onSubmit}
            loading={isSubmitting}
            testID="budget-form-submit"
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
