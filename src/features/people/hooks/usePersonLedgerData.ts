import {useCallback, useEffect, useState} from 'react';

import {
  getAccountsRepository,
  getSettingsRepository,
} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {useDataVersionStore} from '../../../store/dataVersionStore';
import {getPeopleRepository} from '../services/peopleRepository';
import type {LedgerEntry, Person} from '../types/person';

export interface PersonLedgerData {
  person: Person;
  entries: LedgerEntry[];
  /** Person-account balance: positive = they owe me, negative = I owe them. */
  balanceMinor: number;
  /** Real payment accounts (virtual person/investment accounts excluded). */
  paymentAccounts: Account[];
  accountsById: Map<string, Account>;
  currency: string;
}

interface PersonLedgerState {
  data: PersonLedgerData | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Loads one person, their ledger entries and the accounts needed for forms.
 * Refetches whenever `dataVersion` changes (any feature mutation).
 */
export function usePersonLedgerData(personId: string): PersonLedgerState {
  const dataVersion = useDataVersionStore(s => s.dataVersion);
  const [data, setData] = useState<PersonLedgerData | null>(null);
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
        const repo = getPeopleRepository();
        const [person, entries, balanceMinor, accounts, currency] =
          await Promise.all([
            repo.getPersonById(personId),
            repo.listLedgerEntries(personId),
            repo.getPersonBalance(personId),
            // Excludes archived accounts (the virtual person accounts too).
            getAccountsRepository().listAccounts(),
            getSettingsRepository().getCurrency(),
          ]);
        if (cancelled) {
          return;
        }
        if (!person || person.deletedAt !== null) {
          setError('Person not found');
          setData(null);
          return;
        }
        const paymentAccounts = accounts.filter(
          account =>
            account.type !== 'person' && account.type !== 'investment',
        );
        const accountsById = new Map<string, Account>();
        for (const account of accounts) {
          accountsById.set(account.id, account);
        }
        setData({
          person,
          entries,
          balanceMinor,
          paymentAccounts,
          accountsById,
          currency,
        });
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load the ledger');
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
  }, [personId, dataVersion, reloadToken]);

  return {data, loading, error, reload};
}
