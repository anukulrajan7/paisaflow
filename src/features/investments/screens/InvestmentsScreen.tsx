import React, {useCallback, useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ArrowLeft, CalendarClock, Plus, TrendingUp} from 'lucide-react-native';

import {
  AmountText,
  AppHeader,
  AppScreen,
  Card,
  CategoryIcon,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  MetricCard,
  SectionHeader,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {AllocationBars} from '../components/AllocationBars';
import {InvestmentFormSheet} from '../components/InvestmentFormSheet';
import {InvestmentRow} from '../components/InvestmentRow';
import {useInvestmentsData} from '../hooks/useInvestmentsData';
import {
  INVESTMENT_TYPE_COLORS,
  INVESTMENT_TYPE_ICONS,
} from '../types/investment';
import type {Investment} from '../types/investment';
import {
  allocationByType,
  gainLoss,
  portfolioTotals,
  upcomingContributions,
  upcomingMaturities,
} from '../utils/investmentMath';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Investments'>;

/** Portfolio overview: totals, allocation, due contributions, maturities, list. */
export function InvestmentsScreen({navigation}: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {data, loading, error, reload} = useInvestmentsData();

  const [formVisible, setFormVisible] = useState(false);
  const openCreate = useCallback(() => setFormVisible(true), []);
  const closeForm = useCallback(() => setFormVisible(false), []);

  const openDetails = useCallback(
    (investment: Investment) =>
      navigation.navigate('InvestmentDetails', {investmentId: investment.id}),
    [navigation],
  );

  // Single snapshot so every section compares against the same "today".
  const now = Date.now();

  const totals = useMemo(
    () => portfolioTotals(data?.investments ?? []),
    [data?.investments],
  );
  const overall = gainLoss(totals.investedMinor, totals.currentValueMinor);
  const allocation = useMemo(
    () => allocationByType(data?.investments ?? []),
    [data?.investments],
  );
  const contributions = useMemo(
    () => upcomingContributions(data?.investments ?? [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.investments],
  );
  const maturities = useMemo(
    () => upcomingMaturities(data?.investments ?? [], now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data?.investments],
  );

  const hasInvestments = (data?.investments.length ?? 0) > 0;
  const currency = data?.currency ?? 'INR';

  return (
    <AppScreen>
      <AppHeader
        title="Investments"
        left={
          <IconButton
            icon={ArrowLeft}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Go back"
          />
        }
        right={
          hasInvestments ? (
            <IconButton
              icon={Plus}
              onPress={openCreate}
              accessibilityLabel="Add investment"
            />
          ) : undefined
        }
      />
      {loading && !data ? (
        <LoadingState message="Loading investments" />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingHorizontal: theme.spacing.lg},
          ]}>
          {hasInvestments ? (
            <>
              <Card style={styles.portfolio}>
                <View style={styles.metricsRow}>
                  <MetricCard
                    label="Invested"
                    amountMinor={totals.investedMinor}
                    currency={currency}
                    style={styles.metric}
                    testID="portfolio-invested"
                  />
                  <MetricCard
                    label="Current value"
                    amountMinor={totals.currentValueMinor}
                    currency={currency}
                    style={styles.metric}
                    testID="portfolio-current"
                  />
                </View>
                <View style={styles.overallRow}>
                  <Text variant="bodyMedium">
                    {overall.isGain ? 'Overall gain' : 'Overall loss'}
                  </Text>
                  <View style={styles.overallAmount}>
                    <AmountText
                      amountMinor={Math.abs(overall.amountMinor)}
                      currency={currency}
                      type={overall.isGain ? 'income' : 'expense'}
                      size="medium"
                      showSign
                      accessibilityLabel={`${overall.isGain ? 'Gain' : 'Loss'} of ${formatMoney(
                        Math.abs(overall.amountMinor),
                        currency,
                      )}`}
                    />
                    {overall.percent !== null ? (
                      <Text
                        variant="caption"
                        color={overall.isGain ? 'success' : 'danger'}>
                        {Math.abs(overall.percent).toFixed(1)}%
                      </Text>
                    ) : null}
                  </View>
                </View>
                <Text variant="caption" color="textMuted">
                  Contributions move money — they are not counted as spending.
                  Update values manually from your statements.
                </Text>
              </Card>

              {allocation.length > 1 ? (
                <View style={styles.section}>
                  <SectionHeader title="Allocation by type" />
                  <Card>
                    <AllocationBars
                      shares={allocation}
                      currency={currency}
                      testID="allocation-bars"
                    />
                  </Card>
                </View>
              ) : null}

              {contributions.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Upcoming contributions" />
                  <Card style={styles.listCard}>
                    {contributions.map(({investment, dueAt}, index) => (
                      <View
                        key={investment.id}
                        accessible
                        accessibilityLabel={`${investment.name}: ${formatMoney(
                          investment.monthlyContributionMinor ?? 0,
                          currency,
                        )} due ${dayjs(dueAt).format('D MMM YYYY')}`}
                        style={[
                          styles.dueRow,
                          index > 0 && {
                            borderTopWidth: StyleSheet.hairlineWidth,
                            borderTopColor: theme.colors.border,
                          },
                        ]}>
                        <CategoryIcon
                          icon={INVESTMENT_TYPE_ICONS[investment.type]}
                          color={INVESTMENT_TYPE_COLORS[investment.type]}
                          size={32}
                        />
                        <View style={styles.dueTextWrap}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {investment.name}
                          </Text>
                          <Text variant="caption" color="textMuted">
                            Due {dayjs(dueAt).format('D MMM')}
                          </Text>
                        </View>
                        <AmountText
                          amountMinor={investment.monthlyContributionMinor ?? 0}
                          currency={currency}
                          type="neutral"
                          size="body"
                          showSign={false}
                        />
                      </View>
                    ))}
                  </Card>
                </View>
              ) : null}

              {maturities.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader title="Maturing soon" />
                  <Card style={styles.listCard}>
                    {maturities.map((investment, index) => {
                      const daysLeft = dayjs(investment.maturityAt).diff(
                        dayjs(now).startOf('day'),
                        'day',
                      );
                      return (
                        <View
                          key={investment.id}
                          accessible
                          accessibilityLabel={`${investment.name} matures ${dayjs(
                            investment.maturityAt,
                          ).format('D MMM YYYY')}, in ${daysLeft} days`}
                          style={[
                            styles.dueRow,
                            index > 0 && {
                              borderTopWidth: StyleSheet.hairlineWidth,
                              borderTopColor: theme.colors.border,
                            },
                          ]}>
                          <CalendarClock
                            size={20}
                            color={theme.colors.textMuted}
                          />
                          <View style={styles.dueTextWrap}>
                            <Text variant="bodyMedium" numberOfLines={1}>
                              {investment.name}
                            </Text>
                            <Text variant="caption" color="textMuted">
                              Matures{' '}
                              {dayjs(investment.maturityAt).format('D MMM YYYY')}
                            </Text>
                          </View>
                          <Text variant="caption" color="textSecondary">
                            {daysLeft === 0
                              ? 'Today'
                              : `${daysLeft} ${
                                  daysLeft === 1 ? 'day' : 'days'
                                }`}
                          </Text>
                        </View>
                      );
                    })}
                  </Card>
                </View>
              ) : null}

              <View style={styles.section}>
                <SectionHeader title="Your investments" />
                <View style={styles.investmentList}>
                  {data.investments.map(investment => (
                    <InvestmentRow
                      key={investment.id}
                      investment={investment}
                      currency={currency}
                      onPress={openDetails}
                      testID={`investment-row-${investment.id}`}
                    />
                  ))}
                </View>
              </View>
            </>
          ) : (
            <EmptyState
              icon={TrendingUp}
              title="No investments yet"
              message="Track mutual funds, FDs, stocks and more. Contributions move money into the investment — they are never counted as spending."
              actionLabel="Add investment"
              onAction={openCreate}
              style={styles.empty}
            />
          )}
        </ScrollView>
      ) : null}

      {data ? (
        <InvestmentFormSheet
          visible={formVisible}
          onClose={closeForm}
          editing={null}
          currency={currency}
        />
      ) : null}
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      gap: theme.spacing.xl,
      paddingBottom: theme.spacing.xxxl,
    },
    portfolio: {gap: theme.spacing.lg},
    metricsRow: {
      flexDirection: 'row',
      gap: theme.spacing.md,
    },
    metric: {flex: 1},
    overallRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    overallAmount: {alignItems: 'flex-end', gap: theme.spacing.xs},
    section: {gap: theme.spacing.sm},
    listCard: {paddingVertical: theme.spacing.xs},
    dueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
    },
    dueTextWrap: {flex: 1, gap: theme.spacing.xs},
    investmentList: {gap: theme.spacing.sm},
    empty: {marginTop: theme.spacing.xxxl},
  });
