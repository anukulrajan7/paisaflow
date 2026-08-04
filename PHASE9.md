# Phase 9 — Money hub: people & lending, salary, investments, savings goals, smart reminders, balances

Phase 9 turns PaisaFlow from an expense tracker into a full money hub:
where money lives, who owes whom, when salary lands, what investments are
worth, and what you're saving toward — all offline, all in SQLite, all
built on one rule: **money that moves without being earned or spent is a
transfer, and transfers never touch income/expense reports.**

## Changelog

| Area | What landed | Key code |
| --- | --- | --- |
| Money model | Virtual accounts (`person`, `investment`), transfer-based money movement | `src/database/migrations/004_phase9_money_hub.ts`, `src/features/accounts/components/accountTypeMeta.ts` |
| People & lending | People, ledger entries, partial repayments, overdue tracking, contact actions, edit-reversal, undo | `src/features/people/` |
| Salary | One active salary config, monthly states, one-tap confirm, duplicate prevention | `src/features/salary/` |
| Investments | 8 investment types, holding accounts, contributions, manual valuation, gain/loss, allocation, maturities | `src/features/investments/` |
| Savings goals | Goals, scheduled contributions, period dedupe, suggested contribution math | `src/features/savings/` |
| Smart reminders | Dynamic morning/evening notification bodies composed from local data, include-toggles, deep links, reschedule-on-change | `src/services/notifications/`, `src/features/notifications/` |
| Balances dashboard | Total available, credit-card outstanding, net cash flow on the Accounts screen | `src/features/accounts/services/balancesSummary.ts` |
| Database | Migration 004 — 8 new tables, DB version 4 | `src/database/migrations/` |

---

## Money / balance model

### Virtual accounts

Migration 001's `accounts` table gains two new **types** (not a flag) in
`src/database/types/index.ts`:

```
'cash' | 'bank' | 'credit_card' | 'upi_wallet' | 'investment' | 'person'
```

`accountTypeMeta.ts` splits them:

- `USER_CREATABLE_ACCOUNT_TYPES = ['cash', 'bank', 'credit_card', 'upi_wallet']`
  — the only types offered in the account form.
- `VIRTUAL_ACCOUNT_TYPES = ['investment', 'person']` — created and managed
  by the People and Investments features, never by hand.

A virtual account is created with `is_archived = 1`, which keeps it out of
account pickers and the main Accounts list. On the Accounts screen,
non-archived virtual accounts would render in a collapsed **"Linked
records"** section (caption: "Managed by People & Investments features",
read-only rows); in practice they are archived at creation, so they appear
under the Archived section instead. Balance semantics differ per feature:

- **Person account** — one per person, created lazily on their first
  ledger entry (`ensurePersonAccount`). Balance **positive = they owe me,
  negative = I owe them**.
- **Investment holding account** — one per investment, created atomically
  with the investment row. Its balance mirrors money moved into the
  investment; the "current value" lives on the investment row itself, not
  the account.
- **Savings goals have no virtual account** — a goal points at a *real*
  account (`savings_account_id`) and contributions move real money into it.

### Transfer-based money movement

A transfer is **one row** in `transactions`: `account_id` (source) +
`destination_account_id`, `category_id = NULL`, `type = 'transfer'`. There
are no paired rows and no linked-transaction column. The balance contract
(`accountsRepository.getAccountBalance`):

```
balance = opening_balance + Σ income − Σ expense − Σ transfer-out + Σ transfer-in
```

over non-soft-deleted rows. Transfers are balance-neutral across the whole
system but move money between accounts. Every phase-9 money movement is a
single transfer row:

| Action | Transfer | Extra metadata row |
| --- | --- | --- |
| Lend | payment account → person account | `ledger_entries.transaction_id` |
| Borrow | person account → payment account | `ledger_entries.transaction_id` |
| Repayment (lent) | person account → payment account | note marker `[ledger:<entryId>]` |
| Repayment (borrowed) | payment account → person account | note marker `[ledger:<entryId>]` |
| Investment contribution | payment account → holding account | `investment_contributions.transaction_id` |
| Savings contribution | source account → goal's savings account | `savings_contributions.transaction_id` |

Salary is the one exception that *is* income: confirming a credit writes a
real `type = 'income'` transaction (category `salary`, employer as
merchant), linked from `salary_records.transaction_id`.

