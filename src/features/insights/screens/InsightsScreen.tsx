import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {Minus, TrendingDown, TrendingUp} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  BudgetProgress,
  Card,
  EmptyState,
  ErrorState,
  MetricCard,
  SegmentedControl,
  Text,
} from '../../../design-system/components';
import type {SegmentedOption} from '../../../design-system/components';
import {EmptyInsightsIllustration} from '../../../design-system/illustrations';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {InsightsStackParamList} from '../../../app/navigation/types';
import {formatMoney} from '../../../utils/money';
import {useInsights} from '../hooks/useInsights';
import type {InsightsViewModel} from '../hooks/useInsights';
import type {TrendMode, TrendPoint} from '../services/insightsAggregation';
import {summarizeTrend} from '../services/insightsAggregation';
import {TrendChart} from '../components/TrendChart';
import {CategoryBars} from '../components/CategoryBars';
import {StatTile} from '../components/StatTile';
import {InsightsSkeleton} from '../components/InsightsSkeleton';

type Props = NativeStackScreenProps<InsightsStackParamList, 'Insights'>;

const MODE_OPTIONS: ReadonlyArray<SegmentedOption<TrendMode>> = [
  {value: 'daily', label: 'Daily'},
  {value: 'weekly', label: 'Weekly'},
  {value: 'monthly', label: 'Monthly'},
];

const MODE_TITLES: Record<TrendMode, string> = {
  daily: 'Daily spending',
  weekly: 'Weekly spending',
  monthly: 'Monthly spending',
};

const MODE_SUBTITLES: Record<TrendMode, string> = {
  daily: 'Per day, this budget cycle',
  weekly: 'Last 6 weeks',
  monthly: 'Last 6 budget cycles',
};

const MAX_CATEGORY_ROWS = 10;

function trendForMode(data: InsightsViewModel, mode: TrendMode): TrendPoint[] {
  if (mode === 'weekly') {
    return data.weeklyTrend;
  }
  if (mode === 'monthly') {
    return data.monthlyTrend;
  }
  return data.dailyTrend;
}

/** Text summary spoken for the chart and shown as its caption. */
function trendCaption(
  points: TrendPoint[],
  currency: string,
): {caption: string; accessibilityLabel: string} {
  const {totalMinor, peak} = summarizeTrend(points);
  if (peak === null) {
    return {
      caption: 'No spending in this period',
      accessibilityLabel: 'Spending trend. No spending in this period.',
    };
  }
  const caption = `Total ${formatMoney(totalMinor, currency)} · Highest: ${
    peak.fullLabel
  } at ${formatMoney(peak.expenseMinor, currency)}`;
  return {
    caption,
    accessibilityLabel: `Spending trend. ${caption}`,
  };
}

function ComparisonCard({data}: {data: InsightsViewModel}) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {comparison, currency, previousCycleLabel} = data;

  let deltaLine: string;
  let DeltaIcon = Minus;
  let deltaColor = theme.colors.textSecondary;
  if (comparison.previousMinor === 0 && comparison.currentMinor === 0) {
    deltaLine = 'No spending in either cycle';
  } else if (comparison.previousMinor === 0) {
    deltaLine = `No spending recorded in ${previousCycleLabel}`;
    DeltaIcon = TrendingUp;
    deltaColor = theme.colors.expense;
  } else if (comparison.deltaMinor === 0) {
    deltaLine = `Same as ${previousCycleLabel}`;
  } else {
    const more = comparison.deltaMinor > 0;
    DeltaIcon = more ? TrendingUp : TrendingDown;
    deltaColor = more ? theme.colors.expense : theme.colors.income;
    const percent =
      comparison.deltaPercent !== null
        ? ` (${Math.abs(comparison.deltaPercent)}%)`
        : '';
    deltaLine = `${formatMoney(Math.abs(comparison.deltaMinor), currency)}${percent} ${
      more ? 'more' : 'less'
    } than ${previousCycleLabel}`;
  }

  return (
    <Card
      accessibilityLabel={`Month comparison. This cycle ${formatMoney(
        comparison.currentMinor,
        currency,
      )}. ${previousCycleLabel} ${formatMoney(
        comparison.previousMinor,
        currency,
      )}. ${deltaLine}`}>
      <View style={[styles.cardBody, {gap: theme.spacing.md}]}>
        <Text variant="label" color="textSecondary" style={styles.sectionLabel}>
          {`${data.cycleLabel} vs ${previousCycleLabel}`}
        </Text>
        <View style={styles.comparisonRow}>
          <View style={styles.comparisonCell}>
            <Text variant="caption" color="textMuted">
              This cycle
            </Text>
            <Text variant="amountMedium">
              {formatMoney(comparison.currentMinor, currency)}
            </Text>
          </View>
          <View style={styles.comparisonCell}>
            <Text variant="caption" color="textMuted">
              Previous
            </Text>
            <Text variant="amountMedium" color="textSecondary">
              {formatMoney(comparison.previousMinor, currency)}
            </Text>
          </View>
        </View>
        <View style={styles.deltaRow}>
          <DeltaIcon size={16} color={deltaColor} />
          <Text variant="bodyMedium" style={[styles.deltaText, {color: deltaColor}]}>
            {deltaLine}
          </Text>
        </View>
      </View>
    </Card>
  );
}

