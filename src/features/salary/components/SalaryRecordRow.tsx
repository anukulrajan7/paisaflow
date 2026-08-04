import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AmountText, Card, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {SalaryRecord} from '../types/salary';
import {periodLabel} from '../utils/salaryState';
import {StatusPill} from './StatusPill';

export interface SalaryRecordRowProps {
  record: SalaryRecord;
  currency: string;
  testID?: string;
}

/** One past salary record: month, status, amount, optional note. */
export function SalaryRecordRow({record, currency, testID}: SalaryRecordRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card testID={testID} accessibilityLabel={`Salary for ${periodLabel(record.periodKey)}`}>
      <View style={styles.row}>
        <View style={styles.left}>
          <Text variant="bodyMedium">{periodLabel(record.periodKey)}</Text>
          {record.note ? (
            <Text variant="caption" color="textMuted" numberOfLines={2}>
              {record.note}
            </Text>
          ) : null}
        </View>
        <View style={styles.right}>
          <AmountText
            amountMinor={record.amountMinor}
            currency={currency}
            type={record.status === 'delayed' ? 'neutral' : 'income'}
            showSign={false}
            size="body"
            color={record.status === 'delayed' ? 'textMuted' : undefined}
          />
          <StatusPill state={record.status} />
        </View>
      </View>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    left: {flex: 1, gap: theme.spacing.xs},
    right: {alignItems: 'flex-end', gap: theme.spacing.xs},
  });
