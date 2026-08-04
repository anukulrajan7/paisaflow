# PaisaFlow

Offline-first, Android-first expense tracker. All financial data lives in an
on-device SQLite database; the app is fully functional without a network
connection. AI spending summaries (via OpenRouter) are an optional add-on
that never blocks core tracking.

- React Native Community CLI **0.86.2** (New Architecture, Hermes) + TypeScript (strict)
- No Expo, no Firebase; remote database optional (Supabase cloud sync)
- Money is stored as integer minor units — never floats

## Features

- Accounts (cash/bank/etc.) with opening balances, archive support
- Balances dashboard: total available, credit-card outstanding, net cash flow
- Income / expense / transfer transactions with categories, tags, merchant,
  notes, payment method; soft delete with undo and restore
- Transaction list with search, filters (draft/apply sheet with live result
  count), and pagination
- Dashboard: monthly totals, category breakdown, budget usage
- Budgets: overall + per-category, monthly cycle with configurable start day
- Insights: daily/weekly/monthly trends and category distribution (SVG charts)
- Recurring payments: due/overdue tracking, month-end clamping, one-tap
  confirm, credit-card bill tracking
- People & money: personal lending ledger with partial repayments, due dates,
  overdue tracking, and call/SMS/WhatsApp follow-ups
- Salary tracking: expected/credited/partial/bonus/delayed states with
  one-tap confirm
- Investments: holdings with contributions, manual valuation, gain/loss,
  allocation, and maturity tracking
- Savings goals: scheduled contributions with suggested amounts and progress
- Smart reminders: morning/evening notifications whose content is composed
  from your data (due lendings, salary, investments, savings, spending)
- App lock: keychain-backed PIN with 30-second background re-lock
- Optional cloud sync/backup via Supabase (built-in project or your own)
- Optional SMS expense auto-tracking with a review inbox and paste import
  (100% on-device parsing)
- Optional AI monthly summary via OpenRouter (your own API key, stored in the
  device keystore)
- CSV export of transactions
- Light/dark theme (system-aware), custom design system

## Architecture

Layered, feature-oriented — see [ARCHITECTURE.md](ARCHITECTURE.md) for the
full write-up and [DATABASE.md](DATABASE.md) for the schema.

```
Screen → feature hook/service → repository interface → SQLite repository → db
```

- **SQLite (`react-native-nitro-sqlite`) is the single source of truth** for
  persistent data. Zustand holds only UI/session state (theme, bootstrap,
  edit-draft, and a `dataVersion` counter used to invalidate query hooks
  after writes).
- **Design system first**: screens compose shared components and semantic
  tokens from `src/design-system/` — no hardcoded colors in screens.
- **AI is optional**: aggregates are computed locally with SQL; only a minimal
  aggregate JSON is sent, responses are Zod-validated, and any failure falls
  back to a deterministic local summary. See [AI_SUMMARY.md](AI_SUMMARY.md).

## Folder structure

```
src/
  app/            # App root, bootstrap, navigation, providers
  database/       # connection, migrations, repositories, queries, seeds, types
  design-system/  # tokens (light+dark), theme provider, shared components, icons
  features/       # accounts, ai-summary, budgets, categories, cloud, home,
                  # insights, investments, notifications, onboarding, people,
                  # recurring, salary, savings, security, settings, tracking,
                  # transactions
  services/       # connectivity, export (CSV), notifications, openrouter,
                  # security, sms, supabase
  store/          # zustand UI/session stores
  utils/          # date, id, money helpers
android/          # native Android project (signing, icons, manifest)
ios/              # iOS project (not actively maintained — Android-first)
scripts/          # launcher icon PNG generator (pure Python stdlib)
```

Feature code lives in `src/features/<name>/{screens,components,hooks,services,schemas,types,__tests__}`.

## Prerequisites

- **Node >= 22.11** (developed on Node 24)
- **JDK 17** (e.g. `brew install openjdk@17`)
- **Android SDK** with Platform 36, build-tools 36.0.0, NDK 27.1.12297006
  (installed via Android Studio SDK Manager)
- An Android emulator or device (minSdk 24 / Android 7.0+)

## Installation & Android environment

```sh
npm install
```

