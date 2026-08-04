# PaisaFlow — Database

SQLite via `react-native-nitro-sqlite`. Database file: `paisaflow.db`.
Single lazily-opened connection (`src/database/connection/connection.ts`)
with `PRAGMA foreign_keys = ON` enforced for every statement.

All schema is created by migrations in `src/database/migrations/`. Current
version: **4** (`001_initial.ts`, `002_detected_expenses.ts`,
`003_recurring_rules.ts`, `004_phase9_money_hub.ts`).

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

### detected_expenses (migration 002)

Staging table for SMS/paste-detected expenses — **not ledger data** until
approved. See [PHASE8.md](PHASE8.md).

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| source | TEXT NOT NULL | `sms` / `manual` |
| raw_body | TEXT NOT NULL | original alert text, local only |
| parsed_json | TEXT NOT NULL | parser output (amount, merchant, instrument, …) |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| direction | TEXT NOT NULL | `debit` / `credit` |
| merchant | TEXT | nullable |
| account_hint | TEXT | last 4 digits, nullable |
| occurred_at | INTEGER NOT NULL | epoch ms |
| category_id | TEXT → categories(id) | guessed, nullable |
| dedupe_hash | TEXT NOT NULL UNIQUE | FNV-1a of body\|amount\|direction |
| status | TEXT NOT NULL DEFAULT 'pending' | `pending` / `approved` / `dismissed` |
| transaction_id | TEXT → transactions(id) | set on approval |
| created_at / updated_at | INTEGER NOT NULL | |

### recurring_rules (migration 003)

Templates for recurring payments — confirming a due rule materializes a
real transaction; rules never affect totals. See [PHASE8.md](PHASE8.md).

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| type | TEXT NOT NULL | `expense` / `income` / `transfer` |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| currency | TEXT NOT NULL | |
| account_id | TEXT NOT NULL → accounts(id) | source account |
| destination_account_id | TEXT → accounts(id) | transfers only, else NULL |
| category_id | TEXT → categories(id) | forced NULL for transfers |
| merchant / note / payment_method | TEXT | nullable, copied onto the transaction |
| frequency | TEXT NOT NULL | `daily` / `weekly` / `monthly` / `yearly` |
| interval_count | INTEGER NOT NULL DEFAULT 1 | every N periods |
| next_due_at | INTEGER NOT NULL | epoch ms; month-end clamped via dayjs `add()` |
| last_confirmed_at | INTEGER | epoch ms, nullable |
| is_active | INTEGER NOT NULL DEFAULT 1 | paused rules never come due |
| created_at / updated_at | INTEGER NOT NULL | |

Rules are **hard-deleted**; a transfer rule into a `credit_card` account is
a card bill payment.

### people (migration 004)

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| phone | TEXT | manual entry; used by call/SMS/WhatsApp actions |
| contact_ref | TEXT | reserved (contacts sync not implemented) |
| notes | TEXT | |
| created_at / updated_at | INTEGER NOT NULL | |
| deleted_at | INTEGER | soft delete |

### ledger_entries (migration 004)

Personal lending ledger; each entry is backed by one transfer transaction.

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| person_id | TEXT NOT NULL → people(id) | |
| direction | TEXT NOT NULL | `lent` / `borrowed` |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| currency | TEXT NOT NULL | |
| account_id | TEXT NOT NULL → accounts(id) | real payment account |
| person_account_id | TEXT NOT NULL → accounts(id) | virtual `person` account |
| transaction_id | TEXT → transactions(id) | the backing transfer |
| occurred_at | INTEGER NOT NULL | epoch ms |
| expected_return_at | INTEGER | due date, nullable |
| notes | TEXT | |
| status | TEXT NOT NULL DEFAULT 'pending' | `pending` / `partial` / `completed` |
| repaid_minor | INTEGER NOT NULL DEFAULT 0 | sum of repayments |
| reminder_enabled | INTEGER NOT NULL DEFAULT 0 | |
| reminder_slot | TEXT | `morning` / `evening`, nullable |
| created_at / updated_at | INTEGER NOT NULL | |
| deleted_at | INTEGER | soft delete; reverses linked transfers |

### salary_configs (migration 004)

