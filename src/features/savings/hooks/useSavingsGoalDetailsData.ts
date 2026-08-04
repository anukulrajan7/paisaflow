import {useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {isVirtualAccountType} from '../../accounts/components/accountTypeMeta';
import {getSavingsGoalsRepository} from '../services/savingsGoalsRepository';
import type {SavingsContribution, SavingsGoal} from '../types/savingsGoal';
import {goalPeriodKey} from '../utils/savingsGoalMath';

export interface SavingsGoalDetailsData {
  /** Null when the id is unknown (e.g. goal was deleted). */
  goal: SavingsGoal | null;
  /** Newest first. */
  contributions: SavingsContribution[];
  hasContributionThisPeriod: boolean;
  /** Real accounts only — virtual investment/person accounts excluded. */
  accounts: Account[];
  accountsById: Map<string, Account>;
  currency: string;
}

interface SavingsGoalDetailsState {
  data: SavingsGoalDetailsData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function byId(items: Account[]): Map<string, Account> {
  const map = new Map<string, Account>();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

/**
 * Loads one goal with its contribution history. Refetches whenever
 * `dataVersion` changes (any feature mutation).
 */
export function useSavingsGoalDetailsData(
  goalId: string,
): SavingsGoalDetailsState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<SavingsGoalDetailsData | null>(null);
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
        const [goal, contributions, allAccounts, currency] = await Promise.all([
          repo.getGoalById(goalId),
          repo.listContributions(goalId),
          getAccountsRepository().listAccounts(),
          getSettingsRepository().getCurrency(),
        ]);
        let hasContributionThisPeriod = false;
        if (goal?.contributionFrequency) {
          const current = await repo.getContributionForPeriod(
            goal.id,
            goalPeriodKey(goal, Date.now()),
          );
          hasContributionThisPeriod = current !== null;
        }
        if (cancelled) {
          return;
        }
        const accounts = allAccounts.filter(a => !isVirtualAccountType(a.type));
        setData({
          goal,
          contributions,
          hasContributionThisPeriod,
          accounts,
          accountsById: byId(accounts),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load the goal');
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
  }, [goalId, dataVersion, reloadToken]);

  return {data, loading, error, reload};
}
