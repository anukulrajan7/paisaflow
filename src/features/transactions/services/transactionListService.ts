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

type TransactionFilter = Omit<TransactionListQuery, 'limit' | 'offset'>;

/** Shared WHERE clause (bound params) for the list query and its COUNT twin. */
function buildWhere(filter: TransactionFilter): {
  clause: string;
  params: SQLiteValue[];
} {
  const where: string[] = ['deleted_at IS NULL'];
  const params: SQLiteValue[] = [];

  if (filter.type) {
    where.push('type = ?');
    params.push(filter.type);
  }
  if (filter.categoryId) {
    where.push('category_id = ?');
    params.push(filter.categoryId);
  }
  if (filter.accountId) {
    where.push('account_id = ?');
    params.push(filter.accountId);
  }
  if (filter.from != null) {
    where.push('occurred_at >= ?');
    params.push(filter.from);
  }
  if (filter.to != null) {
    where.push('occurred_at < ?');
    params.push(filter.to);
  }

  const term = filter.search?.trim();
  if (term) {
    const like = `%${escapeLike(term)}%`;
    where.push(
      `(merchant LIKE ? ESCAPE '\\' OR note LIKE ? ESCAPE '\\' OR category_id IN (SELECT id FROM categories WHERE name LIKE ? ESCAPE '\\'))`,
    );
    params.push(like, like, like);
  }

  return {clause: where.join(' AND '), params};
}

export async function queryTransactionPage(
  query: TransactionListQuery,
): Promise<Transaction[]> {
  const {clause, params} = buildWhere(query);
  const rows = await queryRows<TransactionRow>(
    getDb(),
    `SELECT ${COLUMNS} FROM transactions
     WHERE ${clause}
     ORDER BY occurred_at DESC, created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, query.limit, query.offset],
  );
  return rows.map(mapTransactionRow);
}

/** Total rows matching the filter — powers the filter sheet's apply preview. */
export async function countTransactions(
  filter: TransactionFilter,
): Promise<number> {
  const {clause, params} = buildWhere(filter);
  const rows = await queryRows<{count: number}>(
    getDb(),
    `SELECT COUNT(*) AS count FROM transactions WHERE ${clause}`,
    params,
  );
  return rows[0]?.count ?? 0;
}
