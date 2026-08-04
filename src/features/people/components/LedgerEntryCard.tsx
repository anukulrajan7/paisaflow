import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {Bell, Pencil, Trash2} from 'lucide-react-native';

import {
  AmountText,
  Button,
  Card,
  IconButton,
  Text,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {Account} from '../../../database/types';
import {dayjs} from '../../../utils/date';
import {formatMoney} from '../../../utils/money';
import {isEntryOverdue, remainingMinor} from '../types/person';
import type {LedgerEntry, LedgerStatus} from '../types/person';
import {
  DIRECTION_LABELS,
  REMINDER_SLOT_LABELS,
  STATUS_LABELS,
} from '../utils/ledgerDisplay';

export interface LedgerEntryCardProps {
  entry: LedgerEntry;
  currency: string;
  accountsById: Map<string, Account>;
  /** epoch ms at local start of today (single snapshot per render). */
  todayStart: number;
  onRepay: (entry: LedgerEntry) => void;
  onEdit: (entry: LedgerEntry) => void;
  onSettle: (entry: LedgerEntry) => void;
  onDelete: (entry: LedgerEntry) => void;
  testID?: string;
}

interface BadgeSpec {
  label: string;
  tone: 'warning' | 'primary' | 'success' | 'danger';
}

function statusTone(status: LedgerStatus): BadgeSpec['tone'] {
  if (status === 'completed') {
    return 'success';
  }
  return status === 'partial' ? 'primary' : 'warning';
}

/** One ledger entry: amounts, status, due date, reminder and actions. */
export function LedgerEntryCard({
  entry,
  currency,
  accountsById,
  todayStart,
  onRepay,
  onEdit,
  onSettle,
  onDelete,
  testID,
}: LedgerEntryCardProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const overdue = isEntryOverdue(entry, todayStart);
  const remaining = remainingMinor(entry);
  const accountName = accountsById.get(entry.accountId)?.name ?? 'Account';

  const badges: BadgeSpec[] = [
    {label: STATUS_LABELS[entry.status], tone: statusTone(entry.status)},
    ...(overdue ? [{label: 'Overdue', tone: 'danger' as const}] : []),
  ];

  const toneColors: Record<BadgeSpec['tone'], {bg: string; fg: string}> = {
    warning: {bg: theme.colors.warningSoft, fg: theme.colors.warning},
    primary: {bg: theme.colors.primarySoft, fg: theme.colors.primary},
    success: {bg: theme.colors.successSoft, fg: theme.colors.success},
    danger: {bg: theme.colors.dangerSoft, fg: theme.colors.danger},
  };

  return (
    <Card testID={testID} style={styles.card}>
      <View style={styles.header}>
        <Text variant="bodyMedium" style={styles.direction}>
          {DIRECTION_LABELS[entry.direction]}
        </Text>
        <View style={styles.badges}>
          {badges.map(badge => (
            <View
              key={badge.label}
              style={[
                styles.badge,
                {
                  backgroundColor: toneColors[badge.tone].bg,
                  borderRadius: theme.radius.pill,
                },
              ]}>
              <Text variant="caption" style={{color: toneColors[badge.tone].fg}}>
                {badge.label}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <AmountText
        amountMinor={entry.amountMinor}
        currency={currency}
        type="neutral"
        size="medium"
        showSign={false}
        accessibilityLabel={`Amount ${formatMoney(entry.amountMinor, currency)}`}
      />

      <View style={styles.meta}>
        <Text variant="caption" color="textSecondary">
          {`${dayjs(entry.occurredAt).format('D MMM YYYY')} · ${accountName}`}
        </Text>
        {entry.expectedReturnAt !== null ? (
          <Text variant="caption" color={overdue ? 'danger' : 'textSecondary'}>
            {`Due ${dayjs(entry.expectedReturnAt).format('D MMM YYYY')}`}
          </Text>
        ) : null}
        {entry.status === 'partial' ? (
          <Text variant="caption" color="textSecondary">
            {`${formatMoney(remaining, currency)} left of ${formatMoney(
              entry.amountMinor,
              currency,
            )}`}
          </Text>
        ) : null}
        {entry.notes ? (
          <Text variant="caption" color="textMuted" numberOfLines={2}>
            {entry.notes}
          </Text>
        ) : null}
        {entry.reminderEnabled && entry.reminderSlot ? (
          <View style={styles.reminderRow}>
            <Bell size={12} color={theme.colors.textMuted} />
            <Text variant="caption" color="textMuted">
              {`Reminder · ${REMINDER_SLOT_LABELS[entry.reminderSlot]}`}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {entry.status !== 'completed' ? (
          <>
            <Button
              title="Repay"
              variant="secondary"
              size="sm"
              onPress={() => onRepay(entry)}
              accessibilityLabel="Record repayment"
              testID={`entry-repay-${entry.id}`}
            />
            <Button
              title="Settle"
              variant="ghost"
              size="sm"
              onPress={() => onSettle(entry)}
              accessibilityLabel="Mark as fully repaid"
              testID={`entry-settle-${entry.id}`}
            />
          </>
        ) : null}
        <View style={styles.actionSpacer} />
        <IconButton
          icon={Pencil}
          onPress={() => onEdit(entry)}
          accessibilityLabel="Edit entry"
          testID={`entry-edit-${entry.id}`}
        />
        <IconButton
          icon={Trash2}
          variant="danger"
          onPress={() => onDelete(entry)}
          accessibilityLabel="Delete entry"
          testID={`entry-delete-${entry.id}`}
        />
      </View>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {gap: theme.spacing.sm},
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    direction: {flex: 1},
    badges: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    badge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
    },
    meta: {gap: 2},
    reminderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      marginTop: theme.spacing.xs,
    },
    actionSpacer: {flex: 1},
  });
