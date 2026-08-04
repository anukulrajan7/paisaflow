-- ===========================================================================
-- PaisaFlow — optional cloud backup schema
-- ===========================================================================
-- Mirrors the local SQLite schema (src/database/migrations/001_initial.ts and
-- the recurring_rules migration) so the app can push/pull backup rows to YOUR
-- own Supabase project. Local SQLite remains the source of truth.
--
-- Conventions mirrored from the app:
--   - ids are TEXT (uuid strings generated on device)
--   - money is integer minor units (bigint * _minor columns) — never floats
--   - timestamps are epoch milliseconds (bigint)
--   - SQLite 0/1 flags are real booleans here
--   - every row belongs to a user: user_id uuid -> auth.users, enforced by RLS
--
-- This script is IDEMPOTENT: run it any number of times in the SQL editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.accounts (
  id                     text primary key,
  user_id                uuid not null references auth.users (id) on delete cascade,
  name                   text not null,
  type                   text not null,
  currency               text not null,
  opening_balance_minor  bigint not null default 0,
  is_default             boolean not null default false,
  is_archived            boolean not null default false,
  created_at             bigint not null,
  updated_at             bigint not null
);

create table if not exists public.categories (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  type         text not null,
  icon         text not null,
  color        text not null,
  is_system    boolean not null default false,
  is_archived  boolean not null default false,
  created_at   bigint not null,
  updated_at   bigint not null
);

create table if not exists public.transactions (
  id                      text primary key,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  type                    text not null,
  amount_minor            bigint not null check (amount_minor > 0),
  currency                text not null,
  account_id              text not null,
  destination_account_id  text,
  category_id             text,
  merchant                text,
  note                    text,
  payment_method          text,
  occurred_at             bigint not null,
  created_at              bigint not null,
  updated_at              bigint not null,
  deleted_at              bigint  -- soft delete; null = live row
);

create table if not exists public.budgets (
  id           text primary key,
  user_id      uuid not null references auth.users (id) on delete cascade,
  category_id  text,
  limit_minor  bigint not null check (limit_minor > 0),
  currency     text not null,
  period_start bigint not null,
  period_end   bigint not null,
  created_at   bigint not null,
  updated_at   bigint not null
);

create table if not exists public.recurring_rules (
  id                      text primary key,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  type                    text not null,
  amount_minor            bigint not null check (amount_minor > 0),
  currency                text not null,
  account_id              text not null,
  destination_account_id  text,
  category_id             text,
  merchant                text,
  note                    text,
  payment_method          text,
  frequency               text not null,
  interval_count          integer not null default 1,
  next_due_at             bigint not null,
  last_confirmed_at       bigint,
  is_active               boolean not null default true,
  created_at              bigint not null,
  updated_at              bigint not null
);

-- Note: no foreign keys BETWEEN these tables (account_id, category_id, …).
-- Referential integrity is enforced by the local database; this schema is a
-- per-user backup copy and rows can arrive in any order.

-- ---------------------------------------------------------------------------
-- Incremental sync indexes (pull filters on updated_at per user)
-- ---------------------------------------------------------------------------

create index if not exists accounts_user_updated_idx
  on public.accounts (user_id, updated_at);
create index if not exists categories_user_updated_idx
  on public.categories (user_id, updated_at);
create index if not exists transactions_user_updated_idx
  on public.transactions (user_id, updated_at);
create index if not exists budgets_user_updated_idx
  on public.budgets (user_id, updated_at);
create index if not exists recurring_rules_user_updated_idx
  on public.recurring_rules (user_id, updated_at);

-- ---------------------------------------------------------------------------
-- Row level security: every row is readable/writable only by its owner.
-- (Postgres has no CREATE POLICY IF NOT EXISTS — drop then create.)
-- ---------------------------------------------------------------------------

alter table public.accounts        enable row level security;
alter table public.categories      enable row level security;
alter table public.transactions    enable row level security;
alter table public.budgets         enable row level security;
alter table public.recurring_rules enable row level security;

-- accounts
drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select using (auth.uid() = user_id);
drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own on public.accounts
  for insert with check (auth.uid() = user_id);
drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists accounts_delete_own on public.accounts;
create policy accounts_delete_own on public.accounts
  for delete using (auth.uid() = user_id);

-- categories
drop policy if exists categories_select_own on public.categories;
create policy categories_select_own on public.categories
  for select using (auth.uid() = user_id);
drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
  for insert with check (auth.uid() = user_id);
drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
  for delete using (auth.uid() = user_id);

-- transactions
drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
  for insert with check (auth.uid() = user_id);
drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
  for delete using (auth.uid() = user_id);

-- budgets
drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
  for select using (auth.uid() = user_id);
drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
  for insert with check (auth.uid() = user_id);
drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
  for delete using (auth.uid() = user_id);

-- recurring_rules
drop policy if exists recurring_rules_select_own on public.recurring_rules;
create policy recurring_rules_select_own on public.recurring_rules
  for select using (auth.uid() = user_id);
drop policy if exists recurring_rules_insert_own on public.recurring_rules;
create policy recurring_rules_insert_own on public.recurring_rules
  for insert with check (auth.uid() = user_id);
drop policy if exists recurring_rules_update_own on public.recurring_rules;
create policy recurring_rules_update_own on public.recurring_rules
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists recurring_rules_delete_own on public.recurring_rules;
create policy recurring_rules_delete_own on public.recurring_rules
  for delete using (auth.uid() = user_id);
