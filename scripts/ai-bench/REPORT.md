# AI categorisation benchmark — Gemini lite vs TypeSafe Jev (OpenRouter)

Question: should `src/app/api/process-emails/route.ts` (and the AI helpers in
`src/app/actions.ts`) move off `google("gemini-2.5-flash")` to TypeSafe's Jev, or to
DeepSeek V4.1 Flash, via OpenRouter?

## Method

- **Prompt**: the real `buildAIPrompt()` extracted from `route.ts` at runtime +
  `buildCategoryPromptText(DEFAULT_CATEGORIES)` — byte-identical to production.
- **Schema**: the production `transactionSchema` constraints (strict JSON Schema for
  the `response_format`, plus the same validation the Zod schema applies).
- **Dates**: scored *after* the real `resolveTransactionDate()` runs on the output.
- **Dataset**: 62 hand-labelled Indian bank alerts (HDFC / IDFC FIRST wording) in
  `dataset.ts` — 57 debits spanning all 15 categories plus 5 junk emails (credit
  alert, OTP, marketing, statement, balance update). Ambiguous merchants carry
  `altCategories`; strict accuracy uses the primary label, "any reasonable" accepts
  the alternates.
- **Protocol**: temperature 0, 3 runs per case (186 calls per model), `max_tokens`
  1024 (8192 for the thinking control). Jev paced to 1 req / 3.4 s because a
  new OpenRouter account is capped at 20 RPM on its routed upstream.
- **Cost**: OpenRouter's own `usage.cost` per call.

Reproduce:

```bash
node scripts/ai-bench/run.mjs          # BENCH_MODELS / BENCH_RUNS / BENCH_TAG
node scripts/ai-bench/report.mjs results/run-*.json
node scripts/ai-bench/details.mjs results/run-*.json
```

Post-migration checks (added when the app moved to `@openrouter/ai-sdk-provider`):

```bash
node --env-file=.env scripts/ai-bench/verify-provider.mjs   # generateObject via @/lib/ai + prod schemas
node --env-file=.env scripts/ai-bench/verify-action.mjs     # real parseExpenseText against local DB
node --env-file=.env scripts/ai-bench/compare-insights.mjs seed   # then run without `seed` per model
```

## Data handling (ZDR)

Every request sets `provider.zdr: true` and `provider.data_collection: "deny"`, so
OpenRouter only routes to endpoints that neither retain nor train on the prompt.
Verified for each model by checking the responding provider against
`https://openrouter.ai/api/v1/endpoints/zdr` (see `verify-provider.mjs`).

| Model | ZDR endpoints | Under ZDR | Notes |
|---|---|---|---|
| `deepseek/deepseek-v4.1-flash-1017` | 26 | routes fine (Decart, Wafer, …) | extraction default |
| `google/gemini-3.5-flash-lite` | 5 | routes fine (Google/Vertex) | insights default |
| `google/gemini-2.5-pro` | **0** | **fails** — "No endpoints found matching your data policy" | needs `OPENROUTER_ZDR_INSIGHTS=false` |

Same data, same period, insights prose quality (3 runs each, realistic month-over-month data):

| Insights model | Cost / generation | Latency | Empty `anomalies` | Leaked internal field names | Suggestion↔trend overlap |
|---|---|---|---|---|---|
| `deepseek/deepseek-v4.1-flash-1017` | $0.00099 | 10–15 s | 2/3 (1 phantom `{merchant:"None", amount:0}`) | 1/3 (`deltaPct`) | 10–27% |
| `google/gemini-3.5-flash-lite` | $0.00135 | 1.8–2.4 s | 3/3 | 0/3 | 0–7% |
| `google/gemini-2.5-pro` (no ZDR) | $0.02259 | ~20 s | 3/3 | 0/3 | low |

Insights volume is tiny (a handful per month), so the 27% price gap between DeepSeek
and flash-lite is ~1¢/month — not worth the phantom-anomaly and latency regressions.
DeepSeek stays the extraction model, where volume is 100x higher and its structured
output is best-in-class.

## Results (3 runs × 62 cases per model)

| Model | Calls | Cat (strict) | Cat (any reasonable) | Subcategory exact | Junk detected | Pipeline failures | p50 ms | p95 ms | USD / 1000 emails |
|---|---|---|---|---|---|---|---|---|---|
| **DeepSeek V4.1 Flash 1017** | 186 | 99.4% | 100.0% | **97.4%** | 100% | 15 | **595** | **1034** | **$0.14** |
| DeepSeek V4.1 Flash (non-dated alias) | 186 | 98.2% | 100.0% | 96.1% | 100% | 15 | 284 | 628 | $0.20 |
| Jev Router | 186 | 100.0% | 100.0% | 94.1% | 100% | 15 | 2503 | 4031 | $5.65 |
| Gemini 3.5 Flash Lite | 186 | 97.7% | 100.0% | 95.4% | 100% | 15 | 948 | 1652 | $0.61 |
| Gemini 3.1 Flash Lite | 186 | 96.5% | 100.0% | 96.1% | 100% | 15 | 958 | 1755 | $0.46 |
| Gemini 2.5 Flash Lite | 186 | 87.7% | 96.5% | 82.4% | 100% | 15 | 884 | 1043 | $0.08 |
| Gemini 2.5 Flash (current prod) | 186 | 87.7% | 98.2% | 88.9% | 100% | 15 | 999 | 1696 | $0.28 |
| Gemini 3.5 Flash (control) | 186 | 100.0% | 100.0% | 97.4% | 100% | 15 | 3070 | 13486 | $8.31 |