One active config (upserted).

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)`; expected amount |
| currency | TEXT NOT NULL | |
| account_id | TEXT NOT NULL → accounts(id) | real account |
| employer | TEXT | becomes transaction merchant |
| expected_day | INTEGER NOT NULL | 1–28 |
| reminder_time | TEXT | `HH:mm`, nullable |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at / updated_at | INTEGER NOT NULL | |

### salary_records (migration 004)

One row per config per month: `UNIQUE(config_id, period_key)`.

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| config_id | TEXT NOT NULL → salary_configs(id) | |
| period_key | TEXT NOT NULL | `YYYY-MM` |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)`; received (expected when delayed) |
| status | TEXT NOT NULL | `credited` / `partial` / `bonus` / `delayed` |
| transaction_id | TEXT → transactions(id) | income transaction; NULL for delayed |
| note | TEXT | |
| created_at / updated_at | INTEGER NOT NULL | |

### investments (migration 004)

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| type | TEXT NOT NULL | mutual_fund / stocks / fixed_deposit / recurring_deposit / ppf / gold / cryptocurrency / other |
| holding_account_id | TEXT NOT NULL → accounts(id) | virtual `investment` account |
| invested_minor | INTEGER NOT NULL DEFAULT 0 | total contributed |
| current_value_minor | INTEGER NOT NULL DEFAULT 0 | manually maintained |
| started_at | INTEGER NOT NULL | epoch ms |
| maturity_at | INTEGER | nullable |
| monthly_contribution_minor | INTEGER | nullable plan |
| reminder_day | INTEGER | 1–28, nullable |
| notes | TEXT | |
| is_active | INTEGER NOT NULL DEFAULT 1 | archiving keeps history |
| created_at / updated_at | INTEGER NOT NULL | |
| deleted_at | INTEGER | |

### investment_contributions (migration 004)

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| investment_id | TEXT NOT NULL → investments(id) | |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| transaction_id | TEXT → transactions(id) | transfer into the holding account |
| occurred_at | INTEGER NOT NULL | epoch ms |
| note | TEXT | |
| created_at | INTEGER NOT NULL | |

### savings_goals (migration 004)

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| name | TEXT NOT NULL | |
| target_minor | INTEGER NOT NULL | `CHECK(target_minor > 0)` |
| saved_minor | INTEGER NOT NULL DEFAULT 0 | advanced only by contributions |
| currency | TEXT NOT NULL | |
| target_date | INTEGER | nullable deadline |
| savings_account_id | TEXT NOT NULL → accounts(id) | a **real** account holding the money |
| contribution_amount_minor | INTEGER | planned amount, nullable |
| contribution_frequency | TEXT | `daily` / `weekly` / `monthly`, nullable |
| reminder_slot | TEXT | `morning` / `evening`, nullable |
| is_active | INTEGER NOT NULL DEFAULT 1 | |
| created_at / updated_at | INTEGER NOT NULL | |

### savings_contributions (migration 004)

One contribution per goal per period: `UNIQUE(goal_id, period_key)`.

| Column | Type | Notes |
| --- | --- | --- |
| id | TEXT PK | |
| goal_id | TEXT NOT NULL → savings_goals(id) | |
| period_key | TEXT NOT NULL | `YYYY-MM-DD` / ISO week / `YYYY-MM` by frequency |
| amount_minor | INTEGER NOT NULL | `CHECK(amount_minor > 0)` |
| transaction_id | TEXT → transactions(id) | transfer into the savings account; kept on goal delete |
| created_at | INTEGER NOT NULL | |

### app_settings

| Column | Type | Notes |
| --- | --- | --- |
| key | TEXT PK | e.g. `currency`, `theme`, `budget_cycle_start_day`, `reminder_morning`, `reminder_evening`, `ai_model`, `appLockEnabled`, `smsTrackingEnabled`, `smsAutoScanOnOpen`, `cloudAutoSync`, `cloud_last_sync_at`, `cloud_sync_watermark_<table>`, `reminder.include.<topic>` |
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
- `idx_detected_expenses_status` on detected_expenses(status)
- `idx_detected_expenses_occurred_at` on detected_expenses(occurred_at)
- `idx_recurring_rules_active_due` on recurring_rules(is_active, next_due_at)
- `idx_ledger_person` on ledger_entries(person_id)
- `idx_ledger_status_due` on ledger_entries(status, expected_return_at)
- `idx_investment_contributions_investment` on investment_contributions(investment_id)

Plus UNIQUE constraints: detected_expenses(dedupe_hash),
salary_records(config_id, period_key), savings_contributions(goal_id, period_key).

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
