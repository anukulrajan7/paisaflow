import {getDb} from '../../database/connection/connection';
import {MIGRATIONS, runMigrations} from '../../database/migrations';
import {seedDefaultData} from '../../database/seeds';
import {createSettingsRepository} from '../../database/repositories/settingsRepository';
import {syncRemindersFromSettings} from '../../services/notifications';
import {useBootstrapStore} from '../../store/bootstrapStore';
import {useThemeStore} from '../../store/themeStore';

let running = false;

/**
 * App bootstrap: open the SQLite connection, run pending migrations, seed
 * default accounts/categories (idempotent), then load persisted settings and
 * apply the theme preference to the in-memory theme store.
 *
 * NOTE: the DEV sample-data seed (seedDevSampleData) is intentionally NOT
 * called here — production bootstrap seeds defaults only.
 *
 * Reports progress through useBootstrapStore; never throws.
 */
export async function runBootstrap(): Promise<void> {
  if (running) {
    return;
  }
  running = true;
  const {begin, succeed, fail} = useBootstrapStore.getState();
  begin();
  try {
    const db = getDb();
    await runMigrations(db, MIGRATIONS);
    await seedDefaultData(db);

    const settings = createSettingsRepository(db);
    const themePreference = await settings.getThemePreference();
    useThemeStore.getState().setTheme(themePreference);

    // Reschedule daily reminders from the just-loaded settings. Best-effort:
    // notification failures must never break bootstrap.
    try {
      await syncRemindersFromSettings();
    } catch {
      // ignore — reminders are non-critical
    }

    succeed();
  } catch (error) {
    fail(
      error instanceof Error
        ? error.message
        : 'Unknown error while preparing the database',
    );
  } finally {
    running = false;
  }
}
