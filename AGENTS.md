# AGENTS.md — PaisaFlow

## Project

PaisaFlow: offline-first, Android-first expense tracker. React Native Community CLI 0.86.2 + TypeScript (strict). No Expo, no Firebase, no remote DB.

## Conventions

- **Money is integer minor units** (`amount_minor`). Never use floats for money. Format only at the UI edge via `src/utils/money.ts`.
- **SQLite is the source of truth** for persistent data; Zustand only for UI/session state. Never mirror the DB into Zustand.
- **Layering**: Screen → feature hook/service → repository interface → SQLite repository → DB. No SQL in screens. Bound parameters for every user-controlled value — never string-concatenate user input into SQL.
- **Design system first**: components use semantic tokens from `src/design-system/tokens` (light + dark). No hardcoded colors in screens; no screen-specific styles inside shared components.
- **Soft deletes**: transactions use `deleted_at`; normal queries exclude soft-deleted rows.
- **Transfers are not income/expense** — exclude from all totals.
- **No secrets in source**: OpenRouter key only via `react-native-keychain`. Never log API keys, transaction notes, or full financial payloads.
- **AI is optional**: app fully functional offline without it. AI never calculates totals — only narrates local aggregates. Validate AI responses with Zod; fall back to deterministic local summary.
- **Dev seed data only behind `__DEV__`** — release builds ship default accounts/categories and zero fake transactions.
- TypeScript strict; avoid `any` unless a third-party type forces it.

## Commands

- `npm start` — Metro
- `npm run android` — run on device/emulator
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — eslint
- `npm test` — jest
- `npm run android:debug-apk` — debug APK
- `npm run android:release-apk` — release APK (needs signing config, see README)
- `npm run android:release-bundle` — Play Store AAB
- `npm run android:clean` — gradle clean

## Structure

See `PLAN.md` (phases, risks) and `ARCHITECTURE.md`. Feature code lives in `src/features/<name>/{screens,components,hooks,services,schemas,types,__tests__}`.
