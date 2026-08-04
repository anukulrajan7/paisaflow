import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import {getDb} from '../../../database/connection/connection';
import {getDashboardSummary} from '../../../database/queries/dashboardQueries';
import type {DashboardSummary} from '../../../database/queries/dashboardQueries';
import {
  getCategoriesRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Category} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {dayjs, monthPeriod} from '../../../utils/date';
import type {Period} from '../../../utils/date';

export interface DashboardState {
  /** Budget-cycle month currently shown. */
  period: Period;
  /** 0 = current cycle, -1 = previous cycle, etc. */
  monthOffset: number;
  canGoNext: boolean;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  summary: DashboardSummary | null;
  /** Category metadata keyed by id, for resolving recent-transaction rows. */
  categoriesById: Map<string, Category>;
  currency: string;
  loading: boolean;
  error: string | null;
  /** Reload settings + summary (also called on screen focus). */
  refetch: () => void;
}

/**
 * Dashboard data for the selected budget-cycle month.
 * Defaults to the current cycle (budgetCycleStartDay from settings); future
 * cycles are not selectable. Refetches when the month, the data version or
 * the reload key changes.
 */
export function useDashboard(): DashboardState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);

  const [monthOffset, setMonthOffset] = useState(0);
  const [cycleStartDay, setCycleStartDay] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  // Tracked "now" so the memoized period cannot go stale (clock changes,
  // month rollover while the app is open). Refreshed on every refetch/focus.
  const [now, setNow] = useState(() => Date.now());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [categoriesById, setCategoriesById] = useState<Map<string, Category>>(
    () => new Map(),
  );
  const [currency, setCurrency] = useState('INR');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(
    () => monthPeriod(dayjs(now).add(monthOffset, 'month'), cycleStartDay),
    [now, monthOffset, cycleStartDay],
  );

  const refetch = useCallback(() => setReloadKey(k => k + 1), []);

  // Settings can change on other tabs (currency, budget-cycle start day), so
  // they are re-read with every explicit refetch / focus reload.
  useEffect(() => {
    let cancelled = false;
    setNow(Date.now());
    getSettingsRepository()
      .getBudgetCycleStartDay()
      .then(startDay => {
        if (!cancelled) {
          setCycleStartDay(startDay);
        }
      })
      .catch(() => {
        // Keep the default (1st of the month) on failure.
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Track the loaded period so switching months clears stale content (showing
  // skeletons) while same-period refetches keep the current cards on screen.
  const loadedPeriodKey = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const periodKey = `${period.start}:${period.end}`;
    if (loadedPeriodKey.current !== periodKey) {
      setSummary(null);
    }
    setLoading(true);
    setError(null);

    const db = getDb();
    Promise.all([
      getDashboardSummary(db, period),
      getCategoriesRepository().listCategories(),
      getSettingsRepository().getCurrency(),
    ])
      .then(([nextSummary, categories, nextCurrency]) => {
        if (cancelled) {
          return;
        }
        loadedPeriodKey.current = periodKey;
        setSummary(nextSummary);
        setCategoriesById(new Map(categories.map(c => [c.id, c])));
        setCurrency(nextCurrency);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) {
          return;
        }
        setError(
          e instanceof Error ? e.message : 'Could not load the dashboard.',
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [period, dataVersion, reloadKey]);

  const goToPreviousMonth = useCallback(
    () => setMonthOffset(o => o - 1),
    [],
  );
  const goToNextMonth = useCallback(
    () => setMonthOffset(o => Math.min(0, o + 1)),
    [],
  );

  return {
    period,
    monthOffset,
    canGoNext: monthOffset < 0,
    goToPreviousMonth,
    goToNextMonth,
    summary,
    categoriesById,
    currency,
    loading,
    error,
    refetch,
  };
}
