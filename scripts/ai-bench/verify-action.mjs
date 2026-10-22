/**
 * Runs the REAL `parseExpenseText` server action against the local database and
 * the live OpenRouter API, to prove the migrated action works end to end
 * (prompt building from DB categories -> OpenRouter -> zod -> resolved dates).
 *
 *   node --env-file=.env scripts/ai-bench/verify-action.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const { parseExpenseText } = await import("../../src/app/actions.ts");
const { prisma } = await import("../../src/lib/prisma.ts");

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
};

const inputs = [
  {
    name: "natural language, no date",
    text: "Spent Rs.320 at Third Wave Coffee yesterday",
    assert: (rows) => rows.length === 1 && rows[0].amount === 320 && rows[0].category === "Food & Dining",
  },
  {
    name: "two bank alerts pasted together",
    text: [
      "Dear Customer, Rs.1,248.00 has been debited from account 1234 to VPA zeptomarketplace@ybl on 21-10-26. UPI Ref 4471258963.",
      "Rs.23,456.00 debited from A/c XX1234 to SBICARD PAYMENT on 07-09-26 via NEFT. Credit card bill payment.",
    ].join("\n\n"),
    assert: (rows) =>
      rows.length === 2 &&
      rows.some((r) => r.amount === 1248 && r.category === "Groceries") &&
      rows.some((r) => r.amount === 23456 && r.is_cc_payment === true),
  },
];

for (const input of inputs) {
  try {
    const rows = await parseExpenseText(input.text);
    const ok = input.assert(rows);
    check(input.name, ok, JSON.stringify(rows));
    const badDates = rows.filter((r) => Number.isNaN(new Date(r.date).getTime()));
    check(`${input.name}: every date parses`, badDates.length === 0, badDates.map((r) => r.date).join(", ") || "ok");
    const known = new Set(
      (await prisma.category.findMany({ where: { parentId: null } })).map((c) => c.name)
    );
    const unknown = rows.filter((r) => !known.has(r.category));
    check(`${input.name}: categories exist in DB`, unknown.length === 0, unknown.map((r) => r.category).join(", ") || "ok");
    const badSubs = [];
    for (const r of rows) {
      if (r.subcategory === null) continue;
      const parent = await prisma.category.findFirst({
        where: { name: r.category, parentId: null },
        include: { children: true },
      });
      if (!parent?.children.some((c) => c.name === r.subcategory)) badSubs.push(`${r.category}/${r.subcategory}`);
    }
    check(`${input.name}: subcategories belong to their category`, badSubs.length === 0, badSubs.join(", ") || "ok");
  } catch (e) {
    check(input.name, false, String(e?.message ?? e));
  }
}

await prisma.$disconnect();
console.log(failures ? `\n${failures} check(s) failed` : "\nall action checks passed");
process.exit(failures ? 1 : 0);
