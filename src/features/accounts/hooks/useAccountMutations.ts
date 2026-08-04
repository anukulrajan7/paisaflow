import {useCallback} from 'react';

import {getAccountsRepository} from '../../../database/repositories';
import type {Account} from '../../../database/types';
import {bumpDataVersion} from '../../../store/dataVersionStore';
import type {AccountFormValues} from '../schemas/accountFormSchema';

export interface AccountMutations {
  createAccount: (
    values: AccountFormValues,
    currency: string,
    makeDefault: boolean,
  ) => Promise<Account>;
  updateAccount: (id: string, values: AccountFormValues) => Promise<Account>;
  setArchived: (id: string, archived: boolean) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
}

/**
 * Account writes. Every mutation bumps dataVersion so query hooks
 * (here and in other features) refetch from SQLite.
 */
export function useAccountMutations(): AccountMutations {
  const createAccount = useCallback(
    async (values: AccountFormValues, currency: string, makeDefault: boolean) => {
      const created = await getAccountsRepository().createAccount({
        name: values.name,
        type: values.type,
        currency,
        openingBalanceMinor: values.openingBalanceMinor ?? 0,
        isDefault: makeDefault,
      });
      bumpDataVersion();
      return created;
    },
    [],
  );

  const updateAccount = useCallback(
    async (id: string, values: AccountFormValues) => {
      const updated = await getAccountsRepository().updateAccount(id, {
        name: values.name,
        type: values.type,
      });
      bumpDataVersion();
      return updated;
    },
    [],
  );

  const setArchived = useCallback(async (id: string, archived: boolean) => {
    await getAccountsRepository().archiveAccount(id, archived);
    bumpDataVersion();
  }, []);

  const setDefault = useCallback(async (id: string) => {
    await getAccountsRepository().setDefaultAccount(id);
    bumpDataVersion();
  }, []);

  return {createAccount, updateAccount, setArchived, setDefault};
}
