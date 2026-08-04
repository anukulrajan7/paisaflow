import type {Migration} from './migrationRunner';

const STATEMENTS = [
  `CREATE TABLE accounts (
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
  `CREATE TABLE categories (
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
  `CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    currency TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    destination_account_id TEXT REFERENCES accounts(id),
    category_id TEXT REFERENCES categories(id),
    merchant TEXT,
    note TEXT,
    payment_method TEXT,
    occurred_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );`,
  `CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id),
    tag_id TEXT NOT NULL REFERENCES tags(id),
    PRIMARY KEY(transaction_id, tag_id)
  );`,
  `CREATE TABLE budgets (
    id TEXT PRIMARY KEY,
    category_id TEXT REFERENCES categories(id),
    limit_minor INTEGER NOT NULL CHECK(limit_minor > 0),
    currency TEXT NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  `CREATE TABLE ai_summaries (
    id TEXT PRIMARY KEY,
    period_type TEXT NOT NULL,
    period_start INTEGER NOT NULL,
    period_end INTEGER NOT NULL,
    input_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    summary_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );`,
  'CREATE INDEX idx_transactions_occurred_at ON transactions(occurred_at);',
  'CREATE INDEX idx_transactions_account_id ON transactions(account_id);',
  'CREATE INDEX idx_transactions_category_id ON transactions(category_id);',
  'CREATE INDEX idx_transactions_type ON transactions(type);',
  'CREATE INDEX idx_transactions_deleted_at ON transactions(deleted_at);',
  'CREATE INDEX idx_budgets_period ON budgets(period_start, period_end);',
  'CREATE INDEX idx_ai_summaries_period ON ai_summaries(period_type, period_start, period_end);',
  'CREATE INDEX idx_ai_summaries_input_hash ON ai_summaries(input_hash);',
];

/** 001 — initial schema. Append-only: never edit; add a new migration instead. */
export const migration001: Migration = {
  version: 1,
  name: 'initial_schema',
  up: async db => {
    for (const statement of STATEMENTS) {
      await db.executeAsync(statement);
    }
  },
};
