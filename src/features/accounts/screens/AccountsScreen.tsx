import React, {useCallback, useMemo, useRef, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {useFocusEffect} from '@react-navigation/native';
import {ChevronDown, ChevronUp, Plus} from 'lucide-react-native';

import {
  AppHeader,
  AppScreen,
  EmptyState,
  ErrorState,
  IconButton,
  LoadingState,
  Text,
  useToast,
} from '../../../design-system/components';
import {useTheme} from '../../../design-system/theme';
import {EmptyAccountsIllustration} from '../../../design-system/illustrations';
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import type {Account} from '../../../database/types';
import {useAccounts} from '../hooks/useAccounts';
import {useMonthTotals} from '../hooks/useMonthTotals';
import {useAccountMutations} from '../hooks/useAccountMutations';
import type {AccountFormValues} from '../schemas/accountFormSchema';
import {AccountRow} from '../components/AccountRow';
import type {AccountFormMode} from '../components/AccountFormSheet';
import {AccountFormSheet} from '../components/AccountFormSheet';
import {AccountActionsSheet} from '../components/AccountActionsSheet';
import {BalancesSummary} from '../components/BalancesSummary';
import {isVirtualAccountType} from '../components/accountTypeMeta';
import {computeBalancesSummary} from '../services/balancesSummary';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Accounts'>;

interface FormState {
  visible: boolean;
  mode: AccountFormMode;
}

const CLOSED_FORM: FormState = {visible: false, mode: {kind: 'add'}};

interface SectionToggleProps {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
}

/** Collapsible section header (archived accounts, linked records). */
function SectionToggle({
  title,
  expanded,
  onToggle,
  accessibilityLabel,
}: SectionToggleProps) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{expanded}}
      onPress={onToggle}
      style={styles.sectionToggle}>
      <Text variant="label" color="textSecondary">
        {title}
      </Text>
      {expanded ? (
        <ChevronUp size={18} color={theme.colors.textSecondary} />
      ) : (
        <ChevronDown size={18} color={theme.colors.textSecondary} />
      )}
    </Pressable>
  );
}

/** Accounts & Balances: money overview plus account management
 * (list, add, edit, archive, set default). */
