/**
 * Optional cloud backup sync to the user's OWN Supabase project.
 *
 * Local SQLite stays the source of truth. Strategy per table:
 *   1. PUSH  — upsert local rows with `updated_at` newer than the table's
 *      last-sync watermark (soft-deleted transactions included, so deletes
 *      propagate remotely).
 *   2. PULL  — fetch remote rows with `updated_at` newer than the watermark
 *      and apply them with INSERT OR REPLACE, but only when the remote row
 *      is strictly newer than the local copy (last-write-wins; ties keep
 *      local — the push phase already sent it, so both sides converge).
 *   3. Advance the table watermark only when both phases succeeded.
 *
 * Guarantees:
 * - Offline / not-configured / signed-out runs are no-ops with a status —
 *   local features are never blocked or broken by sync.
 * - Each table is wrapped in its own try/catch; one failing table does not
 *   stop the others. Per-table errors are collected and surfaced.
 * - A local table that does not exist yet (e.g. recurring_rules before its
 *   migration lands) is skipped, not an error.
 * - Multi-row local writes run inside a single SQLite transaction.
 * - Hard deletes on accounts/categories/budgets/recurring_rules are NOT
 *   propagated in v1 (only transactions carry deleted_at both ways).
 * - Nothing here logs row contents, credentials, or tokens.
 */
import type {SupabaseClient} from '@supabase/supabase-js';
import type {SQLiteValue} from 'react-native-nitro-sqlite';

import type {SqlDb} from '../../database/connection/types';
import {getDb} from '../../database/connection/connection';
import {queryFirst, queryRows} from '../../database/connection/helpers';
import {createSettingsRepository} from '../../database/repositories/settingsRepository';
import {getSupabaseClient} from './client';
import {
  accountToLocal,
  accountToRemote,
  budgetToLocal,
  budgetToRemote,
  categoryToLocal,
  categoryToRemote,
  recurringRuleToLocal,
  recurringRuleToRemote,
  shouldApplyRemote,
  transactionToLocal,
  transactionToRemote,
} from './syncMappers';

/** app_settings keys used by cloud sync (raw keys via settingsRepository). */
export const CLOUD_SETTINGS_KEYS = {
  /** 'true' | 'false' — run a sync automatically when the screen opens. */
  autoSync: 'cloudAutoSync',
  /** epoch ms of the last fully successful sync run (for display). */
  lastSyncAt: 'cloud_last_sync_at',
} as const;

const WATERMARK_PREFIX = 'cloud_sync_watermark_';

/** Friendly message when the remote schema has not been created yet. */
export const SCHEMA_MISSING_MESSAGE =
  'Remote tables are missing — run supabase/schema.sql in your Supabase project first.';

// ---------------------------------------------------------------------------
// Table registry
// ---------------------------------------------------------------------------

/**
 * Minimal row surface the engine needs. Config entries keep their concrete
 * mapper types; the registry erases to these via (bivariant) method syntax.
 */
type LocalSyncRow = {id: string; updated_at: number};
type RemoteSyncRow = {id: string; updated_at: number} & Record<string, unknown>;

interface SyncTableConfig {
  /** Same table name locally (SQLite) and remotely (Postgres). */
  table: string;
  /** Local column order used for INSERT OR REPLACE when applying pulls. */
  columns: readonly string[];
  toRemote(row: LocalSyncRow, userId: string): RemoteSyncRow;
  toLocal(remote: RemoteSyncRow): LocalSyncRow;
}