### Why lending/investing/saving never pollutes expense reports

The exclusion is **structural, by `type`, not by category**:

- `getMonthlyTotals` / `getDailyTotals` query `type IN ('income','expense')`;
  `getCategoryTotals` filters by a single type; dashboard aggregates use the
  same filters plus `deleted_at IS NULL`. The `PeriodTotals` type is
  documented as "EXCLUDING transfers and soft-deleted rows".
- Every lend/borrow/repayment/contribution is a `type = 'transfer'` row
  with `category_id = NULL`, so it can never enter an income/expense sum,
  budget, insight, or the AI aggregate payload.
- Virtual accounts are additionally excluded from "available money" (see
  Balances below), so money owed to you or parked in investments never
  inflates what you can spend.

---

## People & lending

Code: `src/features/people/`. Screens live in the Settings stack:
**Settings → People** (`PeopleScreen`) → per-person ledger
(`PersonLedgerScreen`).

### Data model (migration 004)

`people`: `id`, `name`, `phone`, `contact_ref` (reserved; always NULL —
no contacts sync), `notes`, `created_at`/`updated_at`, `deleted_at`
(soft delete).

`ledger_entries`: `id`, `person_id → people(id)`, `direction`
(`'lent' | 'borrowed'`), `amount_minor` (`CHECK > 0`), `currency`,
`account_id` (the real payment account), `person_account_id` (the person's
virtual account), `transaction_id` (the backing transfer), `occurred_at`,
`expected_return_at` (nullable due date), `notes`,
`status DEFAULT 'pending'`, `repaid_minor DEFAULT 0`,
`reminder_enabled DEFAULT 0`, `reminder_slot` (`'morning' | 'evening'`),
timestamps, `deleted_at`. Indexes: `(person_id)`,
`(status, expected_return_at)`.

### Entries and transfers

Adding an entry writes one real transfer (lent: payment → person account;
borrowed: person → payment account) with merchant = person's name and note
"Lent to <name>" / "Borrowed from <name>". The entry stores the transfer
id; the person account is created lazily on first use and rediscovered
afterwards from any historical entry — **including soft-deleted ones** — so
the person↔account link survives deletes. Renaming a person renames the
virtual account in the same transaction.

### Statuses, partial repayments, overdue

- Statuses: `pending` → `partial` → `completed`, computed at repayment
  time (`repaid >= amount ? 'completed' : 'partial'`); there is no way back.
- `recordRepayment(id, amount)` guards: entry active, not completed, amount
  positive and ≤ remaining (`max(amount − repaid, 0)`). It writes a
  repayment transfer through the entry's **original** payment account with
  the note marker `[ledger:<entryId>] …`, then bumps `repaid_minor` and
  status — all in one SQLite transaction. `settleEntry` is a repayment of
  the full remainder.
- **Overdue**: an entry is overdue when it is not completed, not deleted,
  has an `expected_return_at`, and that date is **strictly before local
  start-of-day** — due today is not overdue. Overdue surfaces as a danger
  banner on People, a badge on the entry card, and in reminder copy.

### Contact actions

The header phone icon and the Call / Message / WhatsApp buttons all open
one confirmation sheet — **nothing is dialled or sent until the user picks
an action**, and the OS confirms calls while messages open as drafts.
URLs: `tel:<phone>`, `sms:<phone>`, `https://wa.me/<digits-only phone>`
(needs country code). `Linking.canOpenURL` is checked first with an error
toast when no app handles the action. Phone numbers are entered manually
(optional, `+`, digits, spaces, dashes).

### Edit-reversal and undo

- **Financial fields** (direction, amount, account, date) are editable only
  while `repaid_minor = 0`; afterwards they're locked ("Amount, account and
  direction are locked once a repayment is recorded"). Editing them
  **soft-deletes the original transfer and writes a corrected one** in the
  same transaction — balance effects never double. Due date, notes and
  reminder settings stay editable any time and never touch transactions.
- **Delete** soft-deletes the entry, its original transfer, and every
  repayment transfer (found via the `[ledger:<id>]` note marker) with one
  shared `deleted_at` stamp. The **UndoBar** (6-second window) restores the
  entry and revives exactly the transactions carrying that stamp.

---

## Salary

