import {useCallback, useEffect, useRef, useState} from 'react';
import {useFocusEffect} from '@react-navigation/native';

import {getDb} from '../../../database/connection';
import {getInsightsRawData} from '../../../database/queries/insightsQueries';
import {getSettingsRepository} from '../../../database/repositories';
import type {BudgetUsage} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {
  dayjs,
  formatPeriodLabel,
  monthPeriod,
  shiftMonthPeriod,
} from '../../../utils/date';
import type {Period} from '../../../utils/date';
import type {
  CategoryShare,
  InsightsTransaction,
  MonthComparison,
  SpendingStats,
  TrendPoint,
} from '../services/insightsAggregation';
import {
  buildCategoryShares,
  buildDailyTrend,
  buildMonthComparison,
  buildMonthlyTrend,
  buildWeeklyTrend,
  computeSpendingStats,
} from '../services/insightsAggregation';

/** How many past monthly budget cycles the insights window covers. */
const TREND_CYCLE_COUNT = 6;

export interface InsightsViewModel {
  currency: string;
  /** Human label for the current budget cycle, e.g. 'June 2025'. */
  cycleLabel: string;
  previousCycleLabel: string;
  /** False when there is no income/expense activity in the whole window. */
  hasTransactions: boolean;
  dailyTrend: TrendPoint[];
  weeklyTrend: TrendPoint[];
  monthlyTrend: TrendPoint[];
  categoryShares: CategoryShare[];
  stats: SpendingStats;
  comparison: MonthComparison;
  overallBudgetUsage: BudgetUsage | null;
}

export type InsightsState =
  | {status: 'loading'}
  | {status: 'error'}
  | {status: 'ready'; data: InsightsViewModel};

async function loadInsights(): Promise<InsightsViewModel> {
  const settings = getSettingsRepository();
  const [cycleStartDay, currency] = await Promise.all([
    settings.getBudgetCycleStartDay(),
    settings.getCurrency(),
  ]);

  const now = Date.now();
  const currentCycle: Period = monthPeriod(dayjs(now), cycleStartDay);
  const previousCycle = shiftMonthPeriod(currentCycle, -1);
  const windowStart = shiftMonthPeriod(
    currentCycle,
    -(TREND_CYCLE_COUNT - 1),
  ).start;

  const raw = await getInsightsRawData(getDb(), windowStart, currentCycle.end, now);

  const transactions: InsightsTransaction[] = raw.transactions.map(row => ({
    type: row.type === 'income' ? 'income' : 'expense',
    amountMinor: row.amount_minor,
    categoryId: row.category_id,
    occurredAt: row.occurred_at,
  }));

  return {
    currency,
    cycleLabel: formatPeriodLabel(currentCycle),
    previousCycleLabel: formatPeriodLabel(previousCycle),
    hasTransactions: transactions.length > 0,
    dailyTrend: buildDailyTrend(transactions, currentCycle, now),
    weeklyTrend: buildWeeklyTrend(transactions, now),
    monthlyTrend: buildMonthlyTrend(transactions, cycleStartDay, now),
    categoryShares: buildCategoryShares(
      transactions.filter(
        t => t.occurredAt >= currentCycle.start && t.occurredAt < currentCycle.end,
      ),
      raw.categories,
    ),
    stats: computeSpendingStats(transactions, currentCycle, now),
    comparison: buildMonthComparison(transactions, currentCycle, previousCycle),
    overallBudgetUsage: raw.overallBudgetUsage,
  };
}

/** Loads and refreshes Insights data; refetches on dataVersion bumps and focus. */
export function useInsights(): InsightsState & {reload: () => void} {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [state, setState] = useState<InsightsState>({status: 'loading'});
  // Focus refetch covers the initial mount; skip the first dataVersion run.
  const skipFirstVersionRun = useRef(true);

  const reload = useCallback(() => {
    let cancelled = false;
    loadInsights()
      .then(data => {
        if (!cancelled) {
          setState({status: 'ready', data});
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({status: 'error'});
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const cancel = reload();
      return cancel;
    }, [reload]),
  );

  useEffect(() => {
    if (skipFirstVersionRun.current) {
      skipFirstVersionRun.current = false;
      return;
    }
    const cancel = reload();
    return cancel;
  }, [dataVersion, reload]);

  return {...state, reload};
}
