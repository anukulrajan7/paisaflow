import type {SQLiteValue} from 'react-native-nitro-sqlite';

import type {SqlExecutor} from './types';

/**
 * Low-level typed query helpers. `T` is the expected ROW shape (snake_case);
 * mapping to domain models happens in the repositories.
 */
export async function queryRows<T>(
  db: SqlExecutor,
  sql: string,
  params: SQLiteValue[] = [],
): Promise<T[]> {
  const result = await db.executeAsync(sql, params);
  return result.rows._array as unknown as T[];
}

export async function queryFirst<T>(
  db: SqlExecutor,
  sql: string,
  params: SQLiteValue[] = [],
): Promise<T | null> {
  const rows = await queryRows<T>(db, sql, params);
  return rows[0] ?? null;
}
