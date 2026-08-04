/**
 * runSync tests: driven against the in-memory fakeDb and a mock Supabase
 * client (no network, no keychain, no AsyncStorage involved).
 */
import type {SupabaseClient} from '@supabase/supabase-js';

import type {FakeDb} from '../../../database/__tests__/fakeDb';
import {createFakeDb} from '../../../database/__tests__/fakeDb';
import {createSettingsRepository} from '../../../database/repositories/settingsRepository';
import {
  SCHEMA_MISSING_MESSAGE,
  describeRemoteError,
  getLastSyncAt,
  runSync,
} from '../syncService';

const USER_ID = 'user-1';

// ---------------------------------------------------------------------------
// Local schema (mirrors migrations; fakeDb enforces primary keys only)
// ---------------------------------------------------------------------------

const LOCAL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    opening_balance_minor INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    account_id TEXT NOT NULL,
    destination_account_id TEXT,
    category_id TEXT,
    merchant TEXT,
    note TEXT,
    payment_method TEXT,
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT,
    limit_minor INTEGER NOT NULL,
    currency TEXT NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
];

const RECURRING_RULES_SCHEMA = `CREATE TABLE IF NOT EXISTS recurring_rules (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL,
  account_id TEXT NOT NULL,
  destination_account_id TEXT,
  category_id TEXT,
  merchant TEXT,
  note TEXT,
  payment_method TEXT,
  frequency TEXT NOT NULL,
  interval_count INTEGER NOT NULL DEFAULT 1,
  next_due_at INTEGER NOT NULL,
  last_confirmed_at INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);`;

async function makeDb(options: {withRecurringRules?: boolean} = {}): Promise<FakeDb> {
  const db = createFakeDb();
  for (const statement of LOCAL_SCHEMA) {
    await db.executeAsync(statement);
  }
  if (options.withRecurringRules !== false) {
    await db.executeAsync(RECURRING_RULES_SCHEMA);
  }
  return db;
}

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

interface MockRemoteTable {
  /** Rows the app upserted (recorded). */
  upserted: Record<string, unknown>[];
  /** Rows the remote "contains" (returned by the pull query). */
  rows: Record<string, unknown>[];
  upsertError?: {code?: string; message?: string} | null;
  selectError?: {code?: string; message?: string} | null;
}

function makeClient(options: {
  userId?: string | null;
  tables?: Record<string, MockRemoteTable>;
}): {client: SupabaseClient; tables: Record<string, MockRemoteTable>} {
  const tables = options.tables ?? {};
  const session = options.userId
    ? {user: {id: options.userId, email: 'user@example.com'}}
    : null;
  const client = {
    auth: {
      getSession: async () => ({data: {session}, error: null}),
    },
    from: (table: string) => {
      if (!tables[table]) {
        tables[table] = {upserted: [], rows: []};
      }
      const state = tables[table];
      return {
        upsert: async (rows: Record<string, unknown>[]) => {
          state.upserted.push(...rows);
          return {error: state.upsertError ?? null};
        },
        select: () => ({
          gt: async (column: string, watermark: number) => ({
            data: state.selectError
              ? null
              : state.rows.filter(row => (row[column] as number) > watermark),
            error: state.selectError ?? null,
          }),
        }),
      };
    },
  } as unknown as SupabaseClient;
  return {client, tables};
}

// ---------------------------------------------------------------------------
// Local row fixtures
// ---------------------------------------------------------------------------

async function insertAccount(
  db: FakeDb,
  row: {id: string; name?: string; updated_at: number; is_default?: number},
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO accounts (id, name, type, currency, opening_balance_minor, is_default, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.name ?? 'Account',
      'bank',
      'INR',
      0,
      row.is_default ?? 0,
      0,
      row.updated_at,
      row.updated_at,
    ],
  );
}

