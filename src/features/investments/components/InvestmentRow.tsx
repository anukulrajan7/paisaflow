import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {
  AmountText,
  Card,
  CategoryIcon,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import {
  INVESTMENT_TYPE_COLORS,
  INVESTMENT_TYPE_ICONS,
  INVESTMENT_TYPE_LABELS,
} from '../types/investment';
import type {Investment} from '../types/investment';
import {GainLossBadge} from './GainLossBadge';

export interface InvestmentRowProps {
  investment: Investment;
  currency: string;
  onPress: (investment: Investment) => void;
  testID?: string;
}

/** Investment list item: type icon, name, invested vs current, gain/loss chip. */
export function InvestmentRow({
  investment,
  currency,
  onPress,
  testID,
}: InvestmentRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <Card
      onPress={() => onPress(investment)}
      accessibilityLabel={`${investment.name}, ${
        INVESTMENT_TYPE_LABELS[investment.type]
      }, invested ${formatMoney(investment.investedMinor, currency)}, current ${formatMoney(
        investment.currentValueMinor,
        currency,
      )}`}
      testID={testID}>
      <View style={styles.row}>
        <CategoryIcon
          icon={INVESTMENT_TYPE_ICONS[investment.type]}
          color={INVESTMENT_TYPE_COLORS[investment.type]}
          size={40}
        />
        <View style={styles.nameWrap}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {investment.name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {INVESTMENT_TYPE_LABELS[investment.type]} · Invested{' '}
            {formatMoney(investment.investedMinor, currency)}
          </Text>
        </View>
        <View style={styles.amountWrap}>
          <AmountText
            amountMinor={investment.currentValueMinor}
            currency={currency}
            type="neutral"
            size="body"
            showSign={false}
          />
          <GainLossBadge
            investedMinor={investment.investedMinor}
            currentValueMinor={investment.currentValueMinor}
            currency={currency}
            testID={`${testID ?? 'investment-row'}-gainloss`}
          />
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
    nameWrap: {flex: 1, gap: theme.spacing.xs},
    amountWrap: {alignItems: 'flex-end', gap: theme.spacing.xs},
  });
