import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  AmountText,
  Card,
  Divider,
  MetricCard,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import type {BalancesSummary as BalancesSummaryData} from '../services/balancesSummary';

export interface BalancesSummaryProps {
  summary: BalancesSummaryData;
  currency: string;
  /** Label of the current budget-cycle month, e.g. 'June 2026'. */
  periodLabel: string | null;
  testID?: string;
}

/**
 * 'Accounts & Balances' header: total available money, credit-card
 * outstanding, and the current budget cycle's income / expenses / net
 * cash flow.
 */
export function BalancesSummary({
  summary,
  currency,
  periodLabel,
  testID,
}: BalancesSummaryProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const {
    totalAvailableMinor,
    creditCardOutstandingMinor,
    monthIncomeMinor,
    monthExpenseMinor,
    netCashFlowMinor,
  } = summary;

  const totalFormatted = formatMoney(totalAvailableMinor, currency);
  const outstandingFormatted = formatMoney(
    creditCardOutstandingMinor,
    currency,
  );
  const netSign =
    netCashFlowMinor > 0 ? '+' : netCashFlowMinor < 0 ? '-' : '';
  const netFormatted = `${netSign}${formatMoney(
    Math.abs(netCashFlowMinor),
    currency,
  )}`;
  const netColor =
    netCashFlowMinor > 0
      ? ('success' as const)
      : netCashFlowMinor < 0
        ? ('danger' as const)
        : ('textPrimary' as const);

  return (
    <View style={styles.root} testID={testID}>
      <Card
        accessibilityLabel={`Total available money ${totalFormatted}. Credit card outstanding ${outstandingFormatted}.`}
        style={styles.heroCard}>
        <Text
          variant="label"
          color="textSecondary"
          style={styles.upperLabel}>
          Total available
        </Text>
        <AmountText
          amountMinor={totalAvailableMinor}
          currency={currency}
          type={totalAvailableMinor < 0 ? 'expense' : 'neutral'}
          size="large"
          showSign={totalAvailableMinor < 0}
          style={styles.heroAmount}
        />
        <Text variant="caption" color="textMuted">
          Cash, bank and wallet balances
        </Text>
        <Divider spacing="md" />
        <View style={styles.outstandingRow}>
          <Text variant="bodyMedium">Credit card outstanding</Text>
          <Text
            variant="bodyMedium"
            color={creditCardOutstandingMinor > 0 ? 'danger' : 'textMuted'}
            accessibilityLabel={`Credit card outstanding ${outstandingFormatted}`}>
            {outstandingFormatted}
          </Text>
        </View>
      </Card>

      {periodLabel ? (
        <Text
          variant="caption"
          color="textMuted"
          style={styles.periodCaption}>
          {`Current budget cycle · ${periodLabel}`}
        </Text>
      ) : null}

      <View style={styles.metricRow}>
        <MetricCard
          label="Income"
          amountMinor={monthIncomeMinor}
          currency={currency}
          type="income"
          accessibilityLabel={`Monthly income ${formatMoney(
            monthIncomeMinor,
            currency,
          )}`}
          style={styles.metricFlex}
        />
        <MetricCard
          label="Expenses"
          amountMinor={monthExpenseMinor}
          currency={currency}
          type="expense"
          accessibilityLabel={`Monthly expenses ${formatMoney(
            monthExpenseMinor,
            currency,
          )}`}
          style={styles.metricFlex}
        />
      </View>

      <Card
        accessibilityLabel={`Net cash flow ${netFormatted}${
          periodLabel ? ` for ${periodLabel}` : ''
        }`}>
        <View style={styles.netRow}>
          <View style={styles.netInfo}>
            <Text
              variant="label"
              color="textSecondary"
              style={styles.upperLabel}>
              Net cash flow
            </Text>
            <Text variant="caption" color="textMuted">
              Income minus expenses
            </Text>
          </View>
          <Text variant="amountMedium" color={netColor}>
            {netFormatted}
          </Text>
        </View>
      </Card>
    </View>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    root: {gap: theme.spacing.md},
    heroCard: {gap: theme.spacing.sm},
    heroAmount: {
      fontSize: theme.typography.display.fontSize,
      lineHeight: theme.typography.display.lineHeight,
    },
    upperLabel: {textTransform: 'uppercase'},
    outstandingRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    periodCaption: {paddingHorizontal: theme.spacing.xs},
    metricRow: {flexDirection: 'row', gap: theme.spacing.md},
    metricFlex: {flex: 1},
    netRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    netInfo: {flex: 1, gap: theme.spacing.xs},
  });