async function insertTransaction(
  db: FakeDb,
  row: {
    id: string;
    updated_at: number;
    deleted_at?: number | null;
    amount_minor?: number;
    note?: string | null;
  },
): Promise<void> {
  await db.executeAsync(
    `INSERT INTO transactions (id, type, amount_minor, currency, account_id, destination_account_id, category_id, merchant, note, payment_method, occurred_at, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      'expense',
      row.amount_minor ?? 10_000,
      'INR',
      'acc-1',
      null,
      null,
      null,
      row.note ?? null,
      null,
      row.updated_at,
      row.updated_at,
      row.updated_at,
      row.deleted_at ?? null,
    ],
  );
}

const NOW = 1_000_000;
const now = () => NOW;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runSync: configuration and auth gates', () => {
  it('reports not_configured when there is no client and touches nothing', async () => {
    const db = await makeDb();
    await insertAccount(db, {id: 'acc-1', updated_at: 100});

    const result = await runSync({db, client: null, now});

    expect(result.status).toBe('not_configured');
    expect(result.tables).toEqual([]);
    expect(await getLastSyncAt(db)).toBeNull();
  });

  it('reports signed_out when there is no session', async () => {
    const db = await makeDb();
    const {client, tables} = makeClient({userId: null});

    const result = await runSync({db, client, now});

    expect(result.status).toBe('signed_out');
    expect(result.tables).toEqual([]);
    // No remote table was ever queried.
    expect(tables.accounts).toBeUndefined();
  });
});

describe('runSync: push phase', () => {
  it('pushes rows newer than the watermark with user_id, including soft deletes', async () => {
    const db = await makeDb();
    await insertAccount(db, {id: 'acc-1', updated_at: 100, is_default: 1});
    await insertTransaction(db, {id: 'txn-1', updated_at: 200, deleted_at: 300});
    const {client, tables} = makeClient({userId: USER_ID});

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    expect(tables.accounts.upserted).toHaveLength(1);
    expect(tables.accounts.upserted[0]).toMatchObject({
      id: 'acc-1',
      user_id: USER_ID,
      is_default: true,
    });
    expect(tables.transactions.upserted).toHaveLength(1);
    expect(tables.transactions.upserted[0]).toMatchObject({
      id: 'txn-1',
      user_id: USER_ID,
      deleted_at: 300,
      amount_minor: 10_000,
    });
  });

  it('skips rows at or below the per-table watermark', async () => {
    const db = await makeDb();
    await insertAccount(db, {id: 'acc-old', updated_at: 50});
    await insertAccount(db, {id: 'acc-new', updated_at: 150});
    await createSettingsRepository(db).setValue(
      'cloud_sync_watermark_accounts',
      '100',
    );
    const {client, tables} = makeClient({userId: USER_ID});

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    expect(tables.accounts.upserted.map(r => r.id)).toEqual(['acc-new']);
  });
});

describe('runSync: pull phase (last-write-wins)', () => {
  it('applies remote rows only when strictly newer than local', async () => {
    const db = await makeDb();
    await insertAccount(db, {id: 'acc-1', name: 'Local name', updated_at: 100});
    await insertTransaction(db, {id: 'txn-local-newer', updated_at: 500});
    const {client} = makeClient({
      userId: USER_ID,
      tables: {
        accounts: {
          upserted: [],
          rows: [
            // Remote newer -> applied.
            {
              id: 'acc-1',
              user_id: USER_ID,
              name: 'Remote name',
              type: 'bank',
              currency: 'INR',
              opening_balance_minor: 0,
              is_default: false,
              is_archived: false,
              created_at: 100,
              updated_at: 150,
            },
          ],
        },
        transactions: {
          upserted: [],
          rows: [
            // Local newer -> remote copy discarded.
            {
              id: 'txn-local-newer',
              user_id: USER_ID,
              type: 'expense',
              amount_minor: 99_999,
              currency: 'INR',
              account_id: 'acc-1',
              destination_account_id: null,
              category_id: null,
              merchant: null,
              note: 'stale remote edit',
              payment_method: null,
              occurred_at: 400,
              created_at: 400,
              updated_at: 400,
              deleted_at: null,
            },
            // Brand new remote row -> inserted.
            {
              id: 'txn-remote-new',
              user_id: USER_ID,
              type: 'income',
              amount_minor: 50_000,
              currency: 'INR',
              account_id: 'acc-1',
              destination_account_id: null,
              category_id: null,
              merchant: 'Employer',
              note: null,
              payment_method: null,
              occurred_at: 600,
              created_at: 600,
              updated_at: 600,
              deleted_at: null,
            },
          ],
        },
      },
    });

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    const accountsOutcome = result.tables.find(t => t.table === 'accounts');
    const transactionsOutcome = result.tables.find(t => t.table === 'transactions');
    expect(accountsOutcome).toMatchObject({pushed: 1, pulled: 1, applied: 1});
    expect(transactionsOutcome).toMatchObject({pulled: 2, applied: 1});

    const account = db.getRows('accounts').find(r => r.id === 'acc-1');
    expect(account).toMatchObject({name: 'Remote name', updated_at: 150});

    const keptLocal = db.getRows('transactions').find(r => r.id === 'txn-local-newer');
    expect(keptLocal).toMatchObject({updated_at: 500, note: null});

    const inserted = db.getRows('transactions').find(r => r.id === 'txn-remote-new');
    expect(inserted).toMatchObject({
      type: 'income',
      amount_minor: 50_000,
      merchant: 'Employer',
      deleted_at: null,
    });
    expect(inserted).not.toHaveProperty('user_id');
  });

  it('propagates a remote soft delete onto the local row', async () => {
    const db = await makeDb();
    await insertTransaction(db, {id: 'txn-1', updated_at: 100});
    const {client} = makeClient({
      userId: USER_ID,
      tables: {
        transactions: {
          upserted: [],
          rows: [
            {
              id: 'txn-1',
              user_id: USER_ID,
              type: 'expense',
              amount_minor: 10_000,
              currency: 'INR',
              account_id: 'acc-1',
              destination_account_id: null,
              category_id: null,
              merchant: null,
              note: null,
              payment_method: null,
              occurred_at: 100,
              created_at: 100,
              updated_at: 900,
              deleted_at: 900,
            },
          ],
        },
      },
    });

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    const row = db.getRows('transactions').find(r => r.id === 'txn-1');
    expect(row).toMatchObject({updated_at: 900, deleted_at: 900});
  });
});

describe('runSync: watermarks and last sync time', () => {
  it('advances per-table watermarks and last_sync_at on a clean run', async () => {
    const db = await makeDb();
    const {client} = makeClient({userId: USER_ID});

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    expect(result.syncedAt).toBe(NOW);
    const settings = createSettingsRepository(db);
    for (const table of ['accounts', 'categories', 'transactions', 'budgets', 'recurring_rules']) {
      expect(await settings.getValue(`cloud_sync_watermark_${table}`)).toBe(String(NOW));
    }
    expect(await getLastSyncAt(db)).toBe(NOW);
  });

  it('does not advance the watermark or last_sync_at for a failed table', async () => {
    const db = await makeDb();
    const {client} = makeClient({
      userId: USER_ID,
      tables: {
        budgets: {
          upserted: [],
          rows: [],
          selectError: {message: 'Network request failed'},
        },
      },
    });

    const result = await runSync({db, client, now});

    expect(result.status).toBe('partial');
    const settings = createSettingsRepository(db);
    expect(await settings.getValue('cloud_sync_watermark_budgets')).toBeNull();
    expect(await settings.getValue('cloud_sync_watermark_accounts')).toBe(String(NOW));
    expect(await getLastSyncAt(db)).toBeNull();
  });
});

describe('runSync: error handling', () => {
  it('surfaces a friendly message when the remote schema is missing', async () => {
    const db = await makeDb();
    const {client} = makeClient({
      userId: USER_ID,
      tables: {
        accounts: {
          upserted: [],
          rows: [],
          selectError: {
            code: '42P01',
            message: 'relation "public.accounts" does not exist',
          },
        },
      },
    });

    const result = await runSync({db, client, now});

    expect(result.status).toBe('partial');
    expect(result.message).toBe(SCHEMA_MISSING_MESSAGE);
    const accountsOutcome = result.tables.find(t => t.table === 'accounts');
    expect(accountsOutcome?.status).toBe('error');
    expect(accountsOutcome?.error).toBe(SCHEMA_MISSING_MESSAGE);
    // Other tables still synced fine.
    expect(
      result.tables.find(t => t.table === 'categories')?.status,
    ).toBe('ok');
  });

  it('skips a local table that does not exist yet without failing the run', async () => {
    const db = await makeDb({withRecurringRules: false});
    const {client} = makeClient({userId: USER_ID});

    const result = await runSync({db, client, now});

    expect(result.status).toBe('ok');
    const recurring = result.tables.find(t => t.table === 'recurring_rules');
    expect(recurring?.status).toBe('skipped');
  });

  it('keeps syncing other tables when one fails, mapping network errors', async () => {
    const db = await makeDb();
    await insertTransaction(db, {id: 'txn-1', updated_at: 100});
    const {client, tables} = makeClient({
      userId: USER_ID,
      tables: {
        budgets: {
          upserted: [],
          rows: [],
          upsertError: null,
          selectError: {message: 'Network request failed'},
        },
      },
    });

    const result = await runSync({db, client, now});

    expect(result.status).toBe('partial');
    expect(tables.transactions.upserted).toHaveLength(1);
    const budgets = result.tables.find(t => t.table === 'budgets');
    expect(budgets?.status).toBe('error');
    expect(budgets?.error).toMatch(/no connection/i);
  });
});

describe('describeRemoteError', () => {
  it('maps missing-table errors to the schema hint', () => {
    expect(describeRemoteError({code: '42P01'})).toBe(SCHEMA_MISSING_MESSAGE);
    expect(
      describeRemoteError({message: 'Could not find the table public.budgets'}),
    ).toBe(SCHEMA_MISSING_MESSAGE);
  });

  it('maps offline fetch failures', () => {
    expect(describeRemoteError({message: 'Network request failed'})).toMatch(
      /no connection/i,
    );
  });

  it('maps expired sessions', () => {
    expect(describeRemoteError({message: 'JWT expired'})).toMatch(/sign in again/i);
  });

  it('falls back to the raw message and never throws on junk', () => {
    expect(describeRemoteError({message: 'custom failure'})).toBe('custom failure');
    expect(describeRemoteError(null)).toMatch(/local data is unaffected/i);
    expect(describeRemoteError('boom')).toMatch(/local data is unaffected/i);
  });
});
