import {useCallback, useEffect, useState} from 'react';

import {getSettingsRepository} from '../../../database/repositories';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getPeopleRepository} from '../services/peopleRepository';
import type {PersonSummary} from '../types/person';

export interface PeopleData {
  summaries: PersonSummary[];
  /** Sum of positive balances — what others owe me. */
  totalOwedToMeMinor: number;
  /** Sum of |negative balances| — what I owe others. */
  totalIOweMinor: number;
  /** Open entries past their expected return date, across all people. */
  overdueCount: number;
  currency: string;
}

interface PeopleState {
  data: PeopleData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads per-person rollups and the summary header numbers.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function usePeopleData(now: number): PeopleState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<PeopleData | null>(null);
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
        const [summaries, currency] = await Promise.all([
          getPeopleRepository().getPersonSummaries(now),
          getSettingsRepository().getCurrency(),
        ]);
        if (cancelled) {
          return;
        }
        setData({
          summaries,
          totalOwedToMeMinor: summaries.reduce(
            (sum, s) => sum + Math.max(s.balanceMinor, 0),
            0,
          ),
          totalIOweMinor: summaries.reduce(
            (sum, s) => sum + Math.max(-s.balanceMinor, 0),
            0,
          ),
          overdueCount: summaries.reduce((sum, s) => sum + s.overdueCount, 0),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load people');
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
  }, [dataVersion, reloadToken, now]);

  return {data, loading, error, reload};
}
