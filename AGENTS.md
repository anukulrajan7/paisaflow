# AGENTS.md — PaisaFlow

## Project

PaisaFlow: offline-first, Android-first expense tracker. React Native Community CLI 0.86.2 + TypeScript (strict). No Expo, no Firebase; remote DB optional (Supabase cloud sync — app fully functional without it).

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
- `npm run web:dev` / `web:build` / `web:preview` — web target (Vite + react-native-web; output `dist/web`)
- `npm run typecheck:web` — typecheck the `*.web.ts(x)` shims with DOM types

## Web target

Same codebase, built with Vite (`vite.config.mts`, root `web/`). Landing page at `/` (static `web/index.html`), app at `/app/` (`web/app/main.tsx`). Platform code lives in `*.web.ts(x)` siblings that shadow native modules (Metro convention): sql.js + IndexedDB for the database (`connection.web.ts`), AES-GCM/IndexedDB for secrets, Notification API for reminders, Blob download for CSV. `src/platform` exposes capability flags (`isWeb`, `supportsSmsInbox`, `supportsCloudSync`, …) that screens use to hide or re-word native-only entry points. Cloud sync and the bundled Supabase config are never included in the web bundle (`src/config/index.web.ts`). Container: `Dockerfile.web` + `docker-compose.web.yml` (nginx, port 127.0.0.1:18110).

## Structure

See `PLAN.md` (phases, risks) and `ARCHITECTURE.md`. Feature code lives in `src/features/<name>/{screens,components,hooks,services,schemas,types,__tests__}`.

Features: `accounts`, `ai-summary`, `budgets`, `categories`, `cloud`, `home`, `insights`, `investments`, `notifications`, `onboarding`, `people`, `recurring`, `salary`, `savings`, `security`, `settings`, `tracking`, `transactions`.

Services (`src/services/`): `connectivity`, `export`, `notifications`, `openrouter`, `security`, `sms`, `supabase`. Platform flags: `src/platform`.

- Phase docs: `PHASE8.md` (recurring, app lock, cloud sync, SMS tracking), `PHASE9.md` (money hub: people/lending, salary, investments, savings, smart reminders, balances).
- `src/config/supabase.ts` is **gitignored** — it carries the developer's bundled Supabase credentials. Never commit it; the committed `src/config/supabase.example.ts` (empty strings) is the fallback.
