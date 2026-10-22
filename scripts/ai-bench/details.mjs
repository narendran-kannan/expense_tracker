import { readFileSync } from "node:fs";
const file = process.argv[2];
const d = JSON.parse(readFileSync(file, "utf8"));
const { CASES } = await import("./dataset.ts");
const byId = new Map(CASES.map((c) => [c.id, c]));

const count = (arr, keyFn) => {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x);
    m[k] = (m[k] ?? 0) + 1;
  }
  return m;
};

const sb = d.records.filter((r) => r.outcome === "schema_invalid");
console.log("=== schema-invalid breakdown ===");
console.log(count(sb, (r) => `${r.label} | ${byId.get(r.caseId).expect.junk ? "JUNK case" : "DEBIT case"} | ${r.zodError}`));

console.log("\n=== per-case category divergence from primary label (lenient-only misses) ===");
const norm = (s) => String(s ?? "").trim().toLowerCase();
for (const r of d.records) {
  const exp = byId.get(r.caseId).expect;
  if (exp.junk || !r.parsed) continue;
  if (norm(r.parsed.category) === norm(exp.category)) continue;
  if ((exp.altCategories ?? []).some((a) => norm(a) === norm(r.parsed.category))) continue;
  console.log(`${r.label} | ${r.caseId} | ${r.parsed.category} (expected ${exp.category})`);
}

console.log("\n=== subcategory disagreements vs primary (where a subcategory was expected) ===");
const perModel = {};
for (const r of d.records) {
  const exp = byId.get(r.caseId).expect;
  if (exp.junk || !r.parsed || exp.subcategory === undefined) continue;
  const ok = norm(r.parsed.subcategory) === norm(exp.subcategory ?? "");
  perModel[r.label] ??= { ok: 0, n: 0, diffs: {} };
  perModel[r.label].n++;
  if (ok) perModel[r.label].ok++;
  else perModel[r.label].diffs[`${r.caseId}: ${r.parsed.subcategory ?? "null"} ≠ ${exp.subcategory}`] = 1;
}
for (const [k, v] of Object.entries(perModel)) {
  console.log(`\n${k}: ${v.ok}/${v.n}`);
  console.log("  " + Object.keys(v.diffs).join("\n  "));
}

console.log("\n=== Jev routing & cost ===");
for (const label of [...new Set(d.records.map((r) => r.label))]) {
  const rs = d.records.filter((r) => r.label === label && r.usage);
  if (!rs.length) continue;
  console.log(`\n${label} upstream:`, count(rs, (r) => `${r.upstreamModel} @ ${r.provider}`));
  const rs2 = rs.map((r) => r.usage.cost).sort((a, b) => a - b);
  console.log(`  cost/call min=${rs2[0].toFixed(6)} median=${rs2[Math.floor(rs2.length / 2)].toFixed(6)} max=${rs2.at(-1).toFixed(6)}`);
  const reas = rs.map((r) => r.usage.completion_tokens_details?.reasoning_tokens ?? 0);
  console.log(`  reasoning tokens mean=${Math.round(reas.reduce((a, b) => a + b, 0) / reas.length)} max=${Math.max(...reas)}`);
}
for (const label of [...new Set(d.records.map((r) => r.label))]) {
  const rs = d.records.filter((r) => r.label === label && r.usage);
  const c = rs.map((r) => r.usage.cost);
  console.log(`${label}: n=${rs.length} total=$${c.reduce((a, b) => a + b, 0).toFixed(4)} inTok≈${Math.round(rs.reduce((a, r) => a + r.usage.prompt_tokens, 0) / rs.length)}`);
}

console.log("\n=== latency by model (ms) ===");
for (const label of [...new Set(d.records.map((r) => r.label))]) {
  const ms = d.records.filter((r) => r.label === label).map((r) => r.ms).sort((a, b) => a - b);
  const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  console.log(`${label}: p50=${q(0.5)} p90=${q(0.9)} p95=${q(0.95)} max=${ms.at(-1)}`);
}

console.log("\n=== retries / throttle events ===");
console.log(count(d.records, (r) => `${r.label} attempts=${r.attempts}`));

console.log("\n=== date format conformance (raw string from model) ===");
for (const label of [...new Set(d.records.map((r) => r.label))]) {
  const rs = d.records.filter((r) => r.label === label && r.parsed);
  const iso = rs.filter((r) => /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(String(r.parsed.date))).length;
  console.log(`${label}: ${iso}/${rs.length} ISO-8601; sample=${rs[0]?.parsed.date}`);
}
