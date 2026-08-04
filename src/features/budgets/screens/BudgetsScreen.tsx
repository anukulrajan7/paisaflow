import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, PiggyBank, Plus} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Modal,
  SectionHeader,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {HomeStackParamList} from '../../../app/navigation/types';
import {getBudgetsRepository} from '../../../database/repositories';
import type {Budget, BudgetUsage, Category} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {formatPeriodLabel} from '../../../utils/date';
import {BudgetFormSheet} from '../components/BudgetFormSheet';
import {BudgetUsageCard} from '../components/BudgetUsageCard';
import {useBudgetsData} from '../hooks/useBudgetsData';
import {OVERALL_CATEGORY_VALUE} from '../schemas/budgetFormSchema';

type Props = NativeStackScreenProps<HomeStackParamList, 'Budgets'>;

interface FormState {
  visible: boolean;
  editing: Budget | null;
  initialCategoryValue: string;
}

const CLOSED_FORM: FormState = {
  visible: false,
  editing: null,
  initialCategoryValue: OVERALL_CATEGORY_VALUE,
};

/** Overall + per-category budgets for the current monthly cycle. */
export function BudgetsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {data, loading, error, reload} = useBudgetsData();

  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const [deleting, setDeleting] = useState<BudgetUsage | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const categoryById = useMemo(() => {
    const map = new Map<string, Category>();
    data?.expenseCategories.forEach(c => map.set(c.id, c));
    return map;
  }, [data?.expenseCategories]);

  const openCreate = useCallback(
    (initialCategoryValue = OVERALL_CATEGORY_VALUE) =>
      setForm({visible: true, editing: null, initialCategoryValue}),
    [],
  );
  const openEdit = useCallback(
    (usage: BudgetUsage) =>
      setForm({
        visible: true,
        editing: usage.budget,
        initialCategoryValue: usage.budget.categoryId ?? OVERALL_CATEGORY_VALUE,
      }),
    [],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    try {
      await getBudgetsRepository().deleteBudget(deleting.budget.id);
      bumpDataVersion();
      showToast('Budget deleted', {type: 'success'});
      setDeleting(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not delete the budget', {
        type: 'error',
      });
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, showToast]);

  const nameFor = useCallback(
    (usage: BudgetUsage) =>
      usage.budget.categoryId === null
        ? 'Overall budget'
        : categoryById.get(usage.budget.categoryId)?.name ?? 'Unknown category',
    [categoryById],
  );

  const hasBudgets = !!data && (!!data.overallUsage || data.categoryUsages.length > 0);

  // Category values already budgeted, excluding the budget being edited.
  const takenCategoryValues = useMemo(() => {
    if (!data) {
      return [];
    }
    const values: string[] = [];
    if (data.overallUsage && data.overallUsage.budget.id !== form.editing?.id) {
      values.push(OVERALL_CATEGORY_VALUE);
    }
    data.categoryUsages.forEach(u => {
      if (u.budget.id !== form.editing?.id && u.budget.categoryId) {
        values.push(u.budget.categoryId);
      }
    });
    return values;
  }, [data, form.editing?.id]);

  return (
    <AppScreen>
      <AppHeader
        title="Budgets"
        subtitle={data ? formatPeriodLabel(data.period) : undefined}
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          hasBudgets ? (
            <IconButton
              icon={Plus}
              onPress={() => openCreate()}
              accessibilityLabel="Add budget"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading budgets" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {hasBudgets ? (
            <>
              <View style={styles.section}>
                <SectionHeader title="Overall" />
                {data.overallUsage ? (
                  <BudgetUsageCard
                    usage={data.overallUsage}
                    name="Overall budget"
                    currency={data.currency}
                    onEdit={openEdit}
                    onDelete={setDeleting}
                    testID="overall-budget-card"
                  />
                ) : (
                  <Card>
                    <Text variant="body" color="textSecondary" style={styles.gapText}>
                      No overall budget for this cycle.
                    </Text>
                    <Button
                      title="Set overall budget"
                      variant="secondary"
                      onPress={() => openCreate(OVERALL_CATEGORY_VALUE)}
                    />
                  </Card>
                )}
              </View>
              <View style={styles.section}>
                <SectionHeader
                  title="Category budgets"
                  actionLabel="Add"
                  onAction={() => openCreate()}
                />
                {data.categoryUsages.length > 0 ? (
                  data.categoryUsages.map(usage => {
                    const category = usage.budget.categoryId
                      ? categoryById.get(usage.budget.categoryId)
                      : undefined;
                    return (
                      <BudgetUsageCard
                        key={usage.budget.id}
                        usage={usage}
                        name={nameFor(usage)}
                        category={category}
                        currency={data.currency}
                        onEdit={openEdit}
                        onDelete={setDeleting}
                      />
                    );
                  })
                ) : (
                  <Text variant="body" color="textSecondary">
                    No category budgets yet. Add one to track spending per
                    category.
                  </Text>
                )}
              </View>
            </>
          ) : (
            <EmptyState
              icon={PiggyBank}
              title="No budgets yet"
              message="Set a monthly budget to keep an eye on your spending. Budgets are informational only — they never block you from adding expenses."
              actionLabel="Create overall budget"
              onAction={() => openCreate(OVERALL_CATEGORY_VALUE)}
              style={styles.empty}
            />
          )}
        </ScrollView>
      ) : null}

      {data ? (
        <BudgetFormSheet
          visible={form.visible}
          onClose={() => setForm(CLOSED_FORM)}
          editing={form.editing}
          initialCategoryValue={form.initialCategoryValue}
          period={data.period}
          currency={data.currency}
          expenseCategories={data.expenseCategories}
          takenCategoryValues={takenCategoryValues}
        />
      ) : null}

      <Modal
        visible={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete budget?"
        actions={
          <>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => setDeleting(null)}
            />
            <Button
              title="Delete"
              variant="danger"
              onPress={confirmDelete}
              loading={deleteBusy}
              testID="confirm-delete-budget"
            />
          </>
        }>
        <Text variant="body" color="textSecondary">
          {deleting
            ? `This removes the ${nameFor(deleting)}. Your transactions are not affected.`
            : ''}
        </Text>
      </Modal>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    section: {gap: theme.spacing.sm},
    gapText: {marginBottom: theme.spacing.md},
    empty: {marginTop: theme.spacing.xxxl},
  });
