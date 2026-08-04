# PaisaFlow — Architecture

Offline-first, Android-first expense tracker. React Native 0.86.2 (New
Architecture, Hermes), TypeScript strict, no Expo, no backend.

## Layering

```
Screen → feature hook/service → repository interface → SQLite repository → db
```

- **Screens** (`src/features/*/screens`) render design-system components and
  call feature hooks. They contain no SQL and no direct database access.
- **Hooks/services** (`src/features/*/hooks|services`) hold feature logic:
  data loading, mutations, form orchestration. After any write they call
  `bumpDataVersion()` to invalidate dependent queries.
- **Repository interfaces** (`src/database/repositories/interfaces.ts`)
  define the data contract per aggregate (accounts, categories, transactions,
  budgets, settings, ai_summaries). Features depend on the interface, not the
  implementation.
- **SQLite repositories** (`src/database/repositories/*.ts`) implement the
  interfaces against nitro-sqlite, mapping rows ↔ domain objects
  (`mappers.ts`). All user-controlled values are bound parameters.
- **Connection** (`src/database/connection/connection.ts`) is a lazily opened
  singleton (`paisaflow.db`) with `PRAGMA foreign_keys = ON`.

Complex read models (dashboard, insights) bypass per-row repositories and use
dedicated aggregate SQL in `src/database/queries/` — still below the feature
layer, still bound parameters.

## Feature-oriented structure

```
src/
  app/            # bootstrap, navigation (tabs + native stacks), providers
  database/       # connection, migrations, repositories, queries, seeds, types
  design-system/  # tokens, ThemeProvider, shared components, icons,
                  # illustrations (SVG spot art)
  features/<name>/{screens,components,hooks,services,schemas,types,__tests__}
  services/       # cross-feature infra: connectivity, export, notifications,
                  # openrouter, security (keychain)
  store/          # zustand UI/session stores
  utils/          # date, id (uuid), money (minor-unit formatting)
```

## State strategy

- **SQLite is the source of truth** for all persistent data. It is never
  mirrored into a client store.
- **Zustand** holds only UI/session state:
  - `themeStore` — light/dark/system preference
  - `bootstrapStore` — migration/seed/bootstrap status
  - `onboardingStore` — onboarding progress
  - `editTransactionStore` — transaction draft while editing
  - `dataVersionStore` — a monotonic counter: mutation hooks bump it after
    writes; query hooks include `dataVersion` in their effect deps and
    refetch. This is the entire invalidation mechanism — simple and explicit.
- Forms use `react-hook-form` + `zod` resolvers; schemas live in
  `features/*/schemas`.

## Design system

- Semantic tokens in `src/design-system/tokens/` (`colors.ts` light + dark,
  spacing, radius, typography). Warm neutral surfaces, one terracotta accent
  (`#B0512F` light / `#DA8A63` dark); never pure black/white.
- Components consume tokens via `ThemeProvider` — no hardcoded colors in
  screens, no screen-specific styles inside shared components.
- Spot illustrations live in `src/design-system/illustrations/` (flat SVG on a
  soft tonal disc, token colors only). They are decorative by default and
  accept an optional `accessibilityLabel`; `EmptyState` takes one via its
  `illustration` prop.
- The same tokens drive native chrome: launcher icon background
  (`ic_launcher_background`), launch window (`splash_background` =
  `#F7F3ED`).

## Key dependency choices

| Concern | Choice | Why |
| --- | --- | --- |
| Database | `react-native-nitro-sqlite` (+ `react-native-nitro-modules`) | Fast JSI SQLite, sync + async API, works on New Architecture |
| State | `zustand` | Minimal UI-state store; DB stays source of truth |
| Forms/validation | `react-hook-form` + `zod` | One schema language for forms and AI responses |
| Navigation | `@react-navigation` native-stack + bottom-tabs | Standard, per-tab stacks |
| Notifications | `@notifee/react-native` | Local scheduled triggers, channels, no server |
| Key storage | `react-native-keychain` | Android Keystore-backed secret storage |
| Charts | `react-native-svg` (+ `lucide-react-native` icons) | No native chart dependency |
| Dates | `dayjs` | Small, sufficient for period math |
| Export | `react-native-fs` + `react-native-share` | Write CSV, hand to share sheet |
| Connectivity | `@react-native-community/netinfo` | Offline detection for AI path |

## Money & data rules

- Money is integer minor units (`amount_minor`) end to end; floats are never
  used for money. Formatting happens only at the UI edge (`src/utils/money.ts`).
- Transactions are soft-deleted (`deleted_at`); queries exclude them by
  default; restore is supported.
- Transfers are a first-class transaction type but are excluded from all
  income/expense totals.
- Dev seed data exists only behind `__DEV__`; release builds ship default
  accounts/categories and zero transactions.

## Testing

Jest + `@testing-library/react-native`. Repositories and aggregate queries
are tested against a fake DB (`src/database/__tests__/fakeDb.ts`) that
implements the same executor interface; services and schemas are unit-tested;
key screens have component tests. `npm test` → 24 suites / 169 tests.
