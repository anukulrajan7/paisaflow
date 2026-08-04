# PaisaFlow — Database

SQLite via `react-native-nitro-sqlite`. Database file: `paisaflow.db`.
Single lazily-opened connection (`src/database/connection/connection.ts`)
with `PRAGMA foreign_keys = ON` enforced for every statement.

All schema is created by migrations in `src/database/migrations/`. Current
version: **1** (`001_initial.ts`).

## Tables

### accounts

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | uuid |
| name | TEXT NOT NULL | |
| type | TEXT NOT NULL | e.g. cash / bank |
| currency | TEXT NOT NULL | ISO code, e.g. `INR` |
| opening_balance_minor | INTEGER NOT NULL DEFAULT 0 | minor units |
| is_default | INTEGER NOT NULL DEFAULT 0 | boolean 0/1 |
| is_archived | INTEGER NOT NULL DEFAULT 0 | hidden from pickers |
| created_at / updated_at | INTEGER NOT NULL | epoch ms |

### categories

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| type | TEXT NOT NULL | `income` / `expense` |
| icon | TEXT NOT NULL | lucide icon key |
| color | TEXT NOT NULL | hex from the category palette |
| is_system | INTEGER NOT NULL DEFAULT 0 | seeded, not deletable |
| is_archived | INTEGER NOT NULL DEFAULT 0 | |
| created_at / updated_at | INTEGER NOT NULL | |

### transactions

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| type | TEXT NOT NULL | `income` / `expense` / `transfer` |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| currency | TEXT NOT NULL | |
| account_id | TEXT NOT NULL → accounts(id) | source account |
| destination_account_id | TEXT → accounts(id) | transfers only |
| category_id | TEXT → categories(id) | null for transfers |
| merchant | TEXT | nullable |
| note | TEXT | nullable; never sent to AI |
| payment_method | TEXT | nullable |
| occurred_at | INTEGER NOT NULL | epoch ms |
| created_at / updated_at | INTEGER NOT NULL | |
| deleted_at | INTEGER | soft delete; null = active |

### tags

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| name | TEXT NOT NULL UNIQUE | |
| created_at | INTEGER NOT NULL | |

### transaction_tags

| Column | Type | Notes |
| --- | --- | --- |
| transaction_id | TEXT NOT NULL → transactions(id) | composite PK |
| tag_id | TEXT NOT NULL → tags(id) | composite PK |

### budgets

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| category_id | TEXT → categories(id) | **null = overall budget** |
| limit_minor | INTEGER NOT NULL | `CHECK(limit_minor > 0)` |
| currency | TEXT NOT NULL | |
| period_start / period_end | INTEGER NOT NULL | epoch ms |
| created_at / updated_at | INTEGER NOT NULL | |

### app_settings

| Column | Type | Notes |
| --- | --- | --- |
| key | TEXT PK | e.g. `currency`, `theme`, `budget_cycle_start_day`, `reminder_morning`, `reminder_evening`, `ai_model` |
| value | TEXT NOT NULL | serialized (JSON where structured) |
| updated_at | INTEGER NOT NULL | |

### ai_summaries

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| period_type | TEXT NOT NULL | currently `monthly` |
| period_start / period_end | INTEGER NOT NULL | epoch ms |
| input_hash | TEXT NOT NULL | cyrb53 of the aggregate payload — cache key |
| model | TEXT NOT NULL | OpenRouter model id |
| summary_json | TEXT NOT NULL | validated `SummaryContent` JSON |
| created_at | INTEGER NOT NULL | |

### schema_migrations

| Column | Type | Notes |
| --- | --- | --- |
| version | INTEGER PK | monotonic migration version |
| applied_at | INTEGER NOT NULL | epoch ms |

## Indexes

- `idx_transactions_occurred_at` on transactions(occurred_at)
- `idx_transactions_account_id` on transactions(account_id)
- `idx_transactions_category_id` on transactions(category_id)
- `idx_transactions_type` on transactions(type)
- `idx_transactions_deleted_at` on transactions(deleted_at)
- `idx_budgets_period` on budgets(period_start, period_end)
- `idx_ai_summaries_period` on ai_summaries(period_type, period_start, period_end)
- `idx_ai_summaries_input_hash` on ai_summaries(input_hash)

## Migration runner semantics

`src/database/migrations/migrationRunner.ts`:

1. Creates `schema_migrations` if missing.
2. Reads applied versions; pending = registered migrations not yet applied,
   sorted ascending by `version`.
3. Each migration runs **inside its own SQL transaction** together with the
   insert into `schema_migrations` — a failure rolls both back and the
   migration is retried on next launch.
4. Returns the versions applied during the run.

Migrations are **append-only**: never edit an applied migration file; add
`00N_name.ts` with the next integer version and register it in
`src/database/migrations/index.ts`.

## Seed strategy

- `src/database/seeds/defaultData.ts` — runs in **every** build: default
  account(s) and the system category set (`is_system = 1`). Stable exported
  ids (`DEFAULT_ACCOUNT_IDS`, `SYSTEM_CATEGORY_IDS`).
- `src/database/seeds/devData.ts` — sample transactions for development,
  gated behind `__DEV__` (`DEV_SEED_ENABLED`). Release builds ship zero fake
  transactions.

## Soft deletes & transfer rules

- Deleting a transaction sets `deleted_at`; all normal queries (lists,
  totals, aggregates, AI payload) filter `deleted_at IS NULL`. Restore
  clears the column, so deletes are recoverable.
- `type = 'transfer'` moves money between `account_id` and
  `destination_account_id` and has no category. Transfers are **excluded
  from every income/expense total** — dashboard, insights, budgets, and the
  AI aggregate payload.
