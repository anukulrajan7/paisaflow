import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AmountText, Card, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import type {SalaryConfig, SalaryRecord} from '../types/salary';
import {ordinal, salaryStateFor} from '../utils/salaryState';
import {StatusPill} from './StatusPill';

export interface SalaryStateCardProps {
  config: SalaryConfig;
  /** This month's record, or null when nothing is recorded yet. */
  record: SalaryRecord | null;
  account: Account | undefined;
  /** Single 'now' snapshot for the render. */
  now: number;
  testID?: string;
}

/** Current-month status card: expected / credited / partial / bonus / delayed. */
export function SalaryStateCard({
  config,
  record,
  account,
  now,
  testID,
}: SalaryStateCardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const state = salaryStateFor(config, record, now);
  const accountName = account?.name ?? 'account';

  const amountMinor = record ? record.amountMinor : config.amountMinor;

  let headline: string;
  switch (state) {
    case 'expected':
      headline = `Expected on the ${ordinal(config.expectedDay)}`;
      break;
    case 'credited':
      headline = `Credited to ${accountName}`;
      break;
    case 'bonus':
      headline = `Credited to ${accountName} · includes ${formatMoney(
        (record?.amountMinor ?? 0) - config.amountMinor,
        config.currency,
      )} bonus`;
      break;
    case 'partial':
      headline = `Received ${formatMoney(
        record?.amountMinor ?? 0,
        config.currency,
      )} of ${formatMoney(config.amountMinor, config.currency)}`;
      break;
    case 'delayed':
      headline = record
        ? 'Not received yet'
        : `Was expected on the ${ordinal(config.expectedDay)}`;
      break;
  }

  return (
    <Card testID={testID} accessibilityLabel="This month's salary status">
      <View style={styles.header}>
        <Text variant="label" color="textSecondary" style={styles.label}>
          This month
        </Text>
        <StatusPill state={state} testID="salary-state-pill" />
      </View>
      <AmountText
        amountMinor={amountMinor}
        currency={config.currency}
        type="income"
        showSign={false}
        size="large"
        testID="salary-state-amount"
      />
      <Text variant="body" color="textSecondary">
        {headline}
      </Text>
      <Text variant="caption" color="textMuted">
        {[
          config.employer ? `From ${config.employer}` : null,
          record
            ? `Recorded ${dayjs(record.createdAt).format('D MMM')}`
            : `Every month on the ${ordinal(config.expectedDay)}`,
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: theme.spacing.sm,
    },
    label: {textTransform: 'uppercase'},
  });
