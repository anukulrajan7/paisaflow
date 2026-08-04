import type {SqlDb, SqlExecutor} from '../connection/types';
import {queryRows} from '../connection/helpers';

export interface Migration {
  /** Monotonic integer version; applied strictly in ascending order. */
  version: number;
  name: string;
  up: (db: SqlExecutor) => Promise<void>;
}

const CREATE_SCHEMA_MIGRATIONS = `CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);`;

interface AppliedMigrationRow {
  version: number;
}

/**
 * Applies pending migrations in ascending version order.
 * Each migration runs inside its own SQL transaction together with its
 * schema_migrations record, so a failure rolls back cleanly and can be
 * retried on the next launch. Returns the versions applied by this run.
 */
export async function runMigrations(
  db: SqlDb,
  migrations: Migration[],
): Promise<number[]> {
  await db.executeAsync(CREATE_SCHEMA_MIGRATIONS);

  const appliedRows = await queryRows<AppliedMigrationRow>(
    db,
    'SELECT version FROM schema_migrations ORDER BY version ASC',
  );
  const applied = new Set(appliedRows.map(row => Number(row.version)));

  const pending = migrations
    .filter(migration => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await db.transaction(async tx => {
      await migration.up(tx);
      await tx.executeAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        [migration.version, Date.now()],
      );
    });
  }

  return pending.map(migration => migration.version);
}
