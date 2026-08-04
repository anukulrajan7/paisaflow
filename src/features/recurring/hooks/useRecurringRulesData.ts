import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getCategoriesRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account, Category} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getRecurringRulesRepository} from '../services/recurringRulesRepository';
import type {RecurringRule} from '../types/recurringRule';

export interface RecurringRulesData {
  /** All rules: active first, then soonest due. */
  rules: RecurringRule[];
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  currency: string;
}

interface RecurringRulesState {
  data: RecurringRulesData | null;
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
 * Loads all recurring rules plus the reference data needed to display them.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function useRecurringRulesData(): RecurringRulesState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<RecurringRulesData | null>(null);
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
        const [rules, accounts, categories, currency] = await Promise.all([
          getRecurringRulesRepository().listRules(),
          getAccountsRepository().listAccounts(),
          getCategoriesRepository().listCategories(),
          getSettingsRepository().getCurrency(),
        ]);
        if (cancelled) {
          return;
        }
        setData({
          rules,
          accountsById: byId(accounts),
          categoriesById: byId(categories),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load recurring payments',
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
