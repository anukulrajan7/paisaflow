import {useCallback, useEffect, useState} from 'react';

import {
  getBudgetsRepository,
  getCategoriesRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {BudgetUsage, Category, Period} from '../../../database/types';
import {dayjs, monthPeriod} from '../../../utils/date';
import {useDataVersionStore} from '../../../store/dataVersionStore';

export interface BudgetsData {
  /** Current monthly budget cycle. */
  period: Period;
  currency: string;
  /** Usage for the overall budget (categoryId null), null when none exists. */
  overallUsage: BudgetUsage | null;
  /** Usage for category budgets, sorted by name. */
  categoryUsages: BudgetUsage[];
  /** Active (non-archived) expense categories, for the form. */
  expenseCategories: Category[];
}

interface BudgetsDataState {
  data: BudgetsData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads budgets active in the current monthly cycle together with their
 * usage. Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function useBudgetsData(): BudgetsDataState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<BudgetsData | null>(null);
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
        const settings = getSettingsRepository();
        const budgetsRepo = getBudgetsRepository();
        const [cycleStartDay, currency, budgets, expenseCategories] = await Promise.all([
          settings.getBudgetCycleStartDay(),
          settings.getCurrency(),
          budgetsRepo.listBudgetsActiveAt(Date.now()),
          getCategoriesRepository().listCategories({type: 'expense'}),
        ]);
        const usages = await Promise.all(budgets.map(b => budgetsRepo.getBudgetUsage(b.id)));
        if (cancelled) {
          return;
        }
        const overall = usages.find(u => u.budget.categoryId === null) ?? null;
        const categoryUsages = usages
          .filter(u => u.budget.categoryId !== null)
          .sort((a, b) => {
            const nameOf = (u: BudgetUsage) =>
              expenseCategories.find(c => c.id === u.budget.categoryId)?.name ?? '';
            return nameOf(a).localeCompare(nameOf(b));
          });
        setData({
          period: monthPeriod(dayjs(), cycleStartDay),
          currency,
          overallUsage: overall,
          categoryUsages,
          expenseCategories,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load budgets');
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
