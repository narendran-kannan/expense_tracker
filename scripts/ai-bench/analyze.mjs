/**
 * Analyse a benchmark result file produced by run.mjs.
 *   node scripts/ai-bench/analyze.mjs [results/run-....json]
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(
      here,
      "results",
      readdirSync(path.join(here, "results")).filter((f) => f.endsWith(".json") && !f.includes("pilot")).sort().pop()
    );

const data = JSON.parse(readFileSync(file, "utf8"));
const { DEFAULT_CATEGORIES } = await import("../../src/lib/categories.ts");
const CATS = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), c.name]));
const SUBS = new Map(DEFAULT_CATEGORIES.map((c) => [c.name.toLowerCase(), new Set((c.subcategories ?? []).map((s) => s.toLowerCase()))]));
const { CASES } = await import("./dataset.ts");
const caseById = new Map(CASES.map((c) => [c.id, c]));

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
function pct(n, d) {
  return d ? `${((100 * n) / d).toFixed(1)}%` : "n/a";
}
function p(arr, q) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

const models = [...new Set(data.records.map((r) => r.label))];
const rows = [];

for (const label of models) {
  const recs = data.records.filter((r) => r.label === label);
  const ok = recs.filter((r) => r.parsed && !r.zodError && r.httpStatus === 200);
  const nHttp = recs.filter((r) => r.outcome?.startsWith("http_") || r.outcome === "exception").length;
  const nNoJson = recs.filter((r) => r.outcome === "no_json").length;
  const nSchema = recs.filter((r) => r.outcome === "schema_invalid").length;
  const debitCases = recs.filter((r) => caseById.get(r.caseId).expect.junk !== true);
  const junkCases = recs.filter((r) => caseById.get(r.caseId).expect.junk === true);

  // --- category metrics (debit cases only) ---
  let hardCorrect = 0, hardTotal = 0, lenCorrect = 0, validCategory = 0, validSub = 0, subGiven = 0, subMatch = 0;
  const mistakes = [];
  for (const r of debitCases) {
    const exp = caseById.get(r.caseId).expect;
    const pred = r.parsed;
    hardTotal++;
    if (!pred) { mistakes.push({ id: r.caseId, run: r.run, pred: "<no json>", exp: exp.category }); continue; }
    const canon = CATS.get(norm(pred.category));
    if (canon) validCategory++;
    const got = canon ?? pred.category;
    if (got === exp.category) hardCorrect++;
    const acceptable = [exp.category, ...(exp.altCategories ?? [])].map(norm);
    if (acceptable.includes(norm(got))) lenCorrect++;
    else mistakes.push({ id: r.caseId, run: r.run, pred: got, exp: exp.category, rawSub: pred.subcategory });
    if (pred.subcategory !== null && pred.subcategory !== undefined) {
      subGiven++;
      if (canon && SUBS.get(canon.toLowerCase())?.has(norm(pred.subcategory))) validSub++;
    }
    if (exp.subcategory !== undefined && exp.subcategory !== null) {
      if (norm(pred.subcategory) === norm(exp.subcategory)) subMatch++;
    }
  }

  // --- junk detection ---
  const junkOk = junkCases.filter((r) => r.parsed && Number(r.parsed.confidence_score) === 0).length;
  const falseJunk = debitCases.filter((r) => r.parsed && Number(r.parsed.confidence_score) === 0).length;

  // --- field accuracy (debit cases with json) ---
  const withJson = debitCases.filter((r) => r.parsed);
  const amountOk = withJson.filter((r) => {
    const exp = caseById.get(r.caseId).expect.amount;
    return exp === undefined || Math.abs(Number(r.parsed.amount) - exp) < 0.01;
  }).length;
  const merchOk = withJson.filter((r) => {
    const m = caseById.get(r.caseId).expect.merchant;
    return !m || m.test(String(r.parsed.merchant));
  }).length;
  const ccOk = withJson.filter((r) => {
    const exp = caseById.get(r.caseId).expect.is_cc_payment;
    return exp === undefined ? !r.parsed.is_cc_payment : Boolean(r.parsed.is_cc_payment) === exp;
  }).length;
  const dateOk = withJson.filter((r) => {
    const exp = caseById.get(r.caseId).expect.date;
    return !exp || r.resolvedDate === exp;
  }).length;

  const lat = recs.map((r) => r.ms);
  const costs = recs.map((r) => r.usage?.cost).filter((c) => typeof c === "number");
  const costTotal = costs.reduce((a, b) => a + b, 0);
  const inTok = recs.map((r) => r.usage?.prompt_tokens ?? 0);
  const outTok = recs.map((r) => r.usage?.completion_tokens ?? 0);

  // --- consistency across runs (same case, same category?) ---
  const byCase = new Map();
  for (const r of debitCases) {
    if (!byCase.has(r.caseId)) byCase.set(r.caseId, []);
    byCase.get(r.caseId).push(r.parsed ? norm(CATS.get(norm(r.parsed.category)) ?? r.parsed.category) : null);
  }
  const stable = [...byCase.values()].filter((v) => new Set(v).size === 1).length;

  rows.push({
    label,
    calls: recs.length,
    httpErr: nHttp,
    noJson: nNoJson,
    schemaBad: nSchema,
    failRate: pct(recs.length - ok.length, recs.length),
    fails: recs.length - ok.length,
    cat: pct(hardCorrect, hardTotal),
    catLen: pct(lenCorrect, hardTotal),
    catValid: pct(validCategory, hardTotal),
    subValid: pct(validSub, subGiven),
    subMatch: pct(subMatch, withJson.filter((r) => caseById.get(r.caseId).expect.subcategory).length),
    junk: pct(junkOk, junkCases.length),
    falseJunk: pct(falseJunk, debitCases.length),
    amount: pct(amountOk, withJson.length),
    merchant: pct(merchOk, withJson.length),
    cc: pct(ccOk, withJson.length),
    date: pct(dateOk, withJson.length),
    stable: pct(stable, byCase.size),
    p50: p(lat, 0.5),
    p95: p(lat, 0.95),
    mean: Math.round(lat.reduce((a, b) => a + b, 0) / lat.length),
    inTok: Math.round(inTok.reduce((a, b) => a + b, 0) / inTok.length),
    outTok: Math.round(outTok.reduce((a, b) => a + b, 0) / outTok.length),
    costPerCall: costs.length ? costTotal / costs.length : null,
    costPer1k: costs.length ? (costTotal / costs.length) * 1000 : null,
  });
  rows[rows.length - 1].mistakes = mistakes.slice(0, 12);
  rows[rows.length - 1].junkMisses = junkCases.filter((r) => !(r.parsed && Number(r.parsed.confidence_score) === 0)).map((r) => `${r.caseId}:${r.parsed?.confidence_score}`);
}

// upstream router distribution (jev)
const router = {};
for (const r of data.records) {
  if (r.label !== "Jev Router") continue;
  const k = `${r.upstreamModel} @ ${r.provider}`;
  router[k] = (router[k] ?? 0) + 1;
}

console.log(`\nfile: ${path.relative(path.resolve(here, "../.."), file)}  (${data.records.length} records, ${data.runs} run(s) x ${data.caseCount} cases)\n`);
const cols = ["label", "httpErr", "noJson", "schemaBad", "cat", "catLen", "catValid", "subValid", "subMatch", "junk", "falseJunk", "amount", "merchant", "cc", "date", "stable", "p50", "p95", "mean", "outTok", "costPerCall", "costPer1k"];
const table = rows.map((r) => ({
  ...r,
  costPerCall: r.costPerCall === null ? "n/a" : `$${r.costPerCall.toFixed(6)}`,
  costPer1k: r.costPer1k === null ? "n/a" : `$${r.costPer1k.toFixed(3)}`,
}));
console.log(table.map((r) => JSON.stringify(Object.fromEntries(cols.map((c) => [c, r[c]])))).join("\n"));

console.log("\nmisclassifications (up to 12 per model):");
for (const r of rows) {
  console.log(`\n# ${r.label}`);
  if (!r.mistakes.length) console.log("  none");
  for (const m of r.mistakes) console.log(`  ${m.id} run${m.run}: predicted "${m.pred}" (sub: ${m.rawSub ?? "-"}) expected "${m.exp}"`);
  if (r.junkMisses.length) console.log(`  junk misses: ${r.junkMisses.join(", ")}`);
}
console.log("\nJev routing distribution:", router);
