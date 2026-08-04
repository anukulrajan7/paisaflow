import {MIGRATIONS, runMigrations} from '../migrations';
import type {Migration} from '../migrations';
import {createFakeDb} from './fakeDb';

function makeMigration(
  version: number,
  order?: number[],
): Migration {
  return {
    version,
    name: `migration_${version}`,
    up: async db => {
      order?.push(version);
      await db.executeAsync(
        `CREATE TABLE test_table_${version} (id TEXT PRIMARY KEY);`,
      );
    },
  };
}

describe('migration runner', () => {
  it('applies pending migrations once and in ascending order', async () => {
    const db = createFakeDb();
    const order: number[] = [];

    const applied = await runMigrations(db, [
      makeMigration(3, order),
      makeMigration(1, order),
      makeMigration(2, order),
    ]);

    expect(applied).toEqual([1, 2, 3]);
    expect(order).toEqual([1, 2, 3]);
    expect(db.getRows('schema_migrations').map(row => row.version)).toEqual([
      1, 2, 3,
    ]);
    expect(db.getRows('test_table_1')).toEqual([]);

    // Second run: nothing pending.
    const secondRun = await runMigrations(db, [
      makeMigration(3, order),
      makeMigration(1, order),
      makeMigration(2, order),
    ]);
    expect(secondRun).toEqual([]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('applies only migrations newer than the current version', async () => {
    const db = createFakeDb();
    await runMigrations(db, [makeMigration(1), makeMigration(2)]);
    const applied = await runMigrations(db, [
      makeMigration(1),
      makeMigration(2),
      makeMigration(3),
    ]);
    expect(applied).toEqual([3]);
  });

  it('rolls back a failed migration so it can be retried', async () => {
    const db = createFakeDb();
    const failing: Migration = {
      version: 1,
      name: 'broken',
      up: async tx => {
        await tx.executeAsync('CREATE TABLE partial (id TEXT PRIMARY KEY);');
        throw new Error('boom');
      },
    };

    await expect(runMigrations(db, [failing])).rejects.toThrow('boom');
    expect(db.getRows('schema_migrations')).toEqual([]);
    expect(() => db.getRows('partial')).toThrow("no such table 'partial'");

    // Fixed migration can be applied on the next attempt.
    const applied = await runMigrations(db, [makeMigration(1)]);
    expect(applied).toEqual([1]);
  });

  it('migrations create the full schema', async () => {
    const db = createFakeDb();
    const applied = await runMigrations(db, MIGRATIONS);
    expect(applied).toEqual([1, 2]);
    for (const table of [
      'accounts',
      'categories',
      'transactions',
      'tags',
      'transaction_tags',
      'budgets',
      'app_settings',
      'ai_summaries',
      'detected_expenses',
    ]) {
      expect(db.getRows(table)).toEqual([]);
    }
  });
});
