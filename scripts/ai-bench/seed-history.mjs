/**
 * Seeds two realistic months of transactions so insight generation has real
 * month-over-month deltas (the first comparison had no previous month, which made
 * every trend a degenerate "₹0 -> 100%").
 *
 *   node --env-file=.env scripts/ai-bench/seed-history.mjs
 */
import { register } from "node:module";
register("./alias-hooks.mjs", import.meta.url);

const { prisma } = await import("../../src/lib/prisma.ts");

const cats = await prisma.category.findMany({ where: { parentId: null } });
const catId = (name) => cats.find((c) => c.name === name)?.id ?? null;

const tx = (month, day, amount, merchant, category) => ({
  amount,
  merchant,
  date: new Date(Date.UTC(2026, month, day)),
  category,
  categoryId: catId(category),
  confidence_score: 0.95,
  needs_review: false,
  source: "seed",
  is_cc_payment: category === "Credit Card Payment",
});

// September: quieter month, more frequent small dining, no travel.
const september = [
  tx(8, 2, 380, "Swiggy", "Food & Dining"),
  tx(8, 5, 240, "Zomato", "Food & Dining"),
  tx(8, 8, 415, "Swiggy", "Food & Dining"),
  tx(8, 11, 990, "Zepto", "Groceries"),
  tx(8, 13, 1050, "BigBasket", "Groceries"),
  tx(8, 15, 265, "Uber", "Transportation"),
  tx(8, 17, 2400, "IOCL", "Transportation"),
  tx(8, 19, 649, "Netflix", "Entertainment"),
  tx(8, 21, 1290, "BESCOM", "Bills & Utilities"),
  tx(8, 23, 1499, "Cultfit", "Health & Fitness"),
  tx(8, 25, 10000, "Groww", "Savings & Investments"),
  tx(8, 27, 18900, "SBICard Payment", "Credit Card Payment"),
];

const existingSept = await prisma.transaction.count({
  where: { date: { gte: new Date(Date.UTC(2026, 8, 1)), lte: new Date(Date.UTC(2026, 8, 30)) } },
});
if (existingSept > 0) {
  console.log(`September already has ${existingSept} transactions, skipping`);
} else {
  await prisma.transaction.createMany({
    data: september.map((r, i) => ({ ...r, email_message_id: `seed-sep-${i}` })),
  });
  console.log(`seeded ${september.length} September transactions`);
}

const counts = await prisma.transaction.groupBy({ by: ["category"], _count: true });
console.log("categories:", counts.map((c) => `${c.category}=${c._count}`).join(", "));
await prisma.$disconnect();
