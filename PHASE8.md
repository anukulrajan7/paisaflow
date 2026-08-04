# Phase 8 — Recurring payments, app lock, cloud sync, SMS auto-tracking, design updates

Phase 8 adds four feature areas and a design pass. Everything remains
offline-first: cloud sync and SMS tracking are optional layers on top of the
local SQLite database, and the app is fully functional with both turned off.

---

## Recurring payments

Code: `src/features/recurring/`, migration `src/database/migrations/003_recurring_rules.ts`.

### Data model

A recurring rule is a **template, not a transaction**. Rules never affect
totals; confirming a due rule materializes a real transaction.

`recurring_rules` (migration 003):

| Column | Notes |
| --- | --- |
| `id` | TEXT PK |
| `type` | `expense` / `income` / `transfer` |
| `amount_minor` | INTEGER, `CHECK(amount_minor > 0)` |
| `currency` | TEXT |
| `account_id` | → accounts(id); source account |
| `destination_account_id` | → accounts(id); transfers only, else NULL |
| `category_id` | → categories(id); forced NULL for transfers |
| `merchant`, `note`, `payment_method` | nullable, copied onto the transaction |
| `frequency` | `daily` / `weekly` / `monthly` / `yearly` |
| `interval_count` | INTEGER DEFAULT 1 ("every N weeks", etc.) |
| `next_due_at` | epoch ms |
| `last_confirmed_at` | epoch ms, NULL until first confirm |
| `is_active` | 1/0 — paused rules never come due |
| `created_at` / `updated_at` | epoch ms |

Index: `idx_recurring_rules_active_due ON (is_active, next_due_at)`.
Rules are **hard-deleted** (unlike transactions there is no `deleted_at`);
the delete confirmation notes that already-recorded transactions are
unaffected.

### Scheduling and month-end clamping

`services/recurringScheduler.ts` is pure — `now` is always an explicit
parameter. Next-due computation is `dayjs(from).add(interval, unit)`; the
month-end clamping is dayjs' native `add()` behavior: monthly/yearly
additions keep the day-of-month clamped to the target month's length
(Jan 31 → Feb 28/29, Feb 29 → Feb 28). Time-of-day is preserved.

Due/overdue detection:

- `listDueRules(rules, now)` — active rules with `nextDueAt <= now`, oldest
  first.
- `isOverdue(nextDueAt, now)` — true only when the due **day** has fully
  passed (`nextDueAt < startOfToday`); due today is not overdue.
- `overdueDays()` — whole calendar days between the due day and today.
- Display helpers: `frequencyLabel()` ("Every 3 days", "Monthly · 5th"),
  `describeNextDue()` ("Overdue by 3 days", "Due today", "Due tomorrow",
  "Due 5 Sep").

### One-tap confirm

`services/confirmRecurringRule.ts` — `confirmRecurringRule(ruleId)`:

1. Refuses missing or paused rules.
2. Creates a real transaction copying the rule's type, amount, currency,
   account(s), category, merchant, note and payment method, with
   `occurredAt = now` (the confirm moment, not the due date).
3. **Catch-up loop**: advances `next_due_at` period by period until it is
   strictly in the future — confirming three months late records one
   transaction and skips every missed period.
4. Stamps `last_confirmed_at`, returns `{transaction, rule, overdueDays}`;
   the caller bumps `dataVersion` to refresh the UI.

Rules are managed from **Settings → Recurring** (`RecurringRulesScreen`):
add/edit via a bottom-sheet form (type, amount, account + destination for
transfers, category, merchant, frequency + interval, first/next due date,
note), pause/resume, and delete.

### Credit-card bill tracking

There is no separate bill table. A rule whose `type` is `transfer` and whose
destination account is a `credit_card` account **is** a card bill payment
(`isCreditCardBillPayment` in `utils/ruleDisplay.ts`). The form hints
"Transfers to a credit card are tracked as card bill payments", the confirm
toast says "Card bill payment recorded", and because the confirm writes a
transfer, bill payments never count as income or expense.

### Home: RecurringDueCard

`components/RecurringDueCard.tsx` (rendered on Home directly under the
summary card, via `src/features/recurring/index.tsx`):

- Hidden entirely when nothing is due (and on any load failure).
- Header "Recurring payments · {n} due"; shows up to 3 due rules
  (`MAX_VISIBLE = 3`) with category icon, title (merchant →
  "Credit card bill payment" → category name), due text (danger color when
  overdue), amount, and a per-row **Confirm** button.
