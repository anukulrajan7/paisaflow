import type {SQLiteValue} from 'react-native-nitro-sqlite';

import {getDb} from '../../../database/connection/connection';
import {queryRows} from '../../../database/connection/helpers';
import {escapeLike, mapTransactionRow} from '../../../database/repositories/mappers';
import type {Transaction, TransactionType} from '../../../database/types';
import type {TransactionRow} from '../../../database/types/rows';

/**
 * Paged list query for the Transactions screen. The repository contract does
 * not combine free-text search with filters + offset pagination, so this
 * feature-local query fills the gap — bound parameters only, mirroring
 * TransactionsRepository.listTransactions semantics (soft-deleted rows hidden,
 * newest first).
 */
export interface TransactionListQuery {
  /** Matches merchant, note, or category name (LIKE, escaped). */
  search?: string;
  type?: TransactionType;
  categoryId?: string;
  accountId?: string;
  /** epoch ms, inclusive */
  from?: number;
  /** epoch ms, exclusive */
  to?: number;
  limit: number;
  offset: number;
}

const COLUMNS =
  'id, type, amount_minor, currency, account_id, destination_account_id, category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at';

export async function queryTransactionPage(
  query: TransactionListQuery,
): Promise<Transaction[]> {
  const where: string[] = ['deleted_at IS NULL'];
  const params: SQLiteValue[] = [];

  if (query.type) {
    where.push('type = ?');
    params.push(query.type);
  }
  if (query.categoryId) {
    where.push('category_id = ?');
    params.push(query.categoryId);
  }
  if (query.accountId) {
    where.push('account_id = ?');
    params.push(query.accountId);
  }
  if (query.from != null) {
    where.push('occurred_at >= ?');
    params.push(query.from);
  }
  if (query.to != null) {
    where.push('occurred_at < ?');
    params.push(query.to);
  }

  const term = query.search?.trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    where.push(
      `(merchant LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR category_id IN (SELECT id FROM categories WHERE name LIKE ? ESCAPE '\\'))`,
    );
    params.push(like, like, like);
  }

  const rows = await queryRows<TransactionRow>(
    getDb(),
    `SELECT ${COLUMNS} FROM transactions
     WHERE ${where.join(' AND ')}
     ORDER BY occurred_at DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, query.limit, query.offset],
  );
  return rows.map(mapTransactionRow);
}
