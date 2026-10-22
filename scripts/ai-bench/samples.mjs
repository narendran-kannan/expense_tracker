import { readFileSync } from "node:fs";
const files = ["results/run-2026-10-22T17-08-42-424Z-full.json", "results/run-2026-10-22T17-28-38-009Z-control2.json"];
const recs = files.flatMap((f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8")).records);
const cases = ["transfer-friend", "inv-groww", "edu-kindle-books", "health-decathlon", "groc-zepto", "other-bajaj-emi", "groc-licious", "travel-redbus", "ins-star-health"];
for (const c of cases) {
  console.log(`\n${c}`);
  for (const label of ["Jev Router", "Gemini 3.5 Flash Lite", "Gemini 3.5 Flash (control)", "Gemini 2.5 Flash (incumbent)"]) {
    const rs = recs.filter((r) => r.caseId === c && r.label === label && r.parsed);
    const picks = rs.map((r) => `${r.parsed.category} / ${r.parsed.subcategory ?? "null"}`);
    const u = new Set(picks);
    console.log(`  ${label.padEnd(30)} ${[...u].join(" | ")}${rs.length < 3 ? "  (n=" + rs.length + ")" : ""}`);
  }
}
