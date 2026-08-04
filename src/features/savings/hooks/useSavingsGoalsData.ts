import {useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {isVirtualAccountType} from '../../accounts/components/accountTypeMeta';
import {getSavingsGoalsRepository} from '../services/savingsGoalsRepository';
import type {SavingsGoal} from '../types/savingsGoal';
import {goalPeriodKey} from '../utils/savingsGoalMath';

export interface SavingsGoalsData {
  /** All goals: active first, then oldest created. */
  goals: SavingsGoal[];
  /** Goal ids whose current period already has a recorded contribution. */
  contributedThisPeriod: ReadonlySet<string>;
  /** Real accounts only — virtual investment/person accounts are never offered. */
  accounts: Account[];
  currency: string;
  /** Sum of saved_minor across every goal. */
  totalSavedMinor: number;
}

interface SavingsGoalsState {
  data: SavingsGoalsData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads all savings goals plus the reference data the list needs, including a
 * single IN query flagging goals already recorded for their current period.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function useSavingsGoalsData(): SavingsGoalsState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<SavingsGoalsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const reload = () => setReloadToken(t => t + 1);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const repo = getSavingsGoalsRepository();
        const [goals, allAccounts, currency] = await Promise.all([
          repo.listGoals(),
          getAccountsRepository().listAccounts(),
          getSettingsRepository().getCurrency(),
        ]);
        // Single snapshot so every goal compares against the same "now".
        const now = Date.now();
        const keyByGoalId = new Map<string, string>();
        for (const goal of goals) {
          if (goal.contributionFrequency) {
            keyByGoalId.set(goal.id, goalPeriodKey(goal, now));
          }
        }
        const distinctKeys = [...new Set(keyByGoalId.values())];
        const periodRows = await repo.listContributionsForPeriods(distinctKeys);
        const contributed = new Set<string>();
        for (const row of periodRows) {
          if (keyByGoalId.get(row.goalId) === row.periodKey) {
            contributed.add(row.goalId);
          }
        }
        if (cancelled) {
          return;
        }
        setData({
          goals,
          contributedThisPeriod: contributed,
          accounts: allAccounts.filter(a => !isVirtualAccountType(a.type)),
          currency,
          totalSavedMinor: goals.reduce((sum, goal) => sum + goal.savedMinor, 0),
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load savings goals',
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
