/**
 * End-to-end check of the OpenRouter provider wiring used by the app.
 *
 * Exercises the exact modules production uses (`@/lib/ai` + `@/lib/schemas`) with
 * `generateObject`, so it validates provider auth, JSON-schema mode, zod parsing
 * and token/cost accounting — not just the raw REST API.
 *
 *   node --env-file=.env scripts/ai-bench/verify-provider.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const { generateObject } = await import("ai");
const { extractionModel, insightsModel } = await import("../../src/lib/ai.ts");
const { transactionSchema, batchTransactionSchema, insightOutputSchema } = await import("../../src/lib/schemas.ts");
const { DEFAULT_CATEGORIES, buildCategoryPromptText } = await import("../../src/lib/categories.ts");

const categoryPromptText = buildCategoryPromptText(
  DEFAULT_CATEGORIES.map((c) => ({ name: c.name, subcategories: c.subcategories ?? [] }))
);

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const zdrList = await fetch("https://openrouter.ai/api/v1/endpoints/zdr")
  .then((r) => r.json())
  .then((j) => j.data ?? []);
const isZdr = (modelId, provider) =>
  zdrList.some((e) => e.model_id === modelId && e.provider_name === provider);

const summarize = (r) => {
  const md = r.providerMetadata?.openrouter ?? {};
  const cost = md.usage?.cost;
  return `model=${r.response.modelId} provider=${md.provider ?? "?"} tokens=${r.usage.inputTokens}+${r.usage.outputTokens}${
    typeof cost === "number" ? ` cost=$${cost.toFixed(6)}` : ""
  }`;
};

// Every real call must land on an endpoint OpenRouter lists as Zero Data Retention.
const assertZdr = (name, r) => {
  const provider = r.providerMetadata?.openrouter?.provider;
  const ok = isZdr(r.response.modelId, provider);
  check(`${name}: served by a ZDR endpoint`, ok, `provider=${provider}`);
};

// 1. single-transaction email (the /api/process-emails path)
{
  const prompt = `Extract the debit transaction from this Indian bank alert.
Available categories and subcategories:
${categoryPromptText}

Email content:
From: alerts@hdfcbank.net
Subject: Debit Alert

Rs.450.00 has been debited from account 1234 to VPA swiggy@axisbank on 20-10-26. UPI Ref 1478523690.`;

  const { object, ...rest } = await generateObject({
    model: extractionModel(),
    schema: transactionSchema,
    prompt,
  });
  check(
    "email extraction returns the production transaction shape",
    object.amount === 450 && object.category === "Food & Dining" && object.subcategory === "Delivery",
    `${JSON.stringify(object)} | ${summarize(rest)}`
  );
  assertZdr("email extraction", rest);
}

// 2. multi-transaction text (the parseExpenseText path)
{
  const prompt = `Extract ALL debit transactions from this text.
Available categories and subcategories:
${categoryPromptText}

User text:
Rs.240 spent at Zepto on 21-10-26.
Paid Rs.1,099 to ACT Fibernet on 03-10-26.`;

  const { object, ...rest } = await generateObject({
    model: extractionModel(),
    schema: batchTransactionSchema,
    prompt,
  });
  check(
    "batch extraction returns every transaction",
    Array.isArray(object.transactions) && object.transactions.length === 2,
    `${JSON.stringify(object.transactions)} | ${summarize(rest)}`
  );
  assertZdr("batch extraction", rest);
}

// 3. insights (the getInsights path, different model id)
{
  const stats = {
    period: "March 2026",
    previousPeriod: "February 2026",
    txCount: 12,
    totalSpend: 23456,
    previousTotalSpend: 19800,
    byCategory: [{ category: "Food & Dining", amount: 8450, previousAmount: 6100 }],
    anomalies: [{ merchant: "Swiggy", amount: 2400, categoryMean: 700, zScore: 3.1 }],
  };

  const { object, ...rest } = await generateObject({
    model: insightsModel(),
    schema: insightOutputSchema,
    prompt: `You are a financial analyst describing one period of personal spending for a single user in India (INR).
Only reference figures present in the JSON below.
Period: March 2026
Stats:
${JSON.stringify(stats, null, 2)}`,
  });
  check(
    "insights returns the production insight shape",
    typeof object.summary === "string" && Array.isArray(object.trends) && Array.isArray(object.anomalies),
    `trends=${object.trends.length} anomalies=${object.anomalies.length} | ${summarize(rest)}`
  );
  assertZdr("insights", rest);
}

// 4. missing key must fail loudly, not silently call a default provider
{
  const saved = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = "";
  const { resetOpenRouterClient, extractionModel: freshModel } = await import("../../src/lib/ai.ts");
  resetOpenRouterClient();
  let threw = "";
  try {
    freshModel();
  } catch (e) {
    threw = String(e.message ?? e);
  }
  check("missing OPENROUTER_API_KEY throws a clear error", /OPENROUTER_API_KEY is not set/.test(threw), threw);
  process.env.OPENROUTER_API_KEY = saved;
  resetOpenRouterClient();
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall provider checks passed");
process.exit(failures ? 1 : 0);
