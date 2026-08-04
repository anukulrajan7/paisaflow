import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AmountText, Card, Text} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import type {AppTheme} from '../../../design-system/tokens';
import {formatMoney} from '../../../utils/money';
import type {AccountListItem} from '../hooks/useAccounts';
import {ACCOUNT_TYPE_META} from './accountTypeMeta';

export interface AccountRowProps {
  item: AccountListItem;
  currency: string;
  onPress: () => void;
  testID?: string;
}

/** One account in the list: type icon, name, current balance, badges. */
export function AccountRow({item, currency, onPress, testID}: AccountRowProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {account, balanceMinor} = item;
  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta.icon;

  const flags = [
    account.isDefault ? 'default account' : null,
    account.isArchived ? 'archived' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Card
      onPress={onPress}
      testID={testID}
      accessibilityLabel={`${account.name}, ${meta.label}, balance ${formatMoney(
        balanceMinor,
        currency,
      )}${flags ? `, ${flags}` : ''}. Activate for actions.`}
      style={styles.card}>
      <View style={styles.row}>
        <View
          style={[
            styles.iconWrap,
            {borderRadius: theme.radius.pill},
            account.isArchived && styles.iconWrapArchived,
          ]}>
          <Icon
            size={20}
            color={
              account.isArchived
                ? theme.colors.textMuted
                : theme.colors.primary
            }
          />
        </View>
        <View style={styles.info}>
          <Text
            variant="bodyMedium"
            color={account.isArchived ? 'textMuted' : 'textPrimary'}
            numberOfLines={1}>
            {account.name}
          </Text>
          <Text variant="caption" color="textMuted" numberOfLines={1}>
            {meta.label}
          </Text>
        </View>
        <View style={styles.right}>
          <AmountText
            amountMinor={balanceMinor}
            currency={currency}
            type="neutral"
            showSign={false}
            size="body"
            color={account.isArchived ? 'textMuted' : 'textPrimary'}
          />
          {account.isDefault ? (
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: theme.colors.primarySoft,
                  borderRadius: theme.radius.pill,
                },
              ]}>
              <Text variant="caption" color="primary">
                Default
              </Text>
            </View>
          ) : null}
          {account.isArchived ? (
            <Text variant="caption" color="textMuted">
              Archived
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {paddingVertical: theme.spacing.md},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.md,
    },
    iconWrap: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.primarySoft,
    },
    iconWrapArchived: {
      backgroundColor: theme.colors.surfaceElevated,
    },
    info: {flex: 1, gap: theme.spacing.xs},
    right: {alignItems: 'flex-end', gap: theme.spacing.xs},
    badge: {
      paddingHorizontal: theme.spacing.sm,
      paddingVertical: 2,
    },
  });
