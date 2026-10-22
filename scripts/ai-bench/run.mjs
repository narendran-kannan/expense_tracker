/**
 * Categorisation benchmark: Gemini flash-lite family vs TypeSafe Jev (OpenRouter).
 *
 * Uses the EXACT production prompt (extracted from src/app/api/process-emails/route.ts),
 * the EXACT production Zod schema, and the EXACT production date resolver, then saves
 * raw responses for analyze.mjs.
 *
 *   node scripts/ai-bench/run.mjs
 *
 * Env: OPENROUTER_API_KEY (required), BENCH_MODELS (csv), BENCH_RUNS (default 3),
 *      BENCH_TAG (result file suffix). Per-model parallelism/pacing is set in ALL_MODELS.
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);
const origEmit = process.emitWarning;
process.emitWarning = (w, ...rest) => {
  const msg = typeof w === "string" ? w : w?.message ?? "";
  if (/MODULE_TYPELESS_PACKAGE_JSON|Reparsing as ES module|DEP0205/.test(msg)) return;
  return origEmit.call(process, w, ...rest);
};

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../..");
// static imports are resolved before register() runs, so load app modules dynamically
const { CASES, buildEmailText } = await import("./dataset.ts");
const { resolveTransactionDate } = await import("../../src/lib/date-extraction.ts");

/**
 * Local mirror of src/lib/schemas.ts `transactionSchema` (zod is not installed in
 * this checkout). Keep in sync: amount>0, merchant string, date string,
 * category string, subcategory string|null, is_cc_payment boolean,
 * confidence_score 0..1. Returns null when valid, else an issue list.
 */
function validateTransaction(o) {
  const issues = [];
  if (typeof o !== "object" || o === null || Array.isArray(o)) return ["not an object"];
  if (typeof o.amount !== "number" || !(o.amount > 0)) issues.push("amount: expected positive number");
  if (typeof o.merchant !== "string") issues.push("merchant: expected string");
  if (typeof o.date !== "string") issues.push("date: expected string");
  if (typeof o.category !== "string") issues.push("category: expected string");
  if (!(typeof o.subcategory === "string" || o.subcategory === null)) issues.push("subcategory: expected string|null");
  if (typeof o.is_cc_payment !== "boolean") issues.push("is_cc_payment: expected boolean");
  if (typeof o.confidence_score !== "number" || o.confidence_score < 0 || o.confidence_score > 1)
    issues.push("confidence_score: expected 0..1");
  const extra = Object.keys(o).filter(
    (k) => !["amount", "merchant", "date", "category", "subcategory", "is_cc_payment", "confidence_score"].includes(k)
  );
  if (extra.length) issues.push(`unexpected keys: ${extra.join(",")}`);
  return issues.length ? issues : null;
}


const KEY = process.env.OPENROUTER_API_KEY ?? "";
const RUNS = Number(process.env.BENCH_RUNS ?? 3);

const ALL_MODELS = [
  { id: "typesafe/jev-router", label: "Jev Router", parallel: 1, minIntervalMs: 3400 },
  { id: "google/gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite", parallel: 4, minIntervalMs: 0 },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", parallel: 4, minIntervalMs: 0 },
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", parallel: 4, minIntervalMs: 0 },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash (incumbent)", parallel: 4, minIntervalMs: 0 },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash (control)", parallel: 4, minIntervalMs: 0, maxTokens: 8192 },
  { id: "deepseek/deepseek-v4.1-flash-1017", label: "DeepSeek V4.1 Flash 1017", parallel: 4, minIntervalMs: 0, maxTokens: 8192 },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash (alias)", parallel: 4, minIntervalMs: 0, maxTokens: 8192 },
];
const MODELS = process.env.BENCH_MODELS
  ? ALL_MODELS.filter((m) => process.env.BENCH_MODELS.split(",").includes(m.id))
  : ALL_MODELS;

function productionPromptBuilder() {
  const src = readFileSync(path.join(ROOT, "src/app/api/process-emails/route.ts"), "utf8");
  const m = src.match(/^function buildAIPrompt\(categoryPromptText: string\): string \{[\s\S]*?\n\}\n/m);
  if (!m) throw new Error("could not extract buildAIPrompt from route.ts");
  return new Function(
    m[0].replace("function buildAIPrompt(categoryPromptText: string): string", "return function (categoryPromptText) ")
  )();
}

async function categoryPromptText() {
  const cats = await import("../../src/lib/categories.ts");
  const { buildCategoryPromptText, DEFAULT_CATEGORIES } = cats;
  return buildCategoryPromptText(
    DEFAULT_CATEGORIES.map((c) => ({ name: c.name, subcategories: c.subcategories ?? [] }))
  );
}

