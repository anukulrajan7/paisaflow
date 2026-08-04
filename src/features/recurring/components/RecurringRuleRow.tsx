import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Pause, Play, Trash2, Undo2} from 'lucide-react-native';

import {
  AmountText,
  Button,
  Card,
  CategoryIcon,
  IconButton,
  Text,
} from '../../../design-system/components';
import {getCategoryIcon} from '../../../design-system/icons';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account, Category} from '../../../database/types';
import {
  describeNextDue,
  frequencyLabel,
  isOverdue,
} from '../services/recurringScheduler';
import type {RecurringRule} from '../types/recurringRule';
import {ruleAccountLabel, ruleTitle} from '../utils/ruleDisplay';

export interface RecurringRuleRowProps {
  rule: RecurringRule;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  /** Snapshot timestamp shared by all rows in one render. */
  now: number;
  onEdit: (rule: RecurringRule) => void;
  onToggleActive: (rule: RecurringRule) => void;
  onDelete: (rule: RecurringRule) => void;
  testID?: string;
}

/** One recurring rule: schedule summary, due state, pause/delete actions. */
export function RecurringRuleRow({
  rule,
  accountsById,
  categoriesById,
  now,
  onEdit,
  onToggleActive,
  onDelete,
  testID,
}: RecurringRuleRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const title = ruleTitle(rule, accountsById, categoriesById);
  const category = rule.categoryId ? categoriesById.get(rule.categoryId) : undefined;
  const overdue = rule.isActive && isOverdue(rule.nextDueAt, now);

  return (
    <Card testID={testID} style={styles.card}>
      <View style={styles.headerRow}>
        <CategoryIcon
          icon={rule.type === 'transfer' ? Undo2 : getCategoryIcon(category?.icon)}
          color={category?.color}
        />
        <View style={styles.titleBlock}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={1}>
            {frequencyLabel(rule)} · {ruleAccountLabel(rule, accountsById)}
          </Text>
        </View>
        <AmountText
          amountMinor={rule.amountMinor}
          currency={rule.currency}
          type={rule.type === 'transfer' ? 'neutral' : rule.type}
          size="body"
        />
      </View>

      <View style={styles.dueRow}>
        {rule.isActive ? (
          overdue ? (
            <View
              style={[
                styles.overdueBadge,
                {
                  backgroundColor: theme.colors.dangerSoft,
                  borderRadius: theme.radius.pill,
                },
              ]}>
              <Text variant="caption" color="danger">
                {describeNextDue(rule.nextDueAt, now)}
              </Text>
            </View>
          ) : (
            <Text variant="caption" color="textSecondary">
              {describeNextDue(rule.nextDueAt, now)}
            </Text>
          )
        ) : (
          <Text variant="caption" color="textMuted">
            Paused
          </Text>
        )}
      </View>

      <View style={styles.actionsRow}>
        <Button
          title="Edit"
          variant="ghost"
          size="sm"
          onPress={() => onEdit(rule)}
          accessibilityLabel={`Edit ${title}`}
        />
        <Button
          title={rule.isActive ? 'Pause' : 'Resume'}
          variant="ghost"
          size="sm"
          icon={rule.isActive ? Pause : Play}
          onPress={() => onToggleActive(rule)}
          accessibilityLabel={`${rule.isActive ? 'Pause' : 'Resume'} ${title}`}
        />
        <View style={styles.spacer} />
        <IconButton
          icon={Trash2}
          variant="danger"
          onPress={() => onDelete(rule)}
          accessibilityLabel={`Delete ${title}`}
        />
      </View>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {gap: theme.spacing.sm},
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    titleBlock: {flex: 1, gap: theme.spacing.xs},
    dueRow: {flexDirection: 'row', alignItems: 'center'},
    overdueBadge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: theme.spacing.xs,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    spacer: {flex: 1},
  });
