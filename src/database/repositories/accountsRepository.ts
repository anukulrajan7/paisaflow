import type {SqlDb} from '../connection/types';
import {queryFirst, queryRows} from '../connection/helpers';
import type {Account} from '../types';
import type {AccountRow} from '../types/rows';
import {newId} from '../../utils/id';
import type {AccountsRepository} from './interfaces';
import {mapAccountRow} from './mappers';

const COLUMNS =
  'id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at';

export function createAccountsRepository(db: SqlDb): AccountsRepository {
  async function getAccountById(id: string): Promise<Account | null> {
    const row = await queryFirst<AccountRow>(
      db,
      `SELECT ${COLUMNS} FROM accounts WHERE id = ?`,
      [id],
    );
    return row ? mapAccountRow(row) : null;
  }

  return {
    async createAccount(input) {
      if (!input.name.trim()) {
        throw new Error('Account name is required');
      }
      const id = newId();
      const now = Date.now();
      const openingBalanceMinor = input.openingBalanceMinor ?? 0;
      if (!Number.isSafeInteger(openingBalanceMinor)) {
        throw new Error('openingBalanceMinor must be an integer (minor units)');
      }
      await db.transaction(async tx => {
        if (input.isDefault) {
          await tx.executeAsync(
            'UPDATE accounts SET is_default = 0, updated_at = ? WHERE is_default = 1',
            [now],
          );
        }
        await tx.executeAsync(
          `INSERT INTO accounts
            (id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            input.name.trim(),
            input.type,
            input.currency,
            openingBalanceMinor,
            input.isDefault ? 1 : 0,
            0,
            now,
            now,
          ],
        );
      });
      const created = await getAccountById(id);
      if (!created) {
        throw new Error(`Account not found after create: ${id}`);
      }
      return created;
    },

    async updateAccount(id, patch) {
      const existing = await getAccountById(id);
      if (!existing) {
        throw new Error(`Account not found: ${id}`);
      }
      await db.executeAsync(
        `UPDATE accounts SET
          name = ?, type = ?, currency = ?, opening_balance_minor = ?,
          is_archived = ?, updated_at = ?
         WHERE id = ?`,
        [
          patch.name?.trim() ?? existing.name,
          patch.type ?? existing.type,
          patch.currency ?? existing.currency,
          patch.openingBalanceMinor ?? existing.openingBalanceMinor,
          (patch.isArchived ?? existing.isArchived) ? 1 : 0,
          Date.now(),
          id,
        ],
      );
      const updated = await getAccountById(id);
      if (!updated) {
        throw new Error(`Account not found after update: ${id}`);
      }
      return updated;
    },

    async archiveAccount(id, archived = true) {
      await db.executeAsync(
        'UPDATE accounts SET is_archived = ?, updated_at = ? WHERE id = ?',
        [archived ? 1 : 0, Date.now(), id],
      );
    },

    getAccountById,

    async listAccounts(options = {}) {
      const where = options.includeArchived ? '' : ' WHERE is_archived = 0';
      const rows = await queryRows<AccountRow>(
        db,
        `SELECT ${COLUMNS} FROM accounts${where} ORDER BY is_default DESC, name ASC`,
      );
      return rows.map(mapAccountRow);
    },

    async getDefaultAccount() {
      const row = await queryFirst<AccountRow>(
        db,
        `SELECT ${COLUMNS} FROM accounts WHERE is_default = 1 AND is_archived = 0`,
      );
      return row ? mapAccountRow(row) : null;
    },

    async setDefaultAccount(id) {
      const now = Date.now();
      await db.transaction(async tx => {
        await tx.executeAsync(
          'UPDATE accounts SET is_default = 0, updated_at = ? WHERE is_default = 1',
          [now],
        );
        await tx.executeAsync(
          'UPDATE accounts SET is_default = 1, updated_at = ? WHERE id = ?',
          [now, id],
        );
      });
    },

    async getAccountBalance(id) {
      const account = await getAccountById(id);
      if (!account) {
        throw new Error(`Account not found: ${id}`);
      }
      // Transactions where this account is the source.
      const sourceRows = await queryRows<{type: string; amount_minor: number}>(
        db,
        'SELECT type, amount_minor FROM transactions WHERE deleted_at IS NULL AND account_id = ?',
        [id],
      );
      // Transfers into this account (it is the destination).
      const incomingTransfers = await queryRows<{amount_minor: number}>(
        db,
        "SELECT amount_minor FROM transactions WHERE deleted_at IS NULL AND type = 'transfer' AND destination_account_id = ?",
        [id],
      );

      let balance = account.openingBalanceMinor;
      for (const row of sourceRows) {
        if (row.type === 'income') {
          balance += row.amount_minor;
        } else {
          // expense or transfer out
          balance -= row.amount_minor;
        }
      }
      for (const row of incomingTransfers) {
        balance += row.amount_minor;
      }
      return balance;
    },
  };
}
