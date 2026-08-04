import type {Migration} from './migrationRunner';

const STATEMENTS = [
  `CREATE TABLE recurring_rules (
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
    frequency TEXT NOT NULL,
    interval_count INTEGER NOT NULL DEFAULT 1,
    next_due_at INTEGER NOT NULL,
    last_confirmed_at INTEGER,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );`,
  'CREATE INDEX idx_recurring_rules_active_due ON recurring_rules(is_active, next_due_at);',
];

/**
 * 003 — recurring payment rules. type is 'expense' | 'income' | 'transfer'
 * (a transfer into a credit_card account is a card bill payment); frequency is
 * 'daily' | 'weekly' | 'monthly' | 'yearly'. Confirming a rule materializes a
 * real transaction — rules themselves never affect totals.
 */
export const migration003: Migration = {
  version: 3,
  name: 'recurring_rules',
  up: async db => {
    for (const statement of STATEMENTS) {
      await db.executeAsync(statement);
    }
  },
};
