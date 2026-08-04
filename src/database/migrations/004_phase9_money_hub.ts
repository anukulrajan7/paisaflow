import type {Migration} from './migrationRunner';

const STATEMENTS = [
  `CREATE TABLE people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT,
    contact_ref TEXT,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE TABLE ledger_entries (
    id TEXT PRIMARY KEY,
    person_id TEXT NOT NULL REFERENCES people(id),
    direction TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    currency TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    person_account_id TEXT NOT NULL REFERENCES accounts(id),
    transaction_id TEXT REFERENCES transactions(id),
    occurred_at INTEGER NOT NULL,
    expected_return_at INTEGER,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    repaid_minor INTEGER NOT NULL DEFAULT 0,
    reminder_enabled INTEGER NOT NULL DEFAULT 0,
    reminder_slot TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  'CREATE INDEX idx_ledger_person ON ledger_entries(person_id)',
  'CREATE INDEX idx_ledger_status_due ON ledger_entries(status, expected_return_at)',
  `CREATE TABLE salary_configs (
    id TEXT PRIMARY KEY,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    currency TEXT NOT NULL,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    employer TEXT,
    expected_day INTEGER NOT NULL,
    reminder_time TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE salary_records (
    id TEXT PRIMARY KEY,
    config_id TEXT NOT NULL REFERENCES salary_configs(id),
    period_key TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    status TEXT NOT NULL,
    transaction_id TEXT REFERENCES transactions(id),
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(config_id, period_key)
  )`,
  `CREATE TABLE investments (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    holding_account_id TEXT NOT NULL REFERENCES accounts(id),
    invested_minor INTEGER NOT NULL DEFAULT 0,
    current_value_minor INTEGER NOT NULL DEFAULT 0,
    started_at INTEGER NOT NULL,
    maturity_at INTEGER,
    monthly_contribution_minor INTEGER,
    reminder_day INTEGER,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  )`,
  `CREATE TABLE investment_contributions (
    id TEXT PRIMARY KEY,
    investment_id TEXT NOT NULL REFERENCES investments(id),
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    transaction_id TEXT REFERENCES transactions(id),
    occurred_at INTEGER NOT NULL,
    note TEXT,
    created_at INTEGER NOT NULL
  )`,
  'CREATE INDEX idx_investment_contributions_investment ON investment_contributions(investment_id)',
  `CREATE TABLE savings_goals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target_minor INTEGER NOT NULL CHECK(target_minor > 0),
    saved_minor INTEGER NOT NULL DEFAULT 0,
    currency TEXT NOT NULL,
    target_date INTEGER,
    savings_account_id TEXT NOT NULL REFERENCES accounts(id),
    contribution_amount_minor INTEGER,
    contribution_frequency TEXT,
    reminder_slot TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE savings_contributions (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL REFERENCES savings_goals(id),
    period_key TEXT NOT NULL,
    amount_minor INTEGER NOT NULL CHECK(amount_minor > 0),
    transaction_id TEXT REFERENCES transactions(id),
    created_at INTEGER NOT NULL,
    UNIQUE(goal_id, period_key)
  )`,
];

/**
 * Phase 9 money hub: salary configs/records, investments + contributions,
 * personal lending ledger (people + entries), savings goals + contributions.
 * Money movement is modeled as real transfer transactions to/from virtual
 * accounts (type 'person' / 'investment'); these tables hold the metadata
 * (statuses, due dates, reminders) and link transaction ids.
 */
export const migration004: Migration = {
  version: 4,
  name: 'phase9_money_hub',
  up: async db => {
    for (const statement of STATEMENTS) {
      await db.executeAsync(statement);
    }
  },
};
