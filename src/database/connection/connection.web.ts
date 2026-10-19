/**
 * Web implementation of the database connection: sql.js (SQLite compiled to
 * WebAssembly) persisted to IndexedDB.
 *
 * Same contract as the native nitro-sqlite connection (`SqlDb`): the
 * migrations, seeds, repositories and aggregate queries run unchanged. The
 * differences are all internal:
 *
 * - sql.js is synchronous and in-memory. `getDb()` returns immediately with a
 *   handle whose `executeAsync`/`transaction` await the WASM + IndexedDB load;
 *   the sync `execute` only works once the engine is ready (app code only
 *   ever calls the async variants).
 * - Persistence: after any write the whole image is exported and written to
 *   IndexedDB, debounced (400 ms). It is also flushed when the tab is hidden
 *   or unloading, so a quick close does not lose the last edit.
 * - `transaction()` calls are serialized (sql.js has one connection), matching
 *   nitro's DatabaseQueue semantics; plain statements run immediately.
 * - `PRAGMA foreign_keys = ON` is applied on open, as on native.
 */
import initSqlJs from 'sql.js';
import type {Database, SqlJsStatic, SqlValue} from 'sql.js';
import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import type {QueryResult, SQLiteValue} from 'react-native-nitro-sqlite';

import {idbGet, idbSet} from '../../platform/web/idb';
import type {SqlDb, SqlExecutor} from './types';

const DATABASE_FILE_KEY = 'paisaflow.db';
const SAVE_DEBOUNCE_MS = 400;

/** Statements that never mutate; everything else marks the image dirty. */
const READ_ONLY = /^\s*(SELECT|PRAGMA\s+\w+\s*;?\s*$|EXPLAIN|WITH)/i;

type Row = Record<string, SQLiteValue>;

function toResult(rows: Row[], rowsAffected: number): QueryResult {
  return {
    rowsAffected,
    rows: {
      _array: rows,
      length: rows.length,
      item: (index: number) => rows[index],
    },
  } as unknown as QueryResult;
}

function toSqlValue(value: SQLiteValue): SqlValue {
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
}

function fromSqlValue(value: SqlValue): SQLiteValue {
  if (value instanceof Uint8Array) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
  }
  return value as SQLiteValue;
}

class WebSqliteConnection implements SqlDb {
  private engine: Database | null = null;
  private readonly ready: Promise<Database>;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();
  private txQueue: Promise<unknown> = Promise.resolve();
  private closed = false;

  constructor() {
    this.ready = this.open();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
          void this.flush();
        }
      });
      window.addEventListener('pagehide', () => {
        void this.flush();
      });
    }
  }

  private async open(): Promise<Database> {
    const SQL: SqlJsStatic = await initSqlJs({locateFile: () => sqlWasmUrl});
    let image: Uint8Array | undefined;
    try {
      image = await idbGet<Uint8Array>('files', DATABASE_FILE_KEY);
    } catch {
      // A broken IndexedDB should not prevent the app from opening; it will
      // simply behave as a fresh install (and persistence errors surface on save).
      image = undefined;
    }
    const engine = image ? new SQL.Database(image) : new SQL.Database();
    engine.run('PRAGMA foreign_keys = ON;');
    this.engine = engine;
    return engine;
  }

  /** Resolves once the engine is usable (exposed for the bootstrap path). */
  whenReady(): Promise<void> {
    return this.ready.then(() => undefined);
  }

  private requireEngine(): Database {
    if (!this.engine) {
      throw new Error('Database is still opening — use executeAsync.');
    }
    if (this.closed) {
      throw new Error('Database connection is closed.');
    }
    return this.engine;
  }

  private run(engine: Database, sql: string, params: SQLiteValue[]): QueryResult {
    const rows: Row[] = [];
    if (params.length === 0) {
      // `exec` accepts multi-statement strings (migrations, wipes).
      const sets = engine.exec(sql);
      const last = sets[sets.length - 1];
      if (last) {
        for (const values of last.values) {
          const row: Row = {};
          last.columns.forEach((column, index) => {
            row[column] = fromSqlValue(values[index]);
          });
          rows.push(row);
        }
      }
    } else {
      const statement = engine.prepare(sql);
      try {
        statement.bind(params.map(toSqlValue));
        while (statement.step()) {
          const raw = statement.getAsObject() as Record<string, SqlValue>;
          const row: Row = {};
          for (const key of Object.keys(raw)) {
            row[key] = fromSqlValue(raw[key]);
          }
          rows.push(row);
        }
      } finally {
        statement.free();
      }
    }
    const rowsAffected = READ_ONLY.test(sql) ? 0 : engine.getRowsModified();
    if (!READ_ONLY.test(sql)) {
      this.markDirty();
    }
    return toResult(rows, rowsAffected);
  }

  execute(sql: string, params: SQLiteValue[] = []): QueryResult {
    return this.run(this.requireEngine(), sql, params);
  }

  async executeAsync(sql: string, params: SQLiteValue[] = []): Promise<QueryResult> {
    const engine = await this.ready;
    return this.run(engine, sql, params);
  }

  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const runTx = async (): Promise<T> => {
      const engine = await this.ready;
      const tx: SqlExecutor = {
        execute: (sql, params = []) => this.run(engine, sql, params),
        executeAsync: async (sql, params = []) => this.run(engine, sql, params),
      };
      engine.run('BEGIN;');
      try {
        const result = await fn(tx);
        engine.run('COMMIT;');
        this.markDirty();
        return result;
      } catch (error) {
        try {
          engine.run('ROLLBACK;');
        } catch {
          // Already rolled back (e.g. constraint failure aborted the tx).
        }
        throw error;
      }
    };
    // Serialize transactions; a failed one must not block the next.
    const next = this.txQueue.then(runTx, runTx);
    this.txQueue = next.catch(() => undefined);
    return next;
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Persist the current image to IndexedDB if anything changed. */
  flush(): Promise<void> {
    if (!this.dirty || !this.engine) {
      return this.saving;
    }
    this.dirty = false;
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const image = this.engine.export();
    // Chain saves so an older image can never overwrite a newer one.
    this.saving = this.saving
      .then(() => idbSet('files', DATABASE_FILE_KEY, image))
      .catch(() => {
        // Keep the data in memory and retry on the next write.
        this.dirty = true;
      });
    return this.saving;
  }

  async close(): Promise<void> {
    await this.flush();
    this.closed = true;
    this.engine?.close();
    this.engine = null;
  }
}

let instance: WebSqliteConnection | null = null;

/**
 * Singleton connection to the app database (web). Returned synchronously;
 * async operations wait for the WASM engine and the persisted image.
 */
export function getDb(): SqlDb {
  if (!instance) {
    instance = new WebSqliteConnection();
  }
  return instance;
}

/** Flush pending changes to IndexedDB now (used by tests/dev tooling). */
export function flushDb(): Promise<void> {
  return instance ? instance.flush() : Promise.resolve();
}

/** Close the connection and reset the singleton (dev/test hook). */
export function closeDb(): void {
  if (instance) {
    void instance.close();
    instance = null;
  }
}
