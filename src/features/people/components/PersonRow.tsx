import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';
import {ChevronRight, User} from 'lucide-react-native';

import {AmountText, Card, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import type {PersonSummary} from '../types/person';
import {balanceCaption} from '../utils/ledgerDisplay';

export interface PersonRowProps {
  summary: PersonSummary;
  currency: string;
  onPress: (personId: string) => void;
  testID?: string;
}

/** People-list row: avatar tile, name, open-entry count, net balance. */
export function PersonRow({summary, currency, onPress, testID}: PersonRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {person, balanceMinor, openEntryCount, overdueCount} = summary;

  return (
    <Card
      onPress={() => onPress(person.id)}
      accessibilityLabel={`Open ledger for ${person.name}`}
      testID={testID}
      style={styles.card}>
      <View style={[styles.avatar, {borderRadius: theme.radius.pill}]}>
        <User size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.texts}>
        <Text variant="bodyMedium" numberOfLines={1}>
          {person.name}
        </Text>
        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {openEntryCount === 0
            ? 'No open entries'
            : `${openEntryCount} open ${
                openEntryCount === 1 ? 'entry' : 'entries'
              }`}
        </Text>
        {overdueCount > 0 ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: theme.colors.dangerSoft,
                borderRadius: theme.radius.pill,
              },
            ]}>
            <Text variant="caption" color="danger">
              {`${overdueCount} overdue`}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.amountWrap}>
        <AmountText
          amountMinor={balanceMinor}
          currency={currency}
          type="neutral"
          size="body"
          showSign={false}
          color={
            balanceMinor > 0
              ? 'income'
              : balanceMinor < 0
                ? 'expense'
                : 'textMuted'
          }
        />
        <Text variant="caption" color="textMuted">
          {balanceCaption(balanceMinor)}
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.textMuted} />
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    avatar: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    texts: {flex: 1, gap: 2},
    badge: {
      alignSelf: 'flex-start',
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
      marginTop: 2,
    },
    amountWrap: {alignItems: 'flex-end', gap: 2},
  });
