import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {RefreshControl, ScrollView, StyleSheet, View} from 'react-native';
import {useFocusEffect, useNavigation} from '@react-navigation/native';
import type {NavigationProp} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Plus, Undo2} from 'lucide-react-native';

import {
  AmountText,
  AppScreen,
  BudgetProgress,
  Button,
  Card,
  Divider,
  ErrorState,
  MetricCard,
  SectionHeader,
  Text,
  TransactionItem,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {
  HomeStackParamList,
  RootTabParamList,
} from '../../../app/navigation/types';
import type {Category, Transaction} from '../../../database/types';
import {dayjs, formatPeriodLabel} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {AiInsightCard} from '../../ai-summary';
import {RecurringDueCard} from '../../recurring';
import {CategorySpendRow} from '../components/CategorySpendRow';
import {DashboardSkeleton} from '../components/DashboardSkeleton';
import {MoneyHubCard} from '../components/MoneyHubCard';
import {MonthSelector} from '../components/MonthSelector';
import {useDashboard} from '../hooks/useDashboard';
import {describeExpenseChange, greetingFor} from '../utils/dashboardText';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

const TOP_CATEGORY_COUNT = 5;

function transactionTitle(
  transaction: Transaction,
  categoriesById: Map<string, Category>,
): string {
  if (transaction.merchant) {
    return transaction.merchant;
  }
  const category = transaction.categoryId
    ? categoriesById.get(transaction.categoryId)
    : undefined;
  if (category) {
    return category.name;
  }
  if (transaction.note) {
    return transaction.note;
  }
  return transaction.type === 'transfer' ? 'Transfer' : 'Uncategorized';
}

/** Home dashboard: monthly totals first, breakdowns and activity below. */
export function HomeScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const tabNavigation = useNavigation<NavigationProp<RootTabParamList>>();
  const {
    period,
    canGoNext,
    goToPreviousMonth,
    goToNextMonth,
    summary,
    categoriesById,
    currency,
    loading,
    error,
    refetch,
  } = useDashboard();

  // Refetch whenever the tab regains focus (the mount effect already covers
  // the first focus).
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (!loading) {
      setRefreshing(false);
    }
  }, [loading]);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refetch();
  }, [refetch]);

  const openBudgets = useCallback(
    () => navigation.navigate('Budgets'),
    [navigation],
  );
  const openTransaction = useCallback(
    (transactionId: string) =>
      navigation.navigate('TransactionDetails', {transactionId}),
    [navigation],
  );
  const openAllTransactions = useCallback(
    () => tabNavigation.navigate('TransactionsTab', {screen: 'Transactions'}),
    [tabNavigation],
  );
  const openAddExpense = useCallback(
    () => tabNavigation.navigate('AddTab', {screen: 'AddTransaction'}),
    [tabNavigation],
  );

  let body: React.ReactNode;
  if (!summary) {
    body = error ? (
      <ErrorState
        title="Couldn't load your dashboard"
        message={error}
        onRetry={refetch}
      />
    ) : (
      <DashboardSkeleton />
    );
  } else {
    const balanceMinor = summary.monthIncomeMinor - summary.monthExpenseMinor;
    const changeCaption = describeExpenseChange(
      summary.monthExpenseMinor,
      summary.previousMonthExpenseMinor,
    );
    const topCategories = summary.categoryTotals.slice(0, TOP_CATEGORY_COUNT);
    const topCategoryMax = topCategories[0]?.totalMinor ?? 0;
    const budgetUsage = summary.overallBudgetUsage;

    body = (
      <>
        <Card style={styles.heroCard}>
          <Text
            variant="label"
            color="textSecondary"
            style={styles.upperLabel}>
            Remaining balance
          </Text>
          <AmountText
            amountMinor={balanceMinor}
            currency={currency}
            size="large"
            type={balanceMinor < 0 ? 'expense' : 'neutral'}
            showSign={balanceMinor < 0}
            style={styles.heroAmount}
          />
          <Text variant="caption" color="textMuted">
            {summary.monthTransactionCount}{' '}
            {summary.monthTransactionCount === 1
              ? 'transaction'
              : 'transactions'}{' '}
            this month
          </Text>
        </Card>

        <View style={styles.metricRow}>
          <MetricCard
            label="Income"
            amountMinor={summary.monthIncomeMinor}
            currency={currency}
            type="income"
            style={styles.metricFlex}
          />
          <MetricCard
            label="Expenses"
            amountMinor={summary.monthExpenseMinor}
            currency={currency}
            type="expense"
            caption={changeCaption}
            style={styles.metricFlex}
          />
        </View>

        <Card>
          <View style={styles.todayRow}>
            <Text variant="bodyMedium">Spent today</Text>
            <AmountText
              amountMinor={summary.todayExpenseMinor}
              currency={currency}
              type="expense"
              size="body"
              showSign={false}
            />
          </View>
        </Card>

        <RecurringDueCard />

        <MoneyHubCard />

        {budgetUsage ? (
          <Card
            onPress={openBudgets}
            accessibilityLabel="Monthly budget progress, tap to manage budgets"
            style={styles.budgetCard}>
            <BudgetProgress
              label="Monthly budget"
              spentMinor={budgetUsage.spentMinor}
              totalMinor={budgetUsage.limitMinor}
              currency={currency}
            />
            <Text
              variant="caption"
              color={
                budgetUsage.remainingMinor >= 0 ? 'textSecondary' : 'danger'
              }>
              {budgetUsage.remainingMinor >= 0
                ? `${formatMoney(budgetUsage.remainingMinor, currency)} left`
                : `${formatMoney(
                    -budgetUsage.remainingMinor,
                    currency,
                  )} over budget`}
            </Text>
          </Card>
        ) : null}

        <View>
          <SectionHeader title="Spending by category" />
          <Card style={styles.listCard}>
            {topCategories.length === 0 ? (
              <Text variant="body" color="textMuted">
                No expenses yet this month.
              </Text>
            ) : (
              topCategories.map((category, index) => (
                <React.Fragment key={category.categoryId ?? 'uncategorized'}>
                  {index > 0 ? <Divider spacing="sm" /> : null}
                  <CategorySpendRow
                    name={category.name}
                    icon={category.icon}
                    color={category.color}
                    totalMinor={category.totalMinor}
                    count={category.count}
                    maxMinor={topCategoryMax}
                    currency={currency}
                  />
                </React.Fragment>
              ))
            )}
          </Card>
        </View>

        <AiInsightCard />

        <View>
          <SectionHeader
            title="Recent transactions"
            actionLabel="See all"
            onAction={openAllTransactions}
          />
          <Card style={styles.listCard}>
            {summary.recentTransactions.length === 0 ? (
              <Text variant="body" color="textMuted">
                No transactions yet. Add your first expense below.
              </Text>
            ) : (
              summary.recentTransactions.map((transaction, index) => {
                const category = transaction.categoryId
                  ? categoriesById.get(transaction.categoryId)
                  : undefined;
                return (
                  <React.Fragment key={transaction.id}>
                    {index > 0 ? <Divider spacing="sm" /> : null}
                    <TransactionItem
                      title={transactionTitle(transaction, categoriesById)}
                      subtitle={dayjs(transaction.occurredAt).format(
                        'D MMM, h:mm A',
                      )}
                      amountMinor={transaction.amountMinor}
                      type={transaction.type}
                      currency={transaction.currency}
                      categoryIcon={
                        transaction.type === 'transfer'
                          ? Undo2
                          : getCategoryIcon(category?.icon)
                      }
                      categoryColor={category?.color}
                      onPress={() => openTransaction(transaction.id)}
                    />
                  </React.Fragment>
                );
              })
            )}
          </Card>
        </View>
      </>
    );
  }

  return (
    <AppScreen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }>
        <View style={styles.greeting}>
          <Text variant="heading">{greetingFor(dayjs())}</Text>
          <Text variant="body" color="textSecondary">
            {dayjs().format('dddd, D MMMM')}
          </Text>
        </View>
        <MonthSelector
          label={formatPeriodLabel(period)}
          canGoNext={canGoNext}
          onPrevious={goToPreviousMonth}
          onNext={goToNextMonth}
        />
        {body}
        <Button
          title="Add expense"
          onPress={openAddExpense}
          icon={Plus}
          fullWidth
          accessibilityHint="Opens the add transaction form"
        />
      </ScrollView>
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxxl,
      gap: theme.spacing.xl,
    },
    greeting: {gap: theme.spacing.xs},
    heroCard: {gap: theme.spacing.md},
    heroAmount: {
      fontSize: theme.typography.display.fontSize,
      lineHeight: theme.typography.display.lineHeight,
    },
    upperLabel: {textTransform: 'uppercase'},
    metricRow: {flexDirection: 'row', gap: theme.spacing.md},
    metricFlex: {flex: 1},
    todayRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    budgetCard: {gap: theme.spacing.md},
    listCard: {gap: theme.spacing.sm, marginTop: theme.spacing.sm},
  });
