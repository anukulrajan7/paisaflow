# Supabase cloud backup (optional)

PaisaFlow is offline-first: the on-device SQLite database is always the
source of truth. Cloud sync is an **optional** backup that mirrors your data
into **your own** Supabase project — nothing is sent anywhere by default,
and every app feature works without it.

## One-time setup (about 5 minutes)

### 1. Create a project

- Go to [supabase.com](https://supabase.com) → **New project** (the free tier
  is plenty).
- Pick any name/region and set a database password.

### 2. Create the tables + security policies

- In your project dashboard, open **SQL Editor** → **New query**.
- Paste the entire contents of [`supabase/schema.sql`](./schema.sql) from
  this repository.
- Click **Run**. The script is idempotent — you can re-run it safely.

This creates five tables (`accounts`, `categories`, `transactions`,
`budgets`, `recurring_rules`) with **row level security** enabled, so each
signed-in user can only ever read and write their own rows.

### 3. Get your Project URL and anon key

- In the dashboard go to **Project Settings** (gear icon) → **API**
  (on newer dashboards: **Settings → Data API** / **API Keys**).
- Copy:
  - **Project URL** — looks like `https://abcdefgh.supabase.co`
  - **anon public key** — a long JWT starting with `eyJ…`

### 4. Point PaisaFlow at your project

Either:

- **In the app (easiest):** Settings → Cloud sync → paste the Project URL
  and anon key → **Save project**. They are stored only in your device's
  secure keychain, never in the app database.

or:

- **Bundled at build time:** copy `src/config/supabase.example.ts` to
  `src/config/supabase.ts` and fill in both values. `supabase.ts` is
  gitignored so credentials never enter version control.

An in-app override wins over the bundled values.

### 5. Sign in and sync

- Settings → Cloud sync → **Create account** (email + password), or
  **Sign in** if you already created one.
  - If your project has email confirmation enabled (the default), confirm
    the account from the email Supabase sends, then sign in.
- Tap **Sync now**. Done — the screen shows the last sync time.

### 6. Fix the confirmation email (recommended for MVP)

Out of the box Supabase sends a confirm email whose link points at
**localhost** (the dashboard's default Site URL) — opening it on a phone
goes nowhere. Pick one of these fixes in your project dashboard:

- **Simplest — disable email confirmation (fine for an MVP/personal app):**
  1. Go to **Authentication → Sign In / Up** (older dashboards:
     **Authentication → Providers**).
  2. Open the **Email** provider section.
  3. Toggle **Confirm email** OFF and save.

  New accounts are then signed in immediately after **Create account**;
  no email step at all.

- **Or keep confirmation and make the link work:**
  1. Go to **Authentication → URL Configuration**.
  2. Set **Site URL** to `paisaflow://auth` (the app registers this deep
     link; clicking the email link confirms the account and opens the app).
  3. Under **Redirect URLs** on the same page, add `paisaflow://auth` —
     Supabase rejects `emailRedirectTo` values that are not listed here.

## How sync works (and its limits)

- Per table, the app **pushes** local rows changed since the last sync,
  then **pulls** remote rows changed since the last sync.
- Conflicts resolve **last-write-wins** on the `updated_at` timestamp;
  ties keep the local copy.
- Soft-deleted transactions sync their `deleted_at` both ways.
- Sync timestamps come from device clocks — keep them roughly correct.
- v1 does **not** propagate hard deletes of accounts, categories, budgets,
  or recurring rules (rows removed on one device may reappear on another
  after a sync). Transactions use soft deletes and are fully propagated.
- If the app says the remote tables are missing, re-run
  [`schema.sql`](./schema.sql) (step 2).

## Removing the backup

Delete the project from the Supabase dashboard, then in the app:
Settings → Cloud sync → **Sign out** (and remove the custom project if you
set one). Your local data is never touched by any of this.
