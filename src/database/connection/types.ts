import type {QueryResult, SQLiteValue} from 'react-native-nitro-sqlite';

/**
 * Minimal executor surface shared by a connection and a transaction.
 * Kept intentionally narrow so repositories and migrations can run against
 * either one — and against a lightweight fake in unit tests.
 */
export interface SqlExecutor {
  execute(sql: string, params?: SQLiteValue[]): QueryResult;
  executeAsync(sql: string, params?: SQLiteValue[]): Promise<QueryResult>;
}

/** A database connection: an executor plus transaction support. */
export interface SqlDb extends SqlExecutor {
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
