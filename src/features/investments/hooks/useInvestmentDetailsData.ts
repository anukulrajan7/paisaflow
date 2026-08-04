import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getInvestmentsRepository} from '../services/investmentsRepository';
import type {
  Investment,
  InvestmentContribution,
} from '../types/investment';
import {isPaymentAccount} from './useInvestmentsData';

export interface InvestmentDetailsData {
  investment: Investment;
  /** Newest first. */
  contributions: InvestmentContribution[];
  paymentAccounts: Account[];
  currency: string;
}

interface InvestmentDetailsState {
  data: InvestmentDetailsData | null;
  /** True when the id no longer resolves (e.g. bad param). */
  notFound: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads one investment with its contribution history and reference data.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function useInvestmentDetailsData(investmentId: string): InvestmentDetailsState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<InvestmentDetailsData | null>(null);
  const [notFound, setNotFound] = useState(false);
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
        const repo = getInvestmentsRepository();
        const [investment, accounts, currency] = await Promise.all([
          repo.getInvestmentById(investmentId),
          getAccountsRepository().listAccounts({includeArchived: true}),
          getSettingsRepository().getCurrency(),
        ]);
        if (cancelled) {
          return;
        }
        if (!investment) {
          setNotFound(true);
          setData(null);
          return;
        }
        const contributions = await repo.listContributions(investmentId);
        if (cancelled) {
          return;
        }
        setNotFound(false);
        setData({
          investment,
          contributions,
          paymentAccounts: accounts.filter(isPaymentAccount),
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(
            e instanceof Error ? e.message : 'Failed to load the investment',
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
  }, [investmentId, dataVersion, reloadToken]);

  return {data, notFound, loading, error, reload};
}