- Confirm toasts "Transaction recorded" / "Card bill payment recorded",
  appending "— N day(s) late" when overdue.
- "View all" navigates to the full rules screen.
- Refreshes on every `dataVersion` bump and on every screen focus
  (`useDueRecurringRules`).

---

## App lock

Code: `src/features/security/`, `src/services/security/applock.ts`,
`src/store/appLockStore.ts`, `src/app/bootstrap/BootstrapGate.tsx`.

### PIN storage

- The PIN (4–6 digits, validated by `/^\d+$/`) is stored **only in the
  device keychain** via `react-native-keychain`
  (`Keychain.setGenericPassword`, service `paisaflow-applock`,
  `ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY`). It is never written to
  SQLite, AsyncStorage, or logs. Verification is a keychain read plus string
  comparison — the OS keystore (Android Keystore) provides the protection;
  there is no app-level hashing, attempt limiting, or lockout.
- The on/off flag is non-sensitive and lives in `app_settings` under key
  `appLockEnabled`. `isAppLockEnabled()` **fails open** (returns false on
  error) so a broken read can never lock the user out.

### Gate behavior

`BootstrapGate` wraps the whole app:

1. Runs bootstrap (migrations, seeds, reminder sync) behind a loading state;
   failure shows an error state with retry.
2. Resolves the onboarding flag before rendering children.
3. Resolves the lock flag **before** first render of the app — a locked
   user never sees a flash of data. First-run users heading to onboarding
   are never gated.
4. The lock engages only when **both** `isAppLockEnabled()` and
   `hasAppLockPin()` are true — a wiped keychain with a stale "on" flag
   silently disables the lock rather than locking the user out. The PIN is
   demanded once per cold start (`unlockedThisSession`).
5. While locked, children stay mounted (navigation state survives) under an
   absolutely-positioned `LockScreen` overlay with accessibility content
   hidden. The hardware back button is consumed — there is deliberately no
   escape hatch, and no recovery: forgetting the PIN means reinstalling
   (the settings screen says so verbatim).

### 30-second re-lock

`AppLockGate` listens to `AppState`: it records the timestamp when the app
goes to background, and on return to active re-locks when
`elapsed >= RELOCK_AFTER_MS` (**30 000 ms**). Under 30 seconds in the
background does not re-lock.

### Settings

**Settings → App lock** (`AppLockSettingsScreen`) is a step machine:
enable (new PIN → confirm PIN), change (verify current → new → confirm),
disable (verify current → PIN deleted from keychain, flag cleared). The
screen states the re-lock rule: "PaisaFlow asks for your PIN when you open
it, and again after it has been in the background for more than 30 seconds."

---

## Cloud sync (Supabase, optional)

Code: `src/services/supabase/`, `src/features/cloud/`,
`supabase/schema.sql`, `supabase/README.md`. Screen: **Settings → Cloud
sync** (`CloudSyncScreen`).

Sync is an optional backup/multi-device layer. Without configuration the app
reports `not_configured` and stays fully functional offline.

### Auth

- Email + password only (no anonymous auth): `signInWithPassword` /
  `signUp`, with email-format and ≥6-char password validation.
- Sessions persist in AsyncStorage with auto token refresh
  (`persistSession: true`, `autoRefreshToken: true`), restored on screen
  mount; sync returns `signed_out` when there is no session.
- Email confirmation deep link: `paisaflow://auth`, wired through an
  intent-filter in `AndroidManifest.xml`.

### Config precedence

`resolveSupabaseCredentials()` (`src/services/supabase/client.ts`) resolves
in order:

1. **Runtime override** — Project URL + anon key entered in-app, stored in
   the device keychain (service `paisaflow.supabase.project`), never in the
   database or AsyncStorage.
