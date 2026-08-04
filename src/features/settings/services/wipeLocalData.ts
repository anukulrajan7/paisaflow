import {getDb} from '../../../database/connection';
import {seedDefaultData} from '../../../database/seeds';

/**
 * Hard wipe of every app table, followed by the default seed so the app
 * returns to a fresh-install state (default accounts/categories, no
 * transactions, no settings).
 *
 * Order respects foreign keys (children before parents). Runs in a single
 * transaction; the idempotent seed runs after it commits.
 */
export async function wipeAllLocalData(): Promise<void> {
  const db = getDb();
  await db.transaction(async tx => {
    for (const table of [
      'transaction_tags',
      'tags',
      'transactions',
      'budgets',
      'ai_summaries',
      'categories',
      'accounts',
      'app_settings',
    ]) {
      await tx.executeAsync(`DELETE FROM ${table}`);
    }
  });
  await seedDefaultData(db);
}
