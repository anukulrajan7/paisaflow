import React, {useCallback, useMemo, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {BottomTabNavigationProp} from '@react-navigation/bottom-tabs';
import {Repeat, Undo2} from 'lucide-react-native';

import {
  AmountText,
  Button,
  Card,
  CategoryIcon,
  Divider,
  Text,
  useToast,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {RootTabParamList} from '../../../app/navigation/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import {useDueRecurringRules} from '../hooks/useDueRecurringRules';
import {confirmRecurringRule} from '../services/confirmRecurringRule';
import {
  describeNextDue,
  isOverdue,
} from '../services/recurringScheduler';
import type {RecurringRule} from '../types/recurringRule';
import {isCreditCardBillPayment, ruleTitle} from '../utils/ruleDisplay';

/** Due rules shown at once; the rest are a tap away via 'View all'. */
const MAX_VISIBLE = 3;

/**
 * Home-screen card listing due/overdue recurring rules with one-tap confirm.
 * Confirming materializes a real transaction (a credit-card destination makes
 * it the card bill payment) and advances the rule to its next future
 * occurrence. Renders nothing when no rule is due.
 */
export function RecurringDueCard(): React.JSX.Element | null {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const navigation = useNavigation();
  const {data} = useDueRecurringRules();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const openRecurring = useCallback(() => {
    navigation
      .getParent<BottomTabNavigationProp<RootTabParamList>>()
      ?.navigate('SettingsTab', {screen: 'Recurring'});
  }, [navigation]);

  const confirm = useCallback(
    async (rule: RecurringRule) => {
      if (!data) {
        return;
      }
      setConfirmingId(rule.id);
      try {
        const result = await confirmRecurringRule(rule.id);
        const isCardBill = isCreditCardBillPayment(rule, data.accountsById);
        const base = isCardBill
          ? 'Card bill payment recorded'
          : 'Transaction recorded';
        const late =
          result.overdueDays > 0
            ? ` — ${result.overdueDays} ${
                result.overdueDays === 1 ? 'day' : 'days'
              } late`
            : '';
        showToast(`${base}${late}`, {type: 'success'});
        bumpDataVersion();
      } catch (e) {
        showToast(
          e instanceof Error ? e.message : 'Could not confirm the payment',
          {type: 'error'},
        );
      } finally {
        setConfirmingId(null);
      }
    },
    [data, showToast],
  );

  if (!data || data.dueRules.length === 0) {
    return null;
  }

  const now = Date.now();
  const visibleRules = data.dueRules.slice(0, MAX_VISIBLE);

  return (
    <Card style={styles.card} testID="recurring-due-card">
      <View style={styles.header}>
        <Repeat size={18} color={theme.colors.primary} />
        <Text variant="bodyMedium" style={styles.headerTitle}>
          Recurring payments
        </Text>
        <Text variant="caption" color="textMuted">
          {data.dueRules.length} due
        </Text>
      </View>

      {visibleRules.map((rule, index) => {
        const title = ruleTitle(rule, data.accountsById, data.categoriesById);
        const category = rule.categoryId
          ? data.categoriesById.get(rule.categoryId)
          : undefined;
        const overdue = isOverdue(rule.nextDueAt, now);
        return (
          <React.Fragment key={rule.id}>
            {index > 0 ? <Divider spacing="sm" /> : null}
            <View style={styles.ruleRow}>
              <CategoryIcon
                icon={
                  rule.type === 'transfer'
                    ? Undo2
                    : getCategoryIcon(category?.icon)
                }
                color={category?.color}
              />
              <View style={styles.ruleTexts}>
                <Text variant="bodyMedium" numberOfLines={1}>
                  {title}
                </Text>
                <Text
                  variant="caption"
                  color={overdue ? 'danger' : 'textSecondary'}>
                  {describeNextDue(rule.nextDueAt, now)}
                </Text>
              </View>
              <View style={styles.ruleActions}>
                <AmountText
                  amountMinor={rule.amountMinor}
                  currency={rule.currency}
                  type={rule.type === 'transfer' ? 'neutral' : rule.type}
                  size="body"
                />
                <Button
                  title="Confirm"
                  size="sm"
                  onPress={() => confirm(rule)}
                  loading={confirmingId === rule.id}
                  disabled={confirmingId !== null}
                  accessibilityLabel={`Confirm ${title}`}
                  testID={`confirm-rule-${rule.id}`}
                />
              </View>
            </View>
          </React.Fragment>
        );
      })}

      <Divider spacing="sm" />
      <Button
        title="View all"
        variant="ghost"
        size="sm"
        onPress={openRecurring}
        accessibilityHint="Opens recurring payments in Settings"
        style={styles.viewAll}
        testID="recurring-view-all"
      />
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {gap: theme.spacing.sm},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
    },
    headerTitle: {flex: 1},
    ruleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    ruleTexts: {flex: 1, gap: theme.spacing.xs},
    ruleActions: {
      alignItems: 'flex-end',
      gap: theme.spacing.xs,
    },
    viewAll: {alignSelf: 'flex-start'},
  });