Code: `src/features/salary/`. Screen: **Settings → Salary**.

### Config and records

`salary_configs`: one active config (`saveConfig` upserts) — `amount_minor`
(`CHECK > 0`), `currency`, `account_id` (always a real account),
`employer` (becomes the transaction merchant), `expected_day` (1–28),
`reminder_time` (`'HH:mm'`, nullable), `is_active`.

`salary_records`: one row per config per month — `config_id`,
`period_key` (`'YYYY-MM'`), `amount_minor` (received amount; the *expected*
amount when delayed), `status`, `transaction_id` (NULL for delayed),
`note`, and **`UNIQUE(config_id, period_key)`**.

### States

`SalaryState = 'expected' | 'credited' | 'partial' | 'bonus' | 'delayed'`
(`'expected'` is derived, never stored). Rules (`utils/salaryState.ts`):

- A record exists → its status wins outright.
- No record → `delayed` when today's day-of-month is **strictly greater**
  than `expected_day`; on the expected day itself the state is still
  `expected`.

### Confirm flow

"Mark as credited" is available when there's no record this month, or the
record is `delayed` with no transaction. `MarkCreditedSheet` offers a
segmented status (Full / Partial / Bonus / Delayed), an amount input
(hidden for delayed; validated: partial must be **below** expected, bonus
**above**), and a note. `confirmSalary` runs one transaction:

- `delayed` → status-only record, `transaction_id = NULL`, no money moves.
- `credited` / `partial` / `bonus` → a real **income** transaction
  (salary category, employer merchant, configured account) linked from the
  record. Upgrading a delayed record **patches the same row in place** —
  the one-row-per-month invariant holds.

### Duplicate prevention (three layers)

1. `UNIQUE(config_id, period_key)` in the schema.
2. The repository pre-checks the period and maps raced unique violations
   to `'Salary already recorded for this month'`.
3. The service refuses re-confirm of any non-delayed record; a raced
   unique violation rolls back the whole transaction, including the
   would-be orphan income row.

---

## Investments

Code: `src/features/investments/`. Screens in the Settings stack:
**Settings → Investments** → details.

### Types and model

Eight types (`INVESTMENT_TYPES`): `mutual_fund`, `stocks`,
`fixed_deposit`, `recurring_deposit`, `ppf`, `gold`, `cryptocurrency`,
`other` — each with a label, lucide icon, and a stable palette color used
in allocation bars (always paired with a text legend).

`investments`: `name`, `type`, `holding_account_id`,
`invested_minor` / `current_value_minor`, `started_at`, `maturity_at`
(nullable), `monthly_contribution_minor` + `reminder_day` (1–28, nullable
pair), `notes`, `is_active`, `deleted_at`.

`investment_contributions`: `investment_id`, `amount_minor` (`CHECK > 0`),
`transaction_id`, `occurred_at`, `note`; index on `(investment_id)`.

### Holding accounts and contributions

Each investment owns exactly one archived virtual account of type
`investment`, created atomically with the investment. An optional
`initialInvestedMinor` ("already invested before tracking") becomes the
account's opening balance and seeds both totals — **no transfer is created
for it**, and it is create-only (editing can never move totals).

`addInvestmentContribution` is an atomic three-write transaction:

1. Transfer payment account → holding account (merchant = investment name)
   — never an expense.
2. Insert the contribution row linked to the transfer.
3. Bump **both** `invested_minor` and `current_value_minor` by the amount —
   the money buys units worth what was paid; revaluation is manual.

### Manual current value, gain/loss, allocation, maturities

- **Valuation is user-typed only** — no market APIs. `UpdateValueSheet`
  (pre-seeded with the current value) writes `current_value_minor`; no
  transaction is created. Hint: "Check your broker or fund statement and
  enter the latest value."
- **Gain/loss**: `amount = current − invested`;
  `percent = amount / invested × 100` (null when invested is 0); zero
  counts as gain. Shown as a badge per investment and an overall portfolio
  figure.
- **Allocation**: `allocationByType` groups **current value** by type,
  sorted descending, zero-value types omitted; rendered as proportional
  bars with labels, amounts, percentages and counts (color is never the
  only signal). Shown when more than one type has value.
- **Maturities**: nullable `maturity_at`; `upcomingMaturities` lists
  maturities within the next **90 days** (`MATURITY_WINDOW_DAYS`), past
  ones excluded, with "N days" / "Today" countdowns.
