import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getSalaryRepository} from '../services/salaryRepository';
import type {SalaryConfig, SalaryRecord} from '../types/salary';

export interface SalaryData {
  /** The single active config; null when salary tracking is not set up. */
  config: SalaryConfig | null;
  /** Records for the active config, newest period first. */
  records: SalaryRecord[];
  /** Real destination accounts (virtual person/investment accounts excluded). */
  accounts: Account[];
  accountsById: Map<string, Account>;
  currency: string;
}

interface SalaryState {
  data: SalaryData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function byId<T extends {id: string}>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

/**
 * Loads the active salary config, its records and the reference data needed
 * to display them. Refetches whenever `dataVersion` changes.
 */
export function useSalaryData(): SalaryState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<SalaryData | null>(null);
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
        const salary = getSalaryRepository();
        const config = await salary.getActiveConfig();
        const [records, allAccounts, currency] = await Promise.all([
          config ? salary.listRecords(config.id) : Promise.resolve([]),
          getAccountsRepository().listAccounts(),
          getSettingsRepository().getCurrency(),
        ]);
        if (cancelled) {
          return;
        }
        // Salary lands in real money only — virtual accounts can't receive it.
        const accounts = allAccounts.filter(
          account => account.type !== 'investment' && account.type !== 'person',
        );
        setData({
          config,
          records,
          accounts,
          accountsById: byId(accounts),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load salary details',
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