const TABLE_CONFIGS: readonly SyncTableConfig[] = [
  {
    table: 'accounts',
    columns: [
      'id', 'name', 'type', 'currency', 'opening_balance_minor',
      'is_default', 'is_archived', 'created_at', 'updated_at',
    ],
    toRemote: accountToRemote,
    toLocal: accountToLocal,
  },
  {
    table: 'categories',
    columns: [
      'id', 'name', 'type', 'icon', 'color',
      'is_system', 'is_archived', 'created_at', 'updated_at',
    ],
    toRemote: categoryToRemote,
    toLocal: categoryToLocal,
  },
  {
    table: 'transactions',
    columns: [
      'id', 'type', 'amount_minor', 'currency', 'account_id',
      'destination_account_id', 'category_id', 'merchant', 'note',
      'payment_method', 'occurred_at', 'created_at', 'updated_at', 'deleted_at',
    ],
    toRemote: transactionToRemote,
    toLocal: transactionToLocal,
  },
  {
    table: 'budgets',
    columns: [
      'id', 'category_id', 'limit_minor', 'currency',
      'period_start', 'period_end', 'created_at', 'updated_at',
    ],
    toRemote: budgetToRemote,
    toLocal: budgetToLocal,
  },
  {
    table: 'recurring_rules',
    columns: [
      'id', 'type', 'amount_minor', 'currency', 'account_id',
      'destination_account_id', 'category_id', 'merchant', 'note',
      'payment_method', 'frequency', 'interval_count', 'next_due_at',
      'last_confirmed_at', 'is_active', 'created_at', 'updated_at',
    ],
    toRemote: recurringRuleToRemote,
    toLocal: recurringRuleToLocal,
  },
];

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type TableSyncStatus = 'ok' | 'skipped' | 'error';

export interface TableSyncOutcome {
  table: string;
  status: TableSyncStatus;
  /** Local rows sent to the remote. */
  pushed: number;
  /** Remote rows fetched from the remote. */
  pulled: number;
  /** Pulled rows actually written locally (last-write-wins survivors). */
  applied: number;
  /** Friendly error text when status === 'error'. */
  error?: string;
}

export type SyncRunStatus = 'ok' | 'partial' | 'not_configured' | 'signed_out';

export interface SyncRunResult {
  status: SyncRunStatus;
  tables: TableSyncOutcome[];
  /** epoch ms of this run's completion when fully successful, else null. */
  syncedAt: number | null;
  /** Friendly top-level message for toasts/banners. */
  message?: string;
}

/** Injectable seams for tests; production callers use runSync() bare. */
export interface SyncDeps {
  db?: SqlDb;
  /** Pass explicit null to simulate "not configured". */
  client?: SupabaseClient | null;
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Error normalisation
// ---------------------------------------------------------------------------

interface RemoteErrorLike {
  code?: string;
  message?: string;
}

function isMissingTableError(error: RemoteErrorLike): boolean {
  const code = error.code ?? '';
  const message = error.message ?? '';
  return (
    code === '42P01' || // Postgres: undefined_table
    code === 'PGRST205' || // PostgREST: table not in schema cache
    /relation .+ does not exist/i.test(message) ||
    /could not find the table/i.test(message)
  );
}

/** Map a remote/fetch error to a short, user-safe message. */
export function describeRemoteError(error: unknown): string {
  const e = (error ?? {}) as RemoteErrorLike;
  const message = typeof e.message === 'string' ? e.message : '';
  if (isMissingTableError(e)) {
    return SCHEMA_MISSING_MESSAGE;
  }
  if (/network request failed|failed to fetch|fetch failed/i.test(message)) {
    return 'No connection — your data is safe locally; try again when online.';
  }
  if (/jwt|token expired|invalid token|unauthorized/i.test(message)) {
    return 'Session expired — sign in again.';
  }
  if (/row-level security|permission denied/i.test(message)) {
    return 'Sync blocked by database permissions — check the RLS policies in supabase/schema.sql.';
  }
  return message || 'Sync failed unexpectedly. Your local data is unaffected.';
}

// ---------------------------------------------------------------------------
// Sync engine
// ---------------------------------------------------------------------------

function insertSqlFor(config: SyncTableConfig): string {
  const placeholders = config.columns.map(() => '?').join(', ');
  return `INSERT OR REPLACE INTO ${config.table} (${config.columns.join(', ')}) VALUES (${placeholders})`;
}

function isMissingLocalTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : '');
}