Make sure `ANDROID_HOME` points at your SDK and platform-tools are on PATH
(standard React Native CLI setup:
https://reactnative.dev/docs/set-up-your-environment). Create
`android/local.properties` with `sdk.dir=/path/to/sdk` if Gradle can't find
the SDK.

## Running

```sh
npm start           # Metro bundler (terminal 1)
npm run android     # build + install + launch debug app (terminal 2)
```

## Database & migrations

- The SQLite database (`paisaflow.db`) is opened once at bootstrap; foreign
  keys are enforced (`PRAGMA foreign_keys = ON`).
- Migrations live in `src/database/migrations/` and are **append-only** —
  never edit an applied migration; add `00N_name.ts` with the next integer
  version and register it in `src/database/migrations/index.ts`.
- The runner (`migrationRunner.ts`) applies pending migrations in ascending
  order, each inside its own transaction together with its `schema_migrations`
  row, so a failed migration rolls back cleanly and retries on next launch.
- Seeds: default accounts/categories ship with every install
  (`seeds/defaultData.ts`); sample transactions are seeded only in `__DEV__`
  builds (`seeds/devData.ts`). Release builds start with zero transactions.

## AI summaries (OpenRouter, optional)

- Configure in-app: **Settings → AI settings** — paste your OpenRouter API
  key and optionally choose a model (default
  `meta-llama/llama-3.1-8b-instruct`).
- The key is stored **only** in the device keystore via
  `react-native-keychain` (Android Keystore) — never in the database,
  AsyncStorage, or logs.
- **Client-side key warning**: the key lives on your device and calls go
  directly from the app to OpenRouter. Treat the key as a personal secret;
  use a key with a low credit limit. A future backend proxy can replace the
  provider behind the existing `SummaryProvider` interface.
- Only pre-computed aggregates (totals, category shares, largest transaction
  amounts, truncated merchant strings) are sent — never notes or full
  transaction lists. AI never calculates totals; it narrates local numbers.
  Details in [AI_SUMMARY.md](AI_SUMMARY.md).
- Requires `android.permission.INTERNET` (declared in the manifest). Without
  a key or connectivity the app shows the deterministic local summary / a
  graceful offline state.

## Cloud sync (Supabase, optional)

Quickstart:

1. Use the **built-in project** (bundled credentials in the gitignored
   `src/config/supabase.ts`) — nothing to set up, or enter **your own
   project**'s URL + anon key in **Settings → Cloud sync** (stored only in
   the device keychain).
2. For your own project, run `supabase/schema.sql` in its SQL Editor once —
   the one required manual dashboard step. Full walkthrough, RLS details,
   and the email-confirmation fix:
   [supabase/README.md](supabase/README.md).
