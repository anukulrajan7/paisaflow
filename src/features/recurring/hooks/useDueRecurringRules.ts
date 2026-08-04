import {useCallback, useEffect, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';

import {
  getAccountsRepository,
  getCategoriesRepository,
} from '../../../database/repositories';
import type {Account, Category} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {listDueRules} from '../services/recurringScheduler';
import {getRecurringRulesRepository} from '../services/recurringRulesRepository';
import type {RecurringRule} from '../types/recurringRule';

export interface DueRecurringRules {
  /** Active rules due now or overdue, oldest due date first. */
  dueRules: RecurringRule[];
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
}

interface DueRecurringRulesState {
  data: DueRecurringRules | null;
  reload: () => void;
}

/**
 * Due/overdue active rules for the Home card. Refetches on every
 * `dataVersion` change and every screen focus, so a rule confirmed elsewhere
 * (or a rule that just came due) is reflected immediately.
 */
export function useDueRecurringRules(): DueRecurringRulesState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<DueRecurringRules | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [active, accounts, categories] = await Promise.all([
          getRecurringRulesRepository().listActiveRules(),
          getAccountsRepository().listAccounts(),
          getCategoriesRepository().listCategories(),
        ]);
        if (cancelled) {
          return;
        }
        setData({
          dueRules: listDueRules(active, Date.now()),
          accountsById: new Map(accounts.map(a => [a.id, a])),
          categoriesById: new Map(categories.map(c => [c.id, c])),
        });
      } catch {
        // The Home card is opportunistic: a load failure just hides it.
        if (!cancelled) {
          setData(null);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, reloadToken]);

  useFocusEffect(
    useCallback(() => {
      setReloadToken(t => t + 1);
    }, []),
  );

  return {data, reload};
}
