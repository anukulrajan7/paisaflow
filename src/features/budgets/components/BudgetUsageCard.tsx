import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Pencil, Trash2} from 'lucide-react-native';

import {
  BudgetProgress,
  Card,
  CategoryIcon,
  IconButton,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {BudgetUsage, Category} from '../../../database/types';
import {getCategoryIcon} from '../../../design-system/icons';
import {formatMoney} from '../../../utils/money';
import {getBudgetStatus} from '../utils/budgetStatus';

export interface BudgetUsageCardProps {
  usage: BudgetUsage;
  /** Display name, e.g. 'Overall budget' or the category name. */
  name: string;
  /** When set, the category icon badge is shown. */
  category?: Category;
  currency: string;
  onEdit: (usage: BudgetUsage) => void;
  onDelete: (usage: BudgetUsage) => void;
  testID?: string;
}

/** Budget with its progress bar and a text status (never color alone). */
export function BudgetUsageCard({
  usage,
  name,
  category,
  currency,
  onEdit,
  onDelete,
  testID,
}: BudgetUsageCardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const status = getBudgetStatus(usage.limitMinor, usage.spentMinor);
  const statusColor =
    status.tone === 'over'
      ? 'danger'
      : status.tone === 'near'
        ? 'warning'
        : 'textSecondary';
  const statusText =
    status.tone === 'over'
      ? `Over budget by ${formatMoney(-status.remainingMinor, currency)}`
      : `${formatMoney(status.remainingMinor, currency)} left`;

  return (
    <Card testID={testID} accessibilityLabel={`${name}, ${status.percentUsed}% used`}>
      <View style={styles.headerRow}>
        {category ? (
          <CategoryIcon
            icon={getCategoryIcon(category.icon)}
            color={category.color}
            size={36}
          />
        ) : null}
        <Text variant="bodyMedium" style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <IconButton
          icon={Pencil}
          onPress={() => onEdit(usage)}
          accessibilityLabel={`Edit ${name}`}
          iconSize={18}
        />
        <IconButton
          icon={Trash2}
          variant="danger"
          onPress={() => onDelete(usage)}
          accessibilityLabel={`Delete ${name}`}
          iconSize={18}
        />
      </View>
      <BudgetProgress
        spentMinor={usage.spentMinor}
        totalMinor={usage.limitMinor}
        currency={currency}
        label={`${name} progress`}
      />
      <Text variant="caption" color={statusColor}>
        {statusText} · {status.percentUsed}% used
      </Text>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      marginBottom: theme.spacing.md,
    },
    name: {flex: 1},
  });