function InsightsBody({data}: {data: InsightsViewModel}) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [mode, setMode] = useState<TrendMode>('daily');

  const points = trendForMode(data, mode);
  const {caption, accessibilityLabel} = trendCaption(points, data.currency);
  const shares = data.categoryShares.slice(0, MAX_CATEGORY_ROWS);
  const hiddenShares = data.categoryShares.length - shares.length;

  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.xl,
        },
      ]}>
      <SegmentedControl
        options={MODE_OPTIONS}
        value={mode}
        onChange={setMode}
        accessibilityLabel="Trend period"
      />

      <Card>
        <View style={[styles.cardBody, {gap: theme.spacing.sm}]}>
          <Text
            variant="label"
            color="textSecondary"
            style={styles.sectionLabel}>
            {MODE_TITLES[mode]}
          </Text>
          <Text variant="caption" color="textMuted">
            {MODE_SUBTITLES[mode]}
          </Text>
          <TrendChart
            points={points}
            currency={data.currency}
            accessibilityLabel={accessibilityLabel}
            style={{marginTop: theme.spacing.sm}}
          />
          <Text variant="caption" color="textSecondary">
            {caption}
          </Text>
        </View>
      </Card>

      <View style={[styles.tileRow, {gap: theme.spacing.md}]}>
        <MetricCard
          label="Spent this cycle"
          amountMinor={data.stats.totalExpenseMinor}
          currency={data.currency}
          type="expense"
          caption={data.cycleLabel}
          style={styles.tile}
        />
        <MetricCard
          label="Avg per day"
          amountMinor={data.stats.averageDailyMinor}
          currency={data.currency}
          caption="This cycle"
          style={styles.tile}
        />
      </View>
      <View style={[styles.tileRow, {gap: theme.spacing.md}]}>
        <MetricCard
          label="Highest day"
          amountMinor={data.stats.highestDay?.totalMinor ?? 0}
          currency={data.currency}
          caption={data.stats.highestDay?.label ?? 'No spending yet'}
          style={styles.tile}
        />
        <StatTile
          label="Transactions"
          value={String(data.stats.transactionCount)}
          caption="This cycle"
        />
      </View>

      <ComparisonCard data={data} />

      <Card>
        <View style={[styles.cardBody, {gap: theme.spacing.md}]}>
          <Text variant="label" color="textSecondary" style={styles.sectionLabel}>
            Overall budget
          </Text>
          {data.overallBudgetUsage ? (
            <>
              <BudgetProgress
                spentMinor={data.overallBudgetUsage.spentMinor}
                totalMinor={data.overallBudgetUsage.limitMinor}
                currency={data.currency}
                label={`Budget for ${data.cycleLabel}`}
              />
              <Text
                variant="caption"
                color={
                  data.overallBudgetUsage.remainingMinor < 0
                    ? 'danger'
                    : 'textSecondary'
                }>
                {data.overallBudgetUsage.remainingMinor < 0
                  ? `${formatMoney(
                      -data.overallBudgetUsage.remainingMinor,
                      data.currency,
                    )} over budget`
                  : `${formatMoney(
                      data.overallBudgetUsage.remainingMinor,
                      data.currency,
                    )} remaining`}
              </Text>
            </>
          ) : (
            <Text variant="body" color="textSecondary">
              No overall budget set for this cycle. Add one from the Budgets
              screen to track progress here.
            </Text>
          )}
        </View>
      </Card>

      <Card>
        <View style={[styles.cardBody, {gap: theme.spacing.md}]}>
          <Text variant="label" color="textSecondary" style={styles.sectionLabel}>
            Spending by category
          </Text>
          {shares.length > 0 ? (
            <>
              <CategoryBars shares={shares} currency={data.currency} />
              {hiddenShares > 0 ? (
                <Text variant="caption" color="textMuted">
                  {`and ${hiddenShares} more ${
                    hiddenShares === 1 ? 'category' : 'categories'
                  }`}
                </Text>
              ) : null}
            </>
          ) : (
            <Text variant="body" color="textSecondary">
              No expenses in this cycle yet.
            </Text>
          )}
        </View>
      </Card>
    </ScrollView>
  );
}

export function InsightsScreen(_props: Props) {
  const state = useInsights();

  return (
    <AppScreen>
      <AppHeader
        title="Insights"
        subtitle={state.status === 'ready' ? state.data.cycleLabel : undefined}
      />
      {state.status === 'loading' ? (
        <InsightsSkeleton />
      ) : state.status === 'error' ? (
        <ErrorState
          message="Could not load your insights."
          onRetry={state.reload}
        />
      ) : !state.data.hasTransactions ? (
        <EmptyState
          illustration={<EmptyInsightsIllustration />}
          title="No transactions yet"
          message="Add your first transaction to see insights"
        />
      ) : (
        <InsightsBody data={state.data} />
      )}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    scrollContent: {paddingTop: theme.spacing.xs},
    cardBody: {width: '100%'},
    sectionLabel: {textTransform: 'uppercase'},
    tileRow: {flexDirection: 'row'},
    tile: {flex: 1},
    comparisonRow: {flexDirection: 'row'},
    comparisonCell: {flex: 1, gap: theme.spacing.xs},
    deltaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    deltaText: {flex: 1},
  });