Field accuracy (amount, merchant, `is_cc_payment`, resolved date) was 100% for every
model; all dates came back as ISO-8601.

### Where the models actually differ

| Case | Jev Router | Gemini 3.5 Flash Lite | Gemini 2.5 Flash (prod) |
|---|---|---|---|
| `CULTFIT` gym | Health & Fitness / Gym | Health & Fitness / Gym | Health & Fitness / Gym |
| `DECATHLON SPORTS` | Health & Fitness / Sports | Shopping / Personal Care | Shopping / Sports |
| `AMAZON KINDLE BOOKS` | Education / Books | Education / Books (+1 run Entertainment / Streaming) | Shopping / Books |
| `LICIOUS` | Groceries / Meat | Groceries / Meat | **Transfer / Self** (3/3 runs) |
| `ZEPTO` | Groceries / Supermarket | Groceries / Supermarket | **Food & Dining / Delivery** |
| `VPA arjun.mehta` | Transfer / *null* | Transfer / Friends | Transfer / Friends |
| `GROWW` | Savings & Investments / *null* | Savings & Investments / Mutual Funds | Savings & Investments / Equity |

### Cost and routing behaviour of Jev Router

- 186 calls routed to: `openai/gpt-6-astra` (183), `openai/gpt-6-luna` (2),
  `google/gemini-4-argon` (1).
- Cost per call varied 80× ($0.00019 → $0.01669, median $0.00405) because the
  routing target changes per request — the $5.65 / 1000 figure is an average, not a
  cap. `jev-router` is listed with `pricing: -1` on OpenRouter for this reason.
- At concurrency 4 the account hit `429 new-account-rpm ... gpt-6-astra` and needed
  backoff; serial pacing fixed it (prod cron is sequential, so it is mostly a
  problem for bulk/re-import flows, not the daily run).
- `~typesafe/jev-latest` is a separate "decisions" model that only speaks to
  `/api/alpha/decisions` — not a drop-in for `generateObject` / `/chat/completions`.

### DeepSeek V4.1 Flash notes

- `deepseek/deepseek-v4.1-flash-1017` ($0.15/M in, $0.60/M out) routed 186/186 calls to
  one provider (InferenceNet), zero retries, zero 429s at concurrency 4.
- 99.4% strict / 100% "any reasonable", best subcategory exactness of the field
  (97.4%, tied with Gemini 3.5 Flash). Only miss: `LICIOUS` → Food & Dining / Delivery
  on 1 of 3 runs (otherwise Groceries / Meat); `AL TAZEEM SHAWARMA` → Restaurants
  rather than Street Food.
- Measured cost is *below* list price because 182/186 calls hit automatic prompt
  caching on the identical ~1 KB system prompt (≈944 cached tokens/call). No Gemini
  call through OpenRouter reported cached tokens.
- It is a reasoning model (mean 162 reasoning tokens), so `max_tokens` must be ≥ 4k —
  at 1024 the answer gets truncated (same trap as Gemini 3.5 Flash).
- The non-dated alias `deepseek/deepseek-v4.1-flash` is 2× the price, faster
  (p50 284 ms) and slightly less accurate; it also fans out across 4 providers.

### Shared failure that predates this comparison

Every model (Jev included) answers junk emails with `amount: 0` + `confidence_score: 0`.
`transactionSchema` declares `amount: z.number().positive()`, so that response fails
validation and `generateObject` throws instead of returning the skip signal. Same 15
failures for every model → it is an app bug, not a model differentiator. Fix by making
`amount` non-negative (or nullable) and relying on `confidence_score === 0` for skips.

## Verdict
Jev Router is not worth the switch: its 100% strict score is matched by any frontier
model, it costs ~40× DeepSeek V4.1 Flash 1017, has ~4× the latency, and sits behind a
router whose upstream model and price change per request.

**DeepSeek V4.1 Flash 1017 is the best option tested.** It beats Gemini 3.5 Flash Lite
on every axis that matters here — accuracy (99.4% vs 97.7%), subcategory exactness
(97.4% vs 95.4%), latency (595 ms vs 948 ms p50) — at one quarter of the cost
($0.14 vs $0.61 per 1000 emails), and it is ~2× cheaper than today's
`gemini-2.5-flash` while being +11.7 points more accurate.

Migration: swap the three `google("gemini-2.5-flash")` calls
(`api/process-emails/route.ts:314`, `actions.ts:1087`, `actions.ts:1168`) for the
OpenRouter provider (`@openrouter/ai-sdk-provider`, `openrouter("deepseek/deepseek-v4.1-flash-1017")`)
and add `OPENROUTER_API_KEY`. Keep `max_tokens` ≥ 4096.

Second choice if the extra third party is unwelcome: `gemini-3.5-flash-lite` — same
accuracy band, no new vendor.

## Caveats

- 62 synthetic-but-realistic cases; a real inbox will have merchants not covered here.
- Single labeller (this benchmark), one taxonomy snapshot; labels for genuinely
  ambiguous merchants (Decathlon, IRCTC, Kindle) are judgements.
- Router behaviour and pricing are a moving target; numbers are from one day of traffic.
- Jev was measured through its OpenRouter chat-completions path only.
