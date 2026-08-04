# PaisaFlow — Implementation Plan

## Existing project status

- Fresh React Native Community CLI project (RN 0.86.2, React 19.2.3), scaffolded with `@react-native-community/cli@20.2.0 init PaisaFlow` and moved to repo root.
- TypeScript template, New Architecture (default in RN 0.86), Android SDK 35/36.1 + build-tools 34–36 available, Java 17 (Homebrew), Node 24.
- No pre-existing app code or configuration to preserve — template config (Metro, Babel, Gradle, tsconfig) is the baseline and must not be broken.

## Architecture decisions

- **Offline-first**: SQLite (`react-native-nitro-sqlite`) is the single source of truth for all financial data. Zustand holds only UI/session state (theme, month selection, filters, bootstrap status).
- **Money**: stored as integer minor units (`amount_minor INTEGER`). No floating point for money anywhere; formatting helpers convert minor→display only at the UI edge.
- **Layering**: Screen → feature hook/service → repository interface → SQLite repository → database. Screens never touch SQLite directly.
- **Migrations**: `schema_migrations` table; sequential migrations run at bootstrap; foreign keys enforced (`PRAGMA foreign_keys = ON`).
- **AI**: OpenRouter is optional. Deterministic aggregates are computed locally (SQL), only minimal aggregate JSON is sent, responses validated with Zod, cached in `ai_summaries` keyed by input hash. API key lives in `react-native-keychain` only.
- **Reminders**: `@notifee/react-native` local scheduled notifications (morning 8:30 / evening 20:30 defaults), stable IDs, channel created before scheduling, reschedule on time/timezone change.
- **Feature-oriented structure** under `src/` (`app/`, `design-system/`, `database/`, `features/`, `services/`, `store/`, `hooks/`, `utils/`, `types/`, `constants/`).

## Dependencies

- Navigation: `@react-navigation/native`, `native-stack`, `bottom-tabs`, `react-native-screens`, `react-native-gesture-handler`
- State/forms: `zustand`, `react-hook-form`, `@hookform/resolvers`, `zod`
- Data: `react-native-nitro-sqlite`
- Notifications: `@notifee/react-native`
- Security: `react-native-keychain`
- Connectivity: `@react-native-community/netinfo`
- Pickers/UI: `@react-native-community/datetimepicker`, `react-native-svg`, `lucide-react-native`
- Utils: `dayjs`, `uuid` (+ `react-native-get-random-values`)
- Export: `react-native-fs`, `react-native-share`
- Testing: `jest`, `@testing-library/react-native`

## Implementation phases

1. **Phase 1** — Deps, navigation shell (5 bottom tabs + nested native stacks), theme provider, design tokens, core design-system components.
2. **Phase 2** — SQLite connection, migrations (accounts, categories, transactions, tags, transaction_tags, budgets, app_settings, ai_summaries + indexes), seeds (default accounts/categories), repositories, bootstrap flow.
3. **Phase 3** — Onboarding (3 steps), accounts CRUD, categories, add/edit/soft-delete/restore transactions, transaction list (search/filter/pagination) and details.
4. **Phase 4** — Dashboard aggregates (single optimized query service), budgets (overall + category), insights (daily/weekly/monthly trends, category distribution), SVG charts.
5. **Phase 5** — Notification permission, reminder scheduling, tap→navigation handling.
6. **Phase 6** — Keychain-backed OpenRouter config, aggregate payload builder, AI service behind interface, Zod response validation, summary caching, offline/error states.
7. **Phase 7** — CSV export, tests (unit + component + integration), accessibility/performance review, Android release signing config, documentation.

After each phase: `tsc --noEmit`, `eslint`, relevant jest tests, Android build. Fix failures before moving on.

## Risks

- First Gradle build downloads a large amount (network/time).
- Notifee/Nitro SQLite autolinking on New Architecture — verify debug build early.
- Release signing requires a user-generated keystore (documented manual step); a local debug-signed release is used to prove the release build pipeline.
- AI features need a user-supplied OpenRouter key — cannot be fully verified without one; service handles missing-key state gracefully.

## Status: COMPLETE

All phases 1–7 implemented. Verified: `tsc --noEmit` clean, `eslint` clean, `jest` 24 suites / 169 tests green. Artifacts built: debug APK, signed release APK (local upload key), release AAB.

## Verification commands

- `npm run typecheck` (`tsc --noEmit`)
- `npm run lint`
- `npm test`
- `npm run android:debug-apk` → `android/app/build/outputs/apk/debug/app-debug.apk`
- `npm run android:release-apk` → `android/app/build/outputs/apk/release/app-release.apk`
- `npm run android:release-bundle` → `android/app/build/outputs/bundle/release/app-release.aab`