export function AccountsScreen(_props: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {
    active,
    archived,
    currency,
    loading: accountsLoading,
    error: accountsError,
    reload: reloadAccounts,
  } = useAccounts();
  const {
    totals,
    periodLabel,
    loading: totalsLoading,
    error: totalsError,
    reload: reloadTotals,
  } = useMonthTotals();
  const {createAccount, updateAccount, setArchived, setDefault} =
    useAccountMutations();

  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const [selected, setSelected] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [showLinked, setShowLinked] = useState(false);

  const openAdd = useCallback(
    () => setForm({visible: true, mode: {kind: 'add'}}),
    [],
  );

  const reloadAll = useCallback(() => {
    reloadAccounts();
    reloadTotals();
  }, [reloadAccounts, reloadTotals]);

  // Refetch whenever the screen regains focus (the mount effect in each
  // hook already covers the first focus).
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      reloadAll();
    }, [reloadAll]),
  );

  // Virtual accounts (person / investment holding) are read-only here —
  // they are managed by the People & Investments features.
  const realActive = useMemo(
    () => active.filter(item => !isVirtualAccountType(item.account.type)),
    [active],
  );
  const linked = useMemo(
    () => active.filter(item => isVirtualAccountType(item.account.type)),
    [active],
  );

  const summary = useMemo(() => {
    if (totals === null) {
      return null;
    }
    const all = [...active, ...archived];
    const balances: Record<string, number> = {};
    for (const item of all) {
      balances[item.account.id] = item.balanceMinor;
    }
    return computeBalancesSummary(
      all.map(item => item.account),
      balances,
      totals,
    );
  }, [active, archived, totals]);

  const errorMessage = (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : fallback;

  const handleFormSubmit = useCallback(
    async (values: AccountFormValues) => {
      try {
        if (form.mode.kind === 'edit') {
          await updateAccount(form.mode.account.id, values);
          showToast('Account updated', {type: 'success'});
        } else {
          // First real account ever becomes the default automatically.
          await createAccount(values, currency, realActive.length === 0);
          showToast('Account added', {type: 'success'});
        }
      } catch (e) {
        showToast(errorMessage(e, 'Could not save the account'), {
          type: 'error',
        });
        throw e;
      }
    },
    [
      form.mode,
      updateAccount,
      createAccount,
      currency,
      realActive.length,
      showToast,
    ],
  );

  const handleEdit = useCallback((account: Account) => {
    setSelected(null);
    setForm({visible: true, mode: {kind: 'edit', account}});
  }, []);

  const handleSetDefault = useCallback(
    async (account: Account) => {
      setSelected(null);
      try {
        await setDefault(account.id);
        showToast(`${account.name} is now the default account`, {
          type: 'success',
        });
      } catch (e) {
        showToast(errorMessage(e, 'Could not set the default account'), {
          type: 'error',
        });
      }
    },
    [setDefault, showToast],
  );

  // Archiving only flips a flag — the account stays attached to its
  // historical transactions and can be restored at any time.
  const handleToggleArchived = useCallback(
    async (account: Account) => {
      setSelected(null);
      try {
        await setArchived(account.id, !account.isArchived);
        showToast(
          account.isArchived ? 'Account restored' : 'Account archived',
          {type: 'success'},
        );
      } catch (e) {
        showToast(errorMessage(e, 'Could not update the account'), {
          type: 'error',
        });
      }
    },
    [setArchived, showToast],
  );

  const renderBody = () => {
    if (accountsLoading || totalsLoading) {
      return <LoadingState message="Loading accounts" />;
    }
    const error = accountsError ?? totalsError;
    if (error) {
      return (
        <ErrorState
          title="Couldn't load accounts"
          message={error}
          onRetry={reloadAll}
        />
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.list}>
        {active.length === 0 ? (
          <EmptyState
            illustration={<EmptyAccountsIllustration />}
            title="No accounts yet"
            message="Add your first account to start tracking where your money lives."
            actionLabel="Add account"
            onAction={openAdd}
          />
        ) : (
          <>
            {summary && realActive.length > 0 ? (
              <BalancesSummary
                summary={summary}
                currency={currency}
                periodLabel={periodLabel}
                testID="balances-summary"
              />
            ) : null}
            {realActive.map(item => (
              <AccountRow
                key={item.account.id}
                item={item}
                currency={currency}
                onPress={() => setSelected(item.account)}
                testID={`account-row-${item.account.id}`}
              />
            ))}
            {linked.length > 0 ? (
              <View style={styles.section}>
                <SectionToggle
                  title={`Linked records (${linked.length})`}
                  expanded={showLinked}
                  onToggle={() => setShowLinked(v => !v)}
                  accessibilityLabel={
                    showLinked
                      ? 'Hide linked records'
                      : `Show ${linked.length} linked records`
                  }
                />
                {showLinked ? (
                  <>
                    <Text
                      variant="caption"
                      color="textMuted"
                      style={styles.sectionCaption}>
                      Managed by People & Investments features
                    </Text>
                    {linked.map(item => (
                      <AccountRow
                        key={item.account.id}
                        item={item}
                        currency={currency}
                        testID={`linked-account-row-${item.account.id}`}
                      />
                    ))}
                  </>
                ) : null}
              </View>
            ) : null}
          </>
        )}
        {archived.length > 0 ? (
          <View style={styles.section}>
            <SectionToggle
              title={`Archived (${archived.length})`}
              expanded={showArchived}
              onToggle={() => setShowArchived(v => !v)}
              accessibilityLabel={
                showArchived
                  ? 'Hide archived accounts'
                  : `Show ${archived.length} archived accounts`
              }
            />
            {showArchived
              ? archived.map(item => (
                  <AccountRow
                    key={item.account.id}
                    item={item}
                    currency={currency}
                    onPress={() => setSelected(item.account)}
                    testID={`account-row-${item.account.id}`}
                  />
                ))
              : null}
          </View>
        ) : null}
      </ScrollView>
    );
  };

  return (
    <AppScreen>
      <AppHeader
        title="Accounts & Balances"
        right={
          <IconButton
            icon={Plus}
            onPress={openAdd}
            accessibilityLabel="Add account"
          />
        }
      />
      {renderBody()}
      <AccountFormSheet
        visible={form.visible}
        mode={form.mode}
        currency={currency}
        onClose={() => setForm(CLOSED_FORM)}
        onSubmit={handleFormSubmit}
      />
      <AccountActionsSheet
        account={selected}
        onClose={() => setSelected(null)}
        onEdit={handleEdit}
        onSetDefault={handleSetDefault}
        onToggleArchived={handleToggleArchived}
      />
    </AppScreen>
  );
}

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    list: {
      paddingHorizontal: theme.spacing.lg,
      paddingBottom: theme.spacing.xxl,
      gap: theme.spacing.md,
    },
    section: {gap: theme.spacing.md},
    sectionToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.xs,
    },
    sectionCaption: {paddingHorizontal: theme.spacing.xs},
  });
