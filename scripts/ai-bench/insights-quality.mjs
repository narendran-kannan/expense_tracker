import { readFileSync } from "node:fs";

const FIELDS = /comparisonDeltas|deltaPct|recurringCandidates|topMerchants|byCategory|avgAmount|txCount|perCategory|byMonth/i;
const load = (f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9₹ ]/g, " ").replace(/\s+/g, " ").trim();
const ngrams = (s, n = 4) => {
  const w = norm(s).split(" ");
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
};
const overlap = (a, b) => {
  const A = ngrams(a), B = ngrams(b);
  if (!A.size) return 0;
  let hits = 0;
  for (const g of A) if (B.has(g)) hits++;
  return hits / A.size;
};

for (const [label, file] of [
  ["deepseek-v4.1-flash", "/tmp/ins-deepseek.jsonl"],
  ["gemini-3.5-flash-lite", "/tmp/ins-flashlite.jsonl"],
]) {
  const runs = load(file);
  const emptyAnomalies = runs.filter((r) => (r.anomalies ?? []).length === 0).length;
  const placeholder = runs.filter((r) => (r.anomalies ?? []).some((a) => a.amount === 0 || /^none$/i.test(a.merchant ?? ""))).length;
  const leaked = runs.filter((r) => FIELDS.test(JSON.stringify([r.summary, ...(r.trends ?? []), ...(r.suggestions ?? [])]))).length;
  const dup = runs.map((r) => {
    const s = (r.suggestions ?? []).map((x) => overlap(x, (r.trends ?? []).join(" ")));
    return s.length ? Math.max(...s) : 0;
  });
  const words = runs.map((r) => [...(r.trends ?? []), ...(r.suggestions ?? [])].join(" ").split(/\s+/).length);
  const ms = runs.map((r) => r.ms);
  console.log(`\n${label}`);
  console.log(`  runs: ${runs.length} | statuses: ${runs.map((r) => r.status).join(",")}`);
  console.log(`  anomalies empty (correct): ${emptyAnomalies}/${runs.length} | placeholder anomaly: ${placeholder}/${runs.length}`);
  console.log(`  leaked internal field names: ${leaked}/${runs.length}`);
  console.log(`  suggestion↔trend 4-gram overlap: ${dup.map((d) => (d * 100).toFixed(0) + "%").join(", ")}`);
  console.log(`  words (trends+suggestions): ${words.join(", ")}`);
  console.log(`  latency: ${ms.join(", ")} ms`);
}
