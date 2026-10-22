/**
 * Model IDs for every AI call in the app.
 *
 * Kept free of provider imports so client components can render the model name
 * (see `@/lib/insights-config`) without pulling the OpenRouter SDK into the
 * browser bundle.
 *
 * Override per deploy with OPENROUTER_MODEL_EXTRACTION / OPENROUTER_MODEL_INSIGHTS.
 * Defaults were picked from scripts/ai-bench (see scripts/ai-bench/REPORT.md):
 * DeepSeek V4.1 Flash 1017 scored 99.4% category / 97.4% subcategory exactness at
 * ~$0.14 per 1000 emails — better than Gemini 3.5 Flash Lite and ~40x cheaper
 * than the Jev router.
 *
 * Both defaults must have Zero-Data-Retention endpoints on OpenRouter while
 * `AI_PRIVACY.zdr` is on. `google/gemini-2.5-pro` has none, so it cannot be used
 * for insights unless ZDR is relaxed (OPENROUTER_ZDR_INSIGHTS=false).
 */
export const AI_MODELS = {
  /** Bank-alert email extraction, pasted-text parsing, XLSX import rows. */
  extraction:
    process.env.OPENROUTER_MODEL_EXTRACTION ??
    "deepseek/deepseek-v4.1-flash-1017",
  /** Analytics insights (prose over pre-computed stats). */
  insights:
    process.env.OPENROUTER_MODEL_INSIGHTS ??
    "google/gemini-3.5-flash-lite",
} as const;

export type AiModelKind = keyof typeof AI_MODELS;

/**
 * Privacy policy sent with every request.
 *
 * - zdr: only route to endpoints with a Zero Data Retention policy — the upstream
 *   provider does not store the prompt or completion.
 * - data_collection: "deny" — skip endpoints that may train on the data.
 *
 * These are OR'd with the account-level privacy settings at
 * https://openrouter.ai/settings/privacy, so a request can only get stricter.
 *
 * ZDR can be relaxed per task. Insights only ever send pre-computed aggregates
 * (category totals, merchant names, amounts) — never raw email bodies — and no
 * Gemini model has a ZDR endpoint, so OPENROUTER_ZDR_INSIGHTS=false is the escape
 * hatch for using one there.
 */
const policy = (zdrEnv: string | undefined) => ({
  zdr: zdrEnv !== "false",
  dataCollectionDeny: process.env.OPENROUTER_DENY_DATA_COLLECTION !== "false",
});

export const AI_PRIVACY = {
  extraction: policy(process.env.OPENROUTER_ZDR),
  insights: policy(process.env.OPENROUTER_ZDR_INSIGHTS ?? process.env.OPENROUTER_ZDR),
} as const;