async function syncTable(
  db: SqlDb,
  client: SupabaseClient,
  userId: string,
  config: SyncTableConfig,
  watermark: number,
): Promise<TableSyncOutcome> {
  // ---- Push phase (soft-deleted rows included: no deleted_at filter) ----
  const dirtyRows = await queryRows<LocalSyncRow>(
    db,
    `SELECT * FROM ${config.table} WHERE updated_at > ?`,
    [watermark],
  );
  let pushed = 0;
  if (dirtyRows.length > 0) {
    const remoteRows = dirtyRows.map(row => config.toRemote(row, userId));
    const {error} = await client
      .from(config.table)
      .upsert(remoteRows, {onConflict: 'id'});
    if (error) {
      throw error;
    }
    pushed = remoteRows.length;
  }

  // ---- Pull phase (last-write-wins apply inside one transaction) ----
  const {data, error} = await client
    .from(config.table)
    .select('*')
    .gt('updated_at', watermark);
  if (error) {
    throw error;
  }
  const pulledRows = (data ?? []) as RemoteSyncRow[];
  let applied = 0;
  if (pulledRows.length > 0) {
    const insertSql = insertSqlFor(config);
    await db.transaction(async tx => {
      for (const remote of pulledRows) {
        const local = await queryFirst<{updated_at: number}>(
          tx,
          `SELECT updated_at FROM ${config.table} WHERE id = ?`,
          [remote.id],
        );
        if (!shouldApplyRemote(local?.updated_at ?? null, remote.updated_at)) {
          continue;
        }
        const row = config.toLocal(remote) as unknown as Record<string, SQLiteValue>;
        await tx.executeAsync(
          insertSql,
          config.columns.map(column => row[column]),
        );
        applied += 1;
      }
    });
  }

  return {
    table: config.table,
    status: 'ok',
    pushed,
    pulled: pulledRows.length,
    applied,
  };
}

/**
 * Run one sync pass across all tables. Never throws — every failure mode is
 * reported in the returned result.
 */
export async function runSync(deps: SyncDeps = {}): Promise<SyncRunResult> {
  const now = deps.now ?? Date.now;
  const db = deps.db ?? getDb();
  const client =
    deps.client !== undefined ? deps.client : await getSupabaseClient();

  if (!client) {
    return {
      status: 'not_configured',
      tables: [],
      syncedAt: null,
      message: 'Cloud sync is not configured.',
    };
  }

  let userId: string | null = null;
  try {
    const {data, error} = await client.auth.getSession();
    if (!error) {
      userId = data.session?.user?.id ?? null;
    }
  } catch {
    userId = null;
  }
  if (!userId) {
    return {
      status: 'signed_out',
      tables: [],
      syncedAt: null,
      message: 'Sign in to sync.',
    };
  }

  const settings = createSettingsRepository(db);
  const tables: TableSyncOutcome[] = [];

  for (const config of TABLE_CONFIGS) {
    const watermarkRaw = await settings.getValue(WATERMARK_PREFIX + config.table);
    const watermark = watermarkRaw ? Number(watermarkRaw) : 0;
    // Captured before reading so rows edited locally mid-sync stay dirty
    // for the next run; advanced only after a fully successful table sync.
    const startedAt = now();
    try {
      tables.push(await syncTable(db, client, userId, config, watermark));
      await settings.setValue(WATERMARK_PREFIX + config.table, String(startedAt));
    } catch (error) {
      if (isMissingLocalTableError(error)) {
        // e.g. recurring_rules before its migration ships — not an error.
        tables.push({
          table: config.table,
          status: 'skipped',
          pushed: 0,
          pulled: 0,
          applied: 0,
        });
      } else {
        tables.push({
          table: config.table,
          status: 'error',
          pushed: 0,
          pulled: 0,
          applied: 0,
          error: describeRemoteError(error),
        });
      }
    }
  }

  const failed = tables.filter(t => t.status === 'error');
  if (failed.length === 0) {
    const syncedAt = now();
    await settings.setValue(CLOUD_SETTINGS_KEYS.lastSyncAt, String(syncedAt));
    return {status: 'ok', tables, syncedAt};
  }

  const schemaMissing = failed.some(t => t.error === SCHEMA_MISSING_MESSAGE);
  return {
    status: 'partial',
    tables,
    syncedAt: null,
    message: schemaMissing
      ? SCHEMA_MISSING_MESSAGE
      : `Some tables failed to sync (${failed.map(t => t.table).join(', ')}).`,
  };
}

/** Read the last fully-successful sync time (epoch ms), if any. */
export async function getLastSyncAt(db?: SqlDb): Promise<number | null> {
  const settings = createSettingsRepository(db ?? getDb());
  const raw = await settings.getValue(CLOUD_SETTINGS_KEYS.lastSyncAt);
  const value = raw ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : null;
}
