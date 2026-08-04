import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getInvestmentsRepository} from '../services/investmentsRepository';
import type {Investment} from '../types/investment';

export interface InvestmentsData {
  /** Active investments, name A→Z. */
  investments: Investment[];
  /** Real accounts usable as contribution payment sources. */
  paymentAccounts: Account[];
  currency: string;
}

interface InvestmentsState {
  data: InvestmentsData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** Virtual holding/ledger accounts can never be contribution sources. */
export function isPaymentAccount(account: Account): boolean {
  return (
    !account.isArchived &&
    account.type !== 'investment' &&
    account.type !== 'person'
  );
}

/**
 * Loads active investments plus payment accounts and currency.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function useInvestmentsData(): InvestmentsState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<InvestmentsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [investments, accounts, currency] = await Promise.all([
          getInvestmentsRepository().listInvestments(),
          getAccountsRepository().listAccounts({includeArchived: true}),
          getSettingsRepository().getCurrency(),
        ]);
        if (cancelled) {
          return;
        }
        setData({
          investments,
          paymentAccounts: accounts.filter(isPaymentAccount),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load investments',
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, reloadToken]);

  return {data, loading, error, reload};
}