- **Contribution reminders**: `monthly_contribution_minor` +
  `reminder_day` produce a computed next-due date shown in the UI ("Monthly
  contribution X · next due D MMM") and feed the morning reminder copy
  (below); there is no separate per-investment notification schedule.
- Archiving (`is_active = 0`) keeps all history and transfers.

---

## Savings goals

Code: `src/features/savings/`. Screens: **Settings → Savings goals** →
details.

### Model

`savings_goals`: `name`, `target_minor` (`CHECK > 0`), `saved_minor`
(only ever advanced by contributions — not editable), `currency`,
`target_date` (nullable deadline), `savings_account_id` (**a real
account** holding the goal's money), `contribution_amount_minor` +
`contribution_frequency` (`daily | weekly | monthly`, nullable plan),
`reminder_slot` (`morning | evening`), `is_active`.

`savings_contributions`: `goal_id`, `period_key`, `amount_minor`,
`transaction_id`, and **`UNIQUE(goal_id, period_key)`**.

### Contributions and period dedupe

`recordSavingsContribution` is atomic: transfer source account → the goal's
savings account (note "Savings: <goal name>" — a transfer, never an
expense), insert the contribution row, advance `saved_minor`. Source must
differ from the savings account; paused goals refuse contributions.

**One contribution per goal per period bucket**, enforced three ways:

1. The bucket key comes from the frequency: daily → `YYYY-MM-DD`, weekly →
   ISO week (`2026-W32`, Monday start), monthly → `YYYY-MM`. Unscheduled
   goals bucket **daily** — at most one ad-hoc contribution per goal per
   day.
2. A pre-check inside the transaction throws
   `DuplicateContributionError` ("Already recorded for this period").
3. The `UNIQUE(goal_id, period_key)` backstop, with raced violations mapped
   to the same error (surfaced as a toast).

### Suggested contribution math

`utils/savingsGoalMath.ts`:

- `periodsRemaining` = periods from the start of the current period to the
  start of the target's period, inclusive, **minimum 1**.
- `suggestedContributionMinor` = `ceil(remaining / periodsRemaining)` —
  an even split, shown as "about ₹X a day/week/month". Null when the goal
  is complete or has no deadline/frequency.
- `nextContributionDueAt` = start of the current period when this period
  has no contribution yet ("Due now"), else start of the next period.
- Progress = `clamp(saved / target, 0, 1)`; the bar turns success-colored
  at 100% and completing a goal toasts "Target reached — goal complete".

Deleting a goal removes its contribution rows but **keeps the transfer
transactions** — the money stays where it is.

---

## Smart reminders

Code: `src/services/notifications/` + `src/features/notifications/`.
Screen: **Settings → Money reminders** (`MoneyRemindersScreen`).

Built on `@notifee/react-native`: channel `reminders`, stable ids
`paisaflow-morning` / `paisaflow-evening`, daily-repeating timestamp
triggers. Defaults: **morning 08:30, evening 20:30** (both enabled),
stored as JSON in `app_settings` (`reminder_morning` / `reminder_evening`)
and editable in onboarding and Settings. Android 13+ requests
`POST_NOTIFICATIONS` at runtime; when denied, reminders stay unscheduled
and nothing else breaks.

### Dynamic body composition

`composeReminderBody(kind)` builds the copy from local SQLite data at
schedule time: a greeting plus up to **3 sentences** (`MAX_SENTENCES`),
each contributed section guarded by its own try/catch so a missing table
never breaks the rest.

**Morning**, in priority order:

1. `lent` — ledger entries due today (only those with `reminder_enabled`)
   and overdue counts: "₹2,000 expected from Ramesh today",
   "you owe Asha ₹500 today", "2 overdue payments to settle" → People.
2. `salary` — active config whose `expected_day` is today with no record
   this month: "your ₹60,000 salary from Acme is expected today" → Salary.
3. `investments` — active investments whose `reminder_day` is today:
   "your ₹5,000 monthly investment is due" → Investments.
4. `savings` — goals slotted `morning` with no contribution this period:
   'add ₹2,000 to your "Goa trip" goal today' → SavingsGoals.

**Evening**:

1. `lent` — repayments recorded today plus the overdue count: "Ramesh
   repaid ₹1,000 today", "you have 2 overdue personal payments" → People.
2. `salary` — expected day reached but still unconfirmed: "your ₹60,000
   salary is still unconfirmed" → Salary.
3. `savings` — goals slotted `evening` needing a contribution →
   SavingsGoals.
4. `spending` — today's expense total (transfers excluded): "you spent
   ₹1,240 today" → AddTransaction.

Recurring payments are deliberately not part of reminder copy. When nothing
applies (or composition fails), static fallback copy is used: morning
"Plan today's spending" → Home; evening "Review today's expenses" →
AddTransaction.

### Toggle keys

Each include is an `app_settings` string key; **a missing key means
enabled** — only an explicit `'false'` disables:

| Toggle | Key |
| --- | --- |
| Money lent & borrowed | `reminder.include.lent` |
| Salary | `reminder.include.salary` |
| Investments | `reminder.include.investments` |
| Savings goals | `reminder.include.savings` |
| Today's spending | `reminder.include.spending` |

Every toggle write immediately re-syncs the schedule.

### Deep-link routing

Each notification carries `data.screen`; the first contributing section
wins. Taps route via notifee press events + `navigationRef`
(`src/app/navigation/notificationNavigation.ts`), both foreground and cold
start (`getInitialNotification`): `Home` and `AddTransaction` go to their
tabs; `People`, `Salary`, `Investments`, `SavingsGoals` go to the Settings
stack. Legacy notifications without `data.screen` fall back by id (morning
→ Home, evening → AddTransaction).

### Reschedule-on-data-change

Any mutation hook bumps the shared `dataVersion` counter;
`subscribeReminderSyncToDataChanges()` re-runs
`syncRemindersFromSettings()` **debounced 2 000 ms** on every bump — the
two triggers are cancelled and recreated with freshly composed copy.
Wired at bootstrap and best-effort: a failed resync leaves the previous
schedule intact.

### Honest limitation: staleness

Copy is composed **when a reminder is scheduled, not when it fires**.
Because notifee triggers are native and the app may be closed at fire time,
notification content reflects your data **as of the last app open, sync, or
post-edit resync** — changes made while the app was closed are not
reflected until the next open. The Money reminders screen states this to
the user: "Content is computed when a reminder is scheduled and refreshed
after your data changes — it reflects your data at that moment, not live
at notification time."

---

## Balances dashboard

`src/features/accounts/services/balancesSummary.ts` +
`components/BalancesSummary.tsx`, rendered at the top of **Accounts &
Balances** when at least one real account exists.

`computeBalancesSummary(accounts, balances, monthTotals)`:

- **Skip rule**: archived accounts and virtual-account types never count.
- **Total available** = Σ balances over non-archived, non-virtual,
  non-credit-card accounts (cash, bank, UPI/wallet). Overdrafts count
  as-is (negative); credit cards never count.
- **Credit-card outstanding — sign convention**: CC spending drives the
  account balance **negative**, so outstanding is reported as a **positive
  magnitude**: Σ `max(0, −balance)` over active credit cards. An
  overpaid card (positive balance) contributes 0. Shown in danger color
  when above zero.
- **Net cash flow** = month income − month expense for the current budget
  cycle (month totals already exclude transfers), rendered with an
  explicit `+`/`-` sign, success/danger colored. Negative = overspent.

The card is captioned with the current budget-cycle period label.

---

## Known limitations & next ideas

- **Staleness of reminder content** (above) — bodies are snapshots at
  schedule time. *Next: true push-triggered refresh* (silent push or a
  background task recomposing copy near fire time).
- **Paste import is the email path** — bank-alert emails must be pasted
  manually. *Next: Gmail OAuth* to scan alert emails directly.
- **App lock is PIN-only** — raw PIN in the keychain, no attempt limiting.
  *Next: biometric unlock* (with PIN fallback).
- **Phone numbers are typed by hand** (`contact_ref` is reserved but
  unused). *Next: a contacts-picker package* to import people from the
  address book.
- **No glanceable surface outside the app.** *Next: a home-screen widget*
  for total available / today's spending.
- Cloud sync propagates only transaction soft-deletes; hard deletes of
  accounts/categories/budgets/recurring rules don't sync yet.
- Investment valuations are fully manual — no market-data APIs.
