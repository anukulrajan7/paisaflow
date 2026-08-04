import React, {useCallback, useMemo, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import {ChevronDown, ChevronUp, Plus, Wallet} from 'lucide-react-native';

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
import type {AppTheme} from '../../../design-system/tokens';
import type {SettingsStackParamList} from '../../../app/navigation/types';
import type {Account} from '../../../database/types';
import {useAccounts} from '../hooks/useAccounts';
import {useAccountMutations} from '../hooks/useAccountMutations';
import type {AccountFormValues} from '../schemas/accountFormSchema';
import {AccountRow} from '../components/AccountRow';
import type {AccountFormMode} from '../components/AccountFormSheet';
import {AccountFormSheet} from '../components/AccountFormSheet';
import {AccountActionsSheet} from '../components/AccountActionsSheet';

type Props = NativeStackScreenProps<SettingsStackParamList, 'Accounts'>;

interface FormState {
  visible: boolean;
  mode: AccountFormMode;
}

const CLOSED_FORM: FormState = {visible: false, mode: {kind: 'add'}};

/** Accounts management: list, add, edit, archive, set default. */
export function AccountsScreen(_props: Props) {
  const {theme} = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const {showToast} = useToast();
  const {active, archived, currency, loading, error, reload} = useAccounts();
  const {createAccount, updateAccount, setArchived, setDefault} =
    useAccountMutations();

  const [form, setForm] = useState<FormState>(CLOSED_FORM);
  const [selected, setSelected] = useState<Account | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const openAdd = useCallback(
    () => setForm({visible: true, mode: {kind: 'add'}}),
    [],
  );

  const errorMessage = (e: unknown, fallback: string) =>
    e instanceof Error ? e.message : fallback;

  const handleFormSubmit = useCallback(
    async (values: AccountFormValues) => {
      try {
        if (form.mode.kind === 'edit') {
          await updateAccount(form.mode.account.id, values);
          showToast('Account updated', {type: 'success'});
        } else {
          // First account ever becomes the default automatically.
          await createAccount(values, currency, active.length === 0);
          showToast('Account added', {type: 'success'});
        }
      } catch (e) {
        showToast(errorMessage(e, 'Could not save the account'), {
          type: 'error',
        });
        throw e;
      }
    },
    [form.mode, updateAccount, createAccount, currency, active.length, showToast],
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
    if (loading) {
      return <LoadingState message="Loading accounts" />;
    }
    if (error) {
      return (
        <ErrorState
          title="Couldn't load accounts"
          message={error}
          onRetry={reload}
        />
      );
    }
    return (
      <ScrollView contentContainerStyle={styles.list}>
        {active.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No accounts yet"
            message="Add your first account to start tracking where your money lives."
            actionLabel="Add account"
            onAction={openAdd}
          />
        ) : (
          active.map(item => (
            <AccountRow
              key={item.account.id}
              item={item}
              currency={currency}
              onPress={() => setSelected(item.account)}
              testID={`account-row-${item.account.id}`}
            />
          ))
        )}
        {archived.length > 0 ? (
          <View style={styles.archivedSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                showArchived
                  ? 'Hide archived accounts'
                  : `Show ${archived.length} archived accounts`
              }
              accessibilityState={{expanded: showArchived}}
              onPress={() => setShowArchived(v => !v)}
              style={styles.archivedToggle}>
              <Text variant="label" color="textSecondary">
                {`Archived (${archived.length})`}
              </Text>
              {showArchived ? (
                <ChevronUp size={18} color={theme.colors.textSecondary} />
              ) : (
                <ChevronDown size={18} color={theme.colors.textSecondary} />
              )}
            </Pressable>
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
        title="Accounts"
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
    archivedSection: {gap: theme.spacing.md},
    archivedToggle: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: theme.spacing.xs,
    },
  });