3. Create an account / sign in, then **Sync now** (or enable "Sync when
   this screen opens").

Sync is watermark-based last-write-wins over `accounts`, `categories`,
`transactions` (soft deletes included), `budgets`, and `recurring_rules`.
It only runs from the Cloud sync screen — nothing syncs in the background,
and the app is fully functional without it. Details in
[PHASE8.md](PHASE8.md).

## App lock

Settings → App lock sets a 4–6 digit PIN stored only in the device
keychain. The app asks for it on cold start and again after more than 30
seconds in the background. There is no recovery — forgetting the PIN means
reinstalling.

## Recurring, people, salary, investments, savings

Phase 9's money hub and phase 8's recurring payments are documented in
[PHASE9.md](PHASE9.md) and [PHASE8.md](PHASE8.md) — virtual accounts,
transfer-based money movement (lending/investing/saving never counts as
income/expense), lending ledger, salary states, investment valuation,
savings-goal math, and the balances dashboard.

## Notifications

- Daily reminders via `@notifee/react-native`, scheduled as local repeating
  `TimestampTrigger`s — no server involved.
- Bodies are **composed on-device from your data** when scheduled: due and
  overdue lendings, expected/unconfirmed salary, investment contributions,
  savings-goal contributions, and today's spending — each includable topic
  has a toggle under Settings → Money reminders. Tapping a reminder
  deep-links to the relevant screen. Content reflects data as of the last
  app open/edit, not live at fire time.
- Channel `reminders` (created before scheduling), stable notification ids
  (`paisaflow-morning` / `paisaflow-evening`), cancelled and rescheduled on
  every settings sync and (debounced) after data changes.
- Defaults: morning 08:30, evening 20:30; configurable in onboarding and
  Settings.
- Android 13+: `POST_NOTIFICATIONS` is declared in the manifest and requested
  at runtime; when denied, reminders stay unscheduled and the rest of the app
  is unaffected.

## Auto-tracking (SMS, optional)

Walnut/Axio-style expense detection from bank/UPI SMS alerts.

- **On-device only.** The inbox is read via a tiny custom native module
  (`android/app/src/main/java/com/paisaflow/sms/`) and every message is parsed
  locally in `src/services/sms/smsParser.ts` (HDFC, ICICI, SBI, Axis, Kotak,
  Paytm, PhonePe, Google Pay, generic patterns). Nothing is uploaded — there
  is no server. OTPs and promotional messages are rejected by the parser.
- **Review before save.** Parsed alerts land in a pending inbox
  (`detected_expenses` table, migration 002). Open it from the inbox icon on
  the Transactions screen. Approving creates a real transaction (guessed
  category + default account); dismissing drops it. Nothing enters the ledger
  automatically.
- **Dedupe.** Each alert is hashed (`dedupe_hash`, UNIQUE); re-scans and
  repeated messages are skipped.
- **Manual import.** "Paste a bank message" in the review inbox runs the same
  parser on pasted text (source `manual`) — this is the email path until
  Gmail OAuth exists.
- **Settings.** Settings → SMS expense detection: master toggle, permission
  status, optional auto-scan when the review inbox opens (default off).
- **`READ_SMS` and Google Play policy.** Play restricts SMS permissions to
  apps whose core function requires them (default SMS/phone handlers and a
  few exceptions). A personal expense tracker does not qualify, so PaisaFlow
  is intended for **personal/sideload distribution**, not Play upload with
  this permission. The permission is requested at runtime with an explanation
  screen first; when denied, the app keeps working and manual paste still
  functions. Remove the permission and the `sms/` module if you ever target
  Play.

## Tests & checks

```sh
npm test            # jest — 53 suites, 521 tests
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

## Building APKs / AAB

### Debug APK

```sh
npm run android:debug-apk
# → android/app/build/outputs/apk/debug/app-debug.apk
```

### Signed release APK

Release builds are signed with the identity described in
`android/keystore.properties` (gitignored). If the file is missing, the
release build fails with a message pointing here.

A **local development signing identity** is already configured in this
workspace (`android/app/paisaflow-upload.keystore`, alias `paisaflow`,
password `paisaflow-upload-2026`). It is fine for sideloading and testing.

**For real Play Store publishing, generate your own keystore** (and keep it
backed up — losing it means losing the ability to update your app):

```sh
keytool -genkeypair -v \
  -keystore android/app/paisaflow-upload.keystore \
  -alias paisaflow -keyalg RSA -keysize 2048 -validity 10950 \
  -storepass <your-store-password> -keypass <your-key-password> \
  -dname "CN=Your Name, OU=Mobile, O=Your Org, L=City, ST=State, C=IN"
```

Then write `android/keystore.properties` (`storeFile` is resolved relative to
`android/app/`):

```properties
storeFile=paisaflow-upload.keystore
storePassword=<your-store-password>
keyAlias=paisaflow
keyPassword=<your-key-password>
```

Both `*.keystore` and `keystore.properties` are gitignored. Build:

```sh
npm run android:release-apk
# → android/app/build/outputs/apk/release/app-release.apk
```

### Play Store AAB

```sh
npm run android:release-bundle
# → android/app/build/outputs/bundle/release/app-release.aab
```

### R8/ProGuard

`enableProguardInReleaseBuilds` is **disabled** in `android/app/build.gradle`
— aggressive shrinking is untested with the nitro-sqlite/notifee native
modules. Enable only after a full QA pass on a minified build.

## Troubleshooting

- **Stale native build**: `npm run android:clean` then rebuild.
- **Metro serving stale bundles**: `npm start -- --reset-cache`.
- **Watchman weirdness**: `watchman watch-del-all` and restart Metro.
- **Gradle daemon stuck**: `cd android && ./gradlew --stop`.
- **nitro-modules peer note**: `react-native-nitro-sqlite` requires
  `react-native-nitro-modules` as a peer — it is pinned in `package.json`;
  if you upgrade the SQLite library, upgrade nitro-modules to the matching
  version or autolinking/JNI registration breaks at runtime.
- **Release build fails with "Missing android/keystore.properties"**: see
  "Signed release APK" above.

## Security notes

- Money is integer minor units (`amount_minor`) end to end; formatting happens
  only at the UI edge (`src/utils/money.ts`). No floats for money.
- Every user-controlled value goes through **bound SQL parameters** — no
  string concatenation into SQL.
- Transactions are **soft-deleted** (`deleted_at`); normal queries exclude
  them, so accidental deletes are recoverable.
- Transfers are excluded from all income/expense totals.
- The OpenRouter key exists only in the device keystore; API keys, transaction
  notes, and financial payloads are never logged.
- `android:allowBackup="false"` — financial data is not uploaded to cloud
  backups.

## Known MVP limitations

- Transactions carry a per-row currency but the app assumes a single default
  currency (INR) for totals — no multi-currency aggregation.
- Cloud sync is manual/optional and one-way-delete-limited: only transaction
  soft-deletes propagate; hard deletes of accounts/categories/budgets/
  recurring rules don't sync yet (see PHASE8.md).
- Reminder notification content is composed at schedule time — it reflects
  data as of the last app open/edit, not live at fire time (see PHASE9.md).
- Investment valuations are manual; there are no market-data APIs.
- AI summaries require the user's own OpenRouter key and connectivity; there
  is no bundled key or proxy.
- iOS project exists from the template but is not actively maintained.
