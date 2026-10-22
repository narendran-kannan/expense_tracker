/**
 * Measures per-call cost of the REAL insights prompt (extracted verbatim from
 * actions.ts) for whichever model OPENROUTER_MODEL_INSIGHTS selects, using
 * OpenRouter's own usage accounting.
 *
 *   OPENROUTER_MODEL_INSIGHTS=... node --env-file=.env scripts/ai-bench/insights-cost.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
import { readFileSync } from "node:fs";

const { generateObject } = await import("ai");
const { insightsModel } = await import("../../src/lib/ai.ts");
const { AI_MODELS } = await import("../../src/lib/ai-config.ts");
const { insightOutputSchema, INSIGHT_LIMITS } = await import("../../src/lib/schemas.ts");
const { computeInsightStats } = await import("../../src/lib/insights-stats.ts");
const { periodLabel, previousPeriodLabel } = await import("../../src/lib/insights-period.ts");
const { prisma } = await import("../../src/lib/prisma.ts");

// Pull the exact prompt template out of getInsights() so this mirrors production.
const src = readFileSync(new URL("../../src/app/actions.ts", import.meta.url), "utf8");
const start = src.indexOf("const prompt = `You are a financial analyst");
const end = src.indexOf("`;\n\n  const { object: raw }", start);
if (start < 0 || end < 0) throw new Error("could not extract insights prompt from actions.ts");
const template = src.slice(start + "const prompt = ".length, end + 1);
const buildPrompt = new Function("INSIGHT_LIMITS", "label", "prevLabel", "stats", `return ${template};`);

const period = { type: "month", year: 2026, month: 9 };
const stats = await computeInsightStats(period);
const prompt = buildPrompt(INSIGHT_LIMITS, periodLabel(period), previousPeriodLabel(period), stats);

const t0 = Date.now();
const r = await generateObject({ model: insightsModel(), schema: insightOutputSchema, prompt });
const md = r.providerMetadata?.openrouter ?? {};
console.log(
  JSON.stringify({
    model: AI_MODELS.insights,
    provider: md.provider,
    ms: Date.now() - t0,
    inTokens: r.usage.inputTokens,
    outTokens: r.usage.outputTokens,
    costUsd: md.usage?.cost,
    per1000Insights: typeof md.usage?.cost === "number" ? Number((md.usage.cost * 1000).toFixed(2)) : null,
    anomalies: r.object.anomalies.length,
  })
);
await prisma.$disconnect();
