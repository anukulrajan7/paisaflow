import type {Migration} from './migrationRunner';

const STATEMENTS = [
  `CREATE TABLE detected_expenses (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    raw_body TEXT NOT NULL,
    parsed_json TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    direction TEXT NOT NULL,
    merchant TEXT,
    account_hint TEXT,
    occurred_at INTEGER NOT NULL,
    category_id TEXT REFERENCES categories(id),
    dedupe_hash TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending',
    transaction_id TEXT REFERENCES transactions(id),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  'CREATE INDEX idx_detected_expenses_status ON detected_expenses(status);',
  'CREATE INDEX idx_detected_expenses_occurred_at ON detected_expenses(occurred_at);',
];

/** 002 — review inbox for auto-detected expenses (SMS/manual import). */
export const migration002: Migration = {
  version: 2,
  name: 'detected_expenses',
  up: async db => {
    for (const statement of STATEMENTS) {
      await db.executeAsync(statement);
    }
  },
};
