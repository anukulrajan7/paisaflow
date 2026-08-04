# PaisaFlow — AI Spending Summaries

Optional, offline-degradable AI feature. The app is fully functional without
it: aggregates are always computed locally, and any AI failure falls back to
a deterministic local summary. The AI **never calculates totals** — it only
narrates numbers computed by SQL on-device.

Code: `src/features/ai-summary/` + `src/services/openrouter/` +
`src/services/security/secureKeyStore.ts`.

## Pipeline

`generateAiInsight()` (`services/aiSummaryService.ts`):

1. **Offline check** — NetInfo; `offline` error if definitely disconnected.
2. **Key lookup** — OpenRouter key from the device keychain; `missing_key`
   error when absent.
3. **Aggregate payload** — built on-device via repositories
   (`services/aggregatePayload.ts`).
4. **Cache lookup** — payload hashed; a matching `ai_summaries` row is served
   without any API call.
5. **Provider call** — OpenRouter chat completion (30 s timeout, abortable).
6. **Zod validation** — response parsed and validated; on failure, the
   deterministic local summary is used instead (`usedFallback: true`).
7. **Persist** — result stored in `ai_summaries` keyed by input hash.

`getCachedInsightForCurrentPeriod()` loads the latest cached summary for the
current budget-cycle month without a network call (used on mount and when
`dataVersion` changes).

## Aggregate payload shape

`AiAggregatePayload` (all amounts integer minor units):

```jsonc
{
  "currency": "INR",
  "period": { "start": "ISO-8601", "end": "ISO-8601" }, // budget-cycle month
  "incomeMinor": 0,
  "expenseMinor": 0,
  "budgetMinor": null,              // overall budget limit, if set
  "previousPeriodExpenseMinor": 0,
  "topCategories": [                // up to 8, expense only
    { "name": "Groceries", "amountMinor": 0, "share": 0.42 }
  ],
  "dailyTotals": [                  // every day of the period
    { "date": "YYYY-MM-DD", "incomeMinor": 0, "expenseMinor": 0 }
  ],
  "largestTransactions": [          // up to 5, expense only
    { "amountMinor": 0, "merchant": "…", "category": "…" }
  ],
  "transactionCount": 0
}
```

Privacy rules enforced at build time:

- **Notes are never included.**
- Merchant strings are truncated to 60 chars and treated as untrusted data.
- Transfers and soft-deleted rows are excluded by the repository layer.

## Prompt contract

`services/prompt.ts`: a system prompt + one user message.

- Reply must be **strict JSON only** with exactly:
  `{"headline", "overview", "highlights", "warnings", "suggestions", "comparison"}`
- `headline` ≤ 12 words; `overview` 2–3 sentences; the arrays hold up to 3
  short items each; `comparison` references the previous period (or honestly
  states there is no data).
- The model must not invent transactions/merchants, must not restate totals
  differently ("narrate, don't recalculate"), must not give investment/tax/
  legal advice, and must be kind and non-judgmental.
- **Prompt-injection defence**: the payload JSON is fenced inside
  `<untrusted-data>…</untrusted-data>` and the system prompt instructs the
  model to treat anything inside as data, never instructions.

## Validation & fallback

`services/summarySchema.ts` validates with Zod:

- `headline` and `overview` are required non-empty strings.
- `highlights` / `warnings` / `suggestions` default to `[]` on bad input;
  `comparison` defaults to `''` (Zod `.catch()`).
- Recovery ladder: direct `JSON.parse` → strip ``` code fences → extract the
  first balanced `{…}` block (brace-aware, ignores braces inside strings).
- If all fail, `buildLocalSummary(payload)` (`services/localSummary.ts`)
  produces a deterministic summary from the same aggregates — the UI always
  has something truthful to show.

## Caching (input hash)

`services/inputHash.ts`: recursive key-sorted stable stringify → **cyrb53**
53-bit hash. Same aggregates → same hash regardless of key order. The hash is
the `ai_summaries.input_hash` cache key, so a regeneration request with
unchanged data costs zero API calls. Corrupt cache rows fall through and
regenerate.

## Error states

`ProviderError` kinds (`src/services/openrouter/types.ts`):
`offline`, `missing_key`, `invalid_key` (401/403), `insufficient_credits`
(402), `model_unavailable` (404), `rate_limited` (429), `timeout`,
`cancelled`, `invalid_response`, `unknown`. The UI (`AiInsightCard` /
`useAiInsight`) maps these to actionable states (e.g. "add your API key in
Settings").

## Key storage & privacy posture

- The OpenRouter key is stored **only** via `react-native-keychain`
  (`Android Keystore`, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`) — never in SQLite,
  AsyncStorage, or logs. Keychain errors are swallowed into generic messages.
- The provider never logs the key, request bodies, or full responses.
- Calls go **directly from the device to OpenRouter**
  (`https://openrouter.ai/api/v1/chat/completions`) with the user's own key.
  This is a deliberate MVP trade-off: users should use a low-limit key.
- Default model: `meta-llama/llama-3.1-8b-instruct`; configurable in
  Settings → AI settings.

## SummaryProvider interface (future backend proxy)

```ts
interface SummaryProvider {
  name: string;
  generateSummary(request: SummaryRequest): Promise<string>;
}
```

`generateAiInsight` accepts an injectable `provider` (used by tests). A
backend proxy can replace `createOpenRouterProvider()` without touching the
pipeline — moving keys off the device entirely is a drop-in change.
