import {useCallback, useEffect, useState} from 'react';

import {
  getSettingsRepository,
  getTransactionsRepository,
} from '../../../database/repositories';
import type {PeriodTotals} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {dayjs, formatPeriodLabel, monthPeriod} from '../../../utils/date';

export interface UseMonthTotalsResult {
  /** Income/expense totals for the current budget-cycle month. */
  totals: PeriodTotals | null;
  /** Human label of that cycle, e.g. 'June 2026'. */
  periodLabel: string | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Read-only monthly income/expense totals for the current budget cycle
 * (budgetCycleStartDay from settings). Refetches on dataVersion bumps and
 * on explicit reload (screen focus). Previous totals stay on screen while
 * a refetch is in flight, so `loading` is only true before the first load.
 */
export function useMonthTotals(): UseMonthTotalsResult {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [totals, setTotals] = useState<PeriodTotals | null>(null);
  const [periodLabel, setPeriodLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Re-read on every load: the cycle start day can change in Settings.
        const cycleStartDay = await getSettingsRepository()
          .getBudgetCycleStartDay()
          .catch(() => 1);
        const period = monthPeriod(dayjs(), cycleStartDay);
        const next = await getTransactionsRepository().getMonthlyTotals(
          period,
        );
        if (!cancelled) {
          setTotals(next);
          setPeriodLabel(formatPeriodLabel(period));
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load monthly totals',
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataVersion, reloadKey]);

  const reload = useCallback(() => setReloadKey(k => k + 1), []);

  return {
    totals,
    periodLabel,
    loading: totals === null && error === null,
    error,
    reload,
  };
}
