/**
 * Generates insights for one period with the REAL getInsights server action and
 * prints the result, so two models can be compared on identical data.
 *
 *   node --env-file=.env scripts/ai-bench/compare-insights.mjs seed
 *   OPENROUTER_MODEL_INSIGHTS=deepseek/deepseek-v4.1-flash-1017 node --env-file=.env scripts/ai-bench/compare-insights.mjs
 *   OPENROUTER_MODEL_INSIGHTS=google/gemini-2.5-pro OPENROUTER_ZDR=false node --env-file=.env scripts/ai-bench/compare-insights.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const { prisma } = await import("../../src/lib/prisma.ts");
const mode = process.argv[2];

if (mode === "seed") {
  const existing = await prisma.transaction.count();
  if (existing > 0) {
    console.log(`skipping seed, ${existing} transactions already present`);
  } else {
    const cats = await prisma.category.findMany({ where: { parentId: null } });
    const catId = (name) => cats.find((c) => c.name === name)?.id ?? null;
    const tx = (day, amount, merchant, category) => ({
      amount,
      merchant,
      date: new Date(Date.UTC(2026, 9, day)),
      category,
      categoryId: catId(category),
      confidence_score: 0.95,
      needs_review: false,
      source: "seed",
    });
    const rows = [
      tx(2, 450, "Swiggy", "Food & Dining"),
      tx(3, 318, "Zomato", "Food & Dining"),
      tx(4, 1200, "Swiggy", "Food & Dining"),
      tx(5, 1248, "Zepto", "Groceries"),
      tx(6, 2400, "Swiggy", "Food & Dining"),
      tx(7, 287, "Uber", "Transportation"),
      tx(8, 2500, "IOCL", "Transportation"),
      tx(9, 7420, "IndiGo", "Travel"),
      tx(10, 1899, "Amazon India", "Shopping"),
      tx(11, 649, "Netflix", "Entertainment"),
      tx(12, 1340, "BESCOM", "Bills & Utilities"),
      tx(13, 1499, "Cultfit", "Health & Fitness"),
      tx(14, 10000, "Groww", "Savings & Investments"),
      tx(15, 23456, "SBICard Payment", "Credit Card Payment"),
    ].map((r, i) => ({ ...r, email_message_id: `seed-${i}`, is_cc_payment: r.category === "Credit Card Payment" }));
    await prisma.transaction.createMany({ data: rows });
    console.log(`seeded ${rows.length} transactions`);
  }
  await prisma.$disconnect();
  process.exit(0);
}

const { getInsights } = await import("../../src/app/actions.ts");
const { AI_MODELS } = await import("../../src/lib/ai-config.ts");
const runs = Number(process.argv[3] ?? 1);
for (let i = 1; i <= runs; i++) {
  const t0 = Date.now();
  try {
    const res = await getInsights({ type: "month", year: 2026, month: 9 }, true);
    const out = { model: AI_MODELS.insights, run: i, ms: Date.now() - t0, txCount: res.stats?.txCount, status: res.status, ...res.insight };
    console.log(JSON.stringify(out));
  } catch (e) {
    console.log(JSON.stringify({ model: AI_MODELS.insights, run: i, ms: Date.now() - t0, failed: String(e?.message ?? e).slice(0, 200) }));
  }
}
await prisma.$disconnect();