2. **Bundled config** — `SUPABASE_URL` / `SUPABASE_ANON_KEY` from
   `src/config/supabase.ts`, which is **gitignored** (it carries the
   developer's project credentials); the committed
   `src/config/supabase.example.ts` exports empty strings.
3. Both empty → `null` → sync is `not_configured`.

The client is a lazy singleton keyed by `source:url`; saving or clearing an
override resets it.

### Built-in vs custom project UX

- **Bundled project present** (this repo ships one): the screen says sync
  "keeps a backup copy in the built-in cloud project — just create an
  account, no setup needed". The custom-project form is collapsed behind an
  "Advanced: use your own Supabase project" disclosure, with "Use this
  project" / "Remove override" actions and the warning that switching
  projects signs you out.
- **No bundled project**: the setup card ("Set up your Supabase project")
  is front and center; keys are stored only in the device keychain.
- Signed in: masked email, last-sync time, a "Sync when this screen opens"
  toggle (`app_settings` key `cloudAutoSync`), "Sync now" / "Sign out",
  and a per-table "Sync problems" card. Errors are mapped to plain language:
  missing remote tables → "run supabase/schema.sql in your Supabase project
  first", expired JWT → "Session expired — sign in again.", RLS denials →
  a permissions message.

### Watermark last-write-wins sync

`runSync()` (`src/services/supabase/syncService.ts`):

- **Scope**: `accounts`, `categories`, `transactions` (including
  `deleted_at`, so deletes propagate), `budgets`, `recurring_rules`.
- **Watermarks**: per-table `updated_at` high-water marks in `app_settings`
  (`cloud_sync_watermark_<table>`). `startedAt` is captured before reading;
  the watermark advances only after **both** phases succeed, so rows edited
  mid-sync are picked up by the next run.
- **Push**: rows with `updated_at > watermark` (soft-deleted transactions
  included) upserted with `onConflict: 'id'`; mappers inject `user_id` and
  convert SQLite 0/1 ↔ booleans.
- **Pull**: remote rows newer than the watermark are applied inside one
  SQLite transaction with `INSERT OR REPLACE` only when the remote row is
  **strictly newer** — last write wins, ties keep local (the push already
  sent the local row, so both sides converge).
- Never throws: per-table try/catch, a missing local table is `skipped`,
  run status is `ok` / `partial` / `not_configured` / `signed_out`.
- Known v1 boundary: only transactions soft-delete; hard deletes of
  accounts/categories/budgets/recurring rules do not propagate.
- Trigger: manual "Sync now" or the auto-sync-on-open toggle — only from
  the Cloud sync screen. Nothing syncs in the background.

### Server schema and the one manual step

`supabase/schema.sql` is idempotent: five tables mirroring the local ones
(`id text` PK, `user_id uuid → auth.users(id) on delete cascade`, epoch-ms
bigints, `*_minor` money, real booleans, no inter-table FKs so rows may
arrive in any order), a `(user_id, updated_at)` index per table, and **RLS
enabled on all five** with per-operation `auth.uid() = user_id` policies.

The **one manual dashboard step**: run `supabase/schema.sql` in the project's
SQL Editor (full walkthrough in `supabase/README.md`).

**Email confirmation**: Supabase's default confirmation emails point at
localhost. Either disable confirmation — dashboard → **Authentication →
Sign In / Up → Email → toggle "Confirm email" off** — or keep it and fix
**Authentication → URL Configuration**: set Site URL to `paisaflow://auth`
and add `paisaflow://auth` to Redirect URLs. The same guidance appears
in-app after sign-up when no session is returned.

---

## SMS auto-tracking

Code: `src/services/sms/`, `src/features/tracking/`, migration
`src/database/migrations/002_detected_expenses.ts`, native module
`android/app/src/main/java/com/paisaflow/sms/SmsReaderModule.kt`.

Walnut/Axio-style detection of expenses from bank/UPI SMS alerts.
**Everything is on-device** — messages are read through a tiny native
module and parsed locally; nothing is uploaded, and nothing enters the
ledger without explicit approval.

### Parser strategy (`src/services/sms/smsParser.ts`)

Bank-agnostic generic patterns covering the major Indian banks and UPI apps
(HDFC, ICICI, SBI, Axis, Kotak, Paytm, PhonePe, Google Pay style alerts):

- **Rejection**: OTP patterns are always dropped; promo/offer patterns are
  dropped unless a debit/credit verb is also present.
- **Direction**: the first match of
  `debited|credited|withdrawn|deposited|received|refunded|reversed|spent|paid|sent|purchase`
  wins; credited/deposited/received/refunded/reversed → income, the rest →
  expense. The verb's character offset is kept for amount disambiguation.
- **Amount vs. available balance**: bank alerts carry several numbers —
  transaction amount, available balance, fees. The parser finds every
  `Rs./INR/₹` amount (symbol before or after), **discards any amount whose
  preceding 30 characters match a balance context** ("Avl Bal", "available
  balance of", "Bal:", closing/ledger/current balance…), then picks the
  surviving candidate **closest in characters to the debit/credit verb**.
  If only balance amounts exist it returns null rather than guessing the
  balance as the expense. Multiple surviving candidates lower confidence to
  `low`.
- **Instrument detection** (first match wins): `credit card` →
  `credit_card`; `atm` / `cash withdrawal` → `atm` (ranked above debit
  card, since "cash withdrawal at ATM … Debit Card" is cash, not a card
  payment); `debit card` → `debit_card`; `net banking` / `imps|neft|rtgs`
  → `net_banking`; `upi` / VPA handle (`name@okhdfc`, with a lookahead so
  email addresses don't count) → `upi`; otherwise `unknown`.
- **Merchant**: five ordered patterns ("sent ₹500 to Ramesh Kumar",
  "from ACME CORP", "at/towards …", "Info: …", "to vpa …"), cleaned and
  filtered against stop-words and 4+-digit card references.
- Also extracted: account hint (last 4 digits), reference id (ref/UTR),
  occurred-at date (numeric or `dd-MMM-yyyy`, validated), and a guessed
  category from keyword rules (`guessCategoryId`).
- **Dedupe**: `computeDedupeHash` is an FNV-1a hash of
  `normalized body | amount | direction`, enforced by the
  `UNIQUE dedupe_hash` column — re-scans and repeated messages are skipped.

### Staging and the review inbox

Parsed alerts land in `detected_expenses` (migration 002) with
`status = 'pending'` — staging data, not ledger data. **Transactions →
review inbox** (`ExpenseReviewScreen`) lists pending items with merchant,
date, account hint, amount, guessed category and source chip (SMS /
Pasted):

- **Approve** creates a real transaction: expense/income from direction,
  guessed category, instrument mapped to payment method
  (`credit_card`/`debit_card` → `card`, `upi` → `upi`, `net_banking` →
  `net_banking`, `atm` → `cash`), account resolved by instrument (credit
  card instrument → the first credit-card account; otherwise default
  account), note "Auto-detected from SMS" / "Auto-detected from pasted
  text". The staged row is marked `approved` and linked to the transaction.
- **Dismiss** marks the row `dismissed`; no transaction is created.

### Scanning, paste import, settings

- A scan reads the newest 50 inbox messages (`SCAN_MESSAGE_COUNT`) through
  the native module and stages anything parseable; pull-to-refresh or the
  header icon rescans on demand.
- **Paste import** ("Paste a bank message") runs the same parser on pasted
  text with `source = 'manual'` — no SMS permission needed. This is the
  email path until Gmail OAuth exists.
- **Settings → SMS expense detection**: master toggle (requests the
  runtime permission first; denial keeps it off), permission status row
  (deep-links to system settings), and "Scan when review inbox opens"
  (default off). A privacy card states parsing is 100% on-device.

### Play policy note

`READ_SMS` is declared in the manifest with an inline comment: **Google
Play restricts SMS permissions** to default-handler/exception apps, which a
personal expense tracker does not qualify for — PaisaFlow is distributed
for personal/sideload use, not via Play. Remove the permission and the
`sms/` module if you ever target Play. When permission is denied the app
keeps working and paste import still functions.

---

## Design updates

- **Filter sheet redesign** (`TransactionsScreen`): the filter bottom sheet
  now stages edits in a draft — committed filters change only on Apply.
  While the sheet is open a debounced `countTransactions` query runs against
  the draft and the Apply button reads "Show N results". Filters: type
  segmented control (All/Expense/Income/Transfer), date-range presets
  (all/today/this week/this month/custom with from/to validation),
  category chips (searchable past a threshold, hidden for transfers), and
  account chips. Applied filters surface as removable summary chips under
  the search bar, with a dot badge on the filter icon while any are active.
- **Illustrations** (`src/design-system/illustrations/`): an SVG spot
  illustration set on a shared `IllustrationFrame` (soft tonal disc,
  decorative by default) — onboarding heroes (Welcome, Preferences,
  Reminders) and per-screen empty states (transactions, insights, budgets,
  savings, accounts, categories, people, recurring), all wired through the
  `EmptyState` component's `illustration` prop. `LockIllustration` serves
  the lock screen and app-lock settings.
- **Skeletons**: `DashboardSkeleton` (Home) and `InsightsSkeleton`
  (Insights) render pulsing placeholders matching the real card layouts
  during initial load, with `accessibilityRole="progressbar"` labels.