// Mirrors what the AI SDK sends for transactionSchema (strict JSON Schema, nullable union).
const jsonSchema = {
  type: "object",
  properties: {
    amount: { type: "number" },
    merchant: { type: "string" },
    date: { type: "string" },
    category: { type: "string" },
    subcategory: { type: ["string", "null"] },
    is_cc_payment: { type: "boolean" },
    confidence_score: { type: "number" },
  },
  required: ["amount", "merchant", "date", "category", "subcategory", "is_cc_payment", "confidence_score"],
  additionalProperties: false,
};

async function callOne(model, prompt, minIntervalMs, maxTokens) {
  let attempts = 0;
  for (;;) {
    attempts++;
    const t0 = Date.now();
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://localhost/expense-tracker-bench",
          "X-Title": "expense-tracker-bench",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_schema", json_schema: { name: "transaction", strict: true, schema: jsonSchema } },
          temperature: 0,
          max_tokens: maxTokens,
          usage: { include: true },
        }),
      });
      const ms = Date.now() - t0;
      const json = await res.json();
      const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status >= 500;
      if (retryable && attempts < 8) {
        const backoff = Math.min(30_000, 2_000 * attempts + Math.random() * 1_000);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      return { status: res.status, json, ms, attempts };
    } catch (e) {
      if (attempts < 8) {
        await new Promise((r) => setTimeout(r, 2_000 * attempts));
        continue;
      }
      return { status: 0, json: { error: { message: String(e) } }, ms: Date.now() - t0, attempts };
    }
  }
}

const buildAIPrompt = productionPromptBuilder();
const systemPrompt = buildAIPrompt(await categoryPromptText());

const byId = new Map(CASES.map((c) => [c.id, c]));
const recs = [];
const total = MODELS.length * CASES.length * RUNS;
let done = 0;

// Each model gets its own worker pool + request pacing, so a slow/rate-limited
// provider cannot distort the other provider's measurements.
await Promise.all(
  MODELS.map(async (m) => {
    let lastStart = 0;
    const queue = [];
    for (const c of CASES) for (let r = 1; r <= RUNS; r++) queue.push({ caseId: c.id, run: r });
    let i = 0;

    const worker = async () => {
      while (i < queue.length) {
        const job = queue[i++];
        const c = byId.get(job.caseId);
        // pacing
        const wait = Math.max(0, lastStart + m.minIntervalMs - Date.now());
        if (wait) await new Promise((r) => setTimeout(r, wait + Math.random() * 300));
        lastStart = Date.now();

        const prompt = systemPrompt + buildEmailText(c);
        const rec = {
          model: m.id, label: m.label, caseId: job.caseId, run: job.run,
          ms: 0, httpStatus: 0, attempts: 0, error: null, parseError: null, zodError: null,
          outcome: "ok", provider: null, upstreamModel: null, usage: null, raw: null, parsed: null,
        };
        try {
          const { status, json, ms, attempts } = await callOne(m.id, prompt, m.minIntervalMs, m.maxTokens ?? 1024);
          rec.httpStatus = status;
          rec.ms = ms;
          rec.attempts = attempts;
          rec.provider = json.provider ?? null;
          rec.upstreamModel = json.model ?? null;
          rec.usage = json.usage ?? null;
          if (json.error) {
            rec.error = JSON.stringify(json.error).slice(0, 400);
            rec.outcome = `http_${status}`;
          }
          const content = json.choices?.[0]?.message?.content ?? null;
          rec.raw = content;
          if (content) {
            try {
              rec.parsed = JSON.parse(content);
              const issues = validateTransaction(rec.parsed);
              if (issues) {
                rec.zodError = issues.join("; ");
                rec.outcome = "schema_invalid";
              }
            } catch (e) {
              rec.parseError = String(e);
              rec.outcome = "no_json";
            }
          } else if (!json.error) {
            rec.parseError = "empty content";
            rec.outcome = "no_json";
          }
          if (rec.parsed) {
            const resolved = resolveTransactionDate(String(rec.parsed.date ?? ""), c.body);
            rec.resolvedDate = Number.isNaN(resolved.getTime()) ? null : resolved.toISOString().slice(0, 10);
          }
        } catch (e) {
          rec.error = String(e);
          rec.outcome = "exception";
        }
        recs.push(rec);
        done++;
        if (done % 25 === 0) console.log(`  ${done}/${total}`);
      }
    };
    await Promise.all(Array.from({ length: m.parallel }, worker));
  })
);

mkdirSync(path.join(here, "results"), { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const tag = process.env.BENCH_TAG ? `-${process.env.BENCH_TAG}` : "";
const out = path.join(here, "results", `run-${stamp}${tag}.json`);
writeFileSync(out, JSON.stringify({ stamp, runs: RUNS, models: MODELS, caseCount: CASES.length, records: recs }, null, 2));
console.log(`saved ${recs.length} records -> ${path.relative(ROOT, out)}`);
