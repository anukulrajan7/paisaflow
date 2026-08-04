import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getCategoriesRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account, Category, CategoryType} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getMostUsedCategoryIds} from '../services/categoryUsageService';

export interface TransactionFormOptions {
  accounts: Account[];
  categories: Category[];
  currency: string;
  /** Most-used category ids per type, most-used first. */
  mostUsedIds: Record<CategoryType, string[]>;
  loading: boolean;
  error: boolean;
  reload: () => void;
}

/** Reference data for the add/edit form; refetches when data changes. */
export function useTransactionFormOptions(): TransactionFormOptions {
  const dataVersion = useDataVersionStore(state => state.dataVersion);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [currency, setCurrency] = useState('INR');
  const [mostUsedIds, setMostUsedIds] = useState<
    Record<CategoryType, string[]>
  >({expense: [], income: []});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(false);
      const [accs, cats, cur, usedExpense, usedIncome] = await Promise.all([
        getAccountsRepository().listAccounts(),
        getCategoriesRepository().listCategories(),
        getSettingsRepository().getCurrency(),
        getMostUsedCategoryIds('expense'),
        getMostUsedCategoryIds('income'),
      ]);
      setAccounts(accs);
      setCategories(cats);
      setCurrency(cur);
      setMostUsedIds({expense: usedExpense, income: usedIncome});
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  return {accounts, categories, currency, mostUsedIds, loading, error, reload: load};
}

/**
 * Categories of one type with the most-used ones first (usage rank wins,
 * original repository order preserved otherwise — Array.sort is stable).
 */
export function orderCategoriesByUsage(
  categories: Category[],
  type: CategoryType,
  mostUsedIds: string[],
): Category[] {
  const rank = new Map(mostUsedIds.map((id, index) => [id, index]));
  return categories
    .filter(category => category.type === type)
    .sort(
      (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
    );
}
