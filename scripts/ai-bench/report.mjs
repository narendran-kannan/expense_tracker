/**
 * Merge one or more benchmark result files into a markdown summary table.
 *   node scripts/ai-bench/report.mjs results/full.json results/control.json
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = process.argv.slice(2).map((f) => path.resolve(here, f));
const records = files.flatMap((f) => JSON.parse(readFileSync(f, "utf8")).records);

const { DEFAULT_CATEGORIES } = await import("../../src/lib/categories.ts");
const { CASES } = await import("./dataset.ts");
const CATS = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c.name]));
const byId = new Map(CASES.map((c) => [c.id, c]));
const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const pct = (n, d) => (d ? (100 * n) / d : 0);
const q = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

const order = ["DeepSeek V4.1 Flash 1017", "DeepSeek V4.1 Flash (alias)", "Jev Router", "Gemini 3.5 Flash Lite", "Gemini 3.1 Flash Lite", "Gemini 2.5 Flash Lite", "Gemini 2.5 Flash (incumbent)", "Gemini 3.5 Flash (control)"];
const labels = [...new Set(records.map((r) => r.label))].sort((a, b) => order.indexOf(a) - order.indexOf(b));

const out = [];
for (const label of labels) {
  const recs = records.filter((r) => r.label === label);
  const debit = recs.filter((r) => byId.get(r.caseId).expect.junk !== true);
  const junk = recs.filter((r) => byId.get(r.caseId).expect.junk === true);
  let strict = 0, lenient = 0, subOk = 0, subN = 0;
  for (const r of debit) {
    const exp = byId.get(r.caseId).expect;
    if (!r.parsed) continue;
    const got = CATS.get(norm(r.parsed.category)) ?? r.parsed.category;
    if (got === exp.category) strict++;
    if ([exp.category, ...(exp.altCategories ?? [])].map(norm).includes(norm(got))) lenient++;
    if (exp.subcategory !== undefined && exp.subcategory !== null) {
      subN++;
      if (norm(r.parsed.subcategory) === norm(exp.subcategory)) subOk++;
    }
  }
  const valid = debit.filter((r) => r.parsed && !r.zodError && r.httpStatus === 200);
  const junkOk = junk.filter((r) => r.parsed && Number(r.parsed.confidence_score) === 0).length;
  const costs = recs.map((r) => r.usage?.cost).filter((c) => typeof c === "number");
  const lat = recs.map((r) => r.ms);

  out.push({
    Model: label,
    Calls: recs.length,
    "Cat (strict)": pct(strict, debit.length).toFixed(1) + "%",
    "Cat (any reasonable)": pct(lenient, debit.length).toFixed(1) + "%",
    "Subcategory exact": pct(subOk, subN).toFixed(1) + "%",
    "Junk detected": pct(junkOk, junk.length).toFixed(0) + "%",
    "Pipeline failures": recs.length - valid.length,
    "p50 ms": q(lat, 0.5),
    "p95 ms": q(lat, 0.95),
    "USD / 1000 emails": "$" + ((costs.reduce((a, b) => a + b, 0) / costs.length) * 1000).toFixed(2),
  });
}

const keys = Object.keys(out[0]);
console.log("| " + keys.join(" | ") + " |");
console.log("|" + keys.map(() => "---").join("|") + "|");
for (const row of out) console.log("| " + keys.map((k) => row[k]).join(" | ") + " |");
