import {useCallback, useEffect, useMemo, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';

export interface AccountListItem {
  account: Account;
  balanceMinor: number;
}

export interface UseAccountsResult {
  active: AccountListItem[];
  archived: AccountListItem[];
  currency: string;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads all accounts (including archived) with their current balances.
 * Refetches whenever the shared dataVersion is bumped by a mutation.
 */
export function useAccounts(): UseAccountsResult {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [items, setItems] = useState<AccountListItem[] | null>(null);
  const [currency, setCurrency] = useState('INR');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const repo = getAccountsRepository();
      const [accounts, currentCurrency] = await Promise.all([
        repo.listAccounts({includeArchived: true}),
        getSettingsRepository().getCurrency(),
      ]);
      const balances = await Promise.all(
        accounts.map(account => repo.getAccountBalance(account.id)),
      );
      setItems(
        accounts.map((account, index) => ({
          account,
          balanceMinor: balances[index],
        })),
      );
      setCurrency(currentCurrency);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const active = useMemo(
    () => (items ?? []).filter(item => !item.account.isArchived),
    [items],
  );
  const archived = useMemo(
    () => (items ?? []).filter(item => item.account.isArchived),
    [items],
  );

  return {
    active,
    archived,
    currency,
    loading: items === null && error === null,
    error,
    reload: load,
  };
}
