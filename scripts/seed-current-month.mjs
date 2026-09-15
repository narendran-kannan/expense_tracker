// One-off dev seed: inserts ~100 varied transactions dated in the CURRENT month
// to exercise every mobile case (needs-review, CC, recoverable, EMI, tracked,
// remarks, small/large amounts, many days). Does NOT delete existing data or
// categories — it only inserts. Run: node scripts/seed-current-month.mjs
import { Client } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

// Load DATABASE_URL from .env without extra deps.
function loadEnv() {
  if (process.env.DATABASE_URL) return;
  try {
    const raw = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) process.env.DATABASE_URL = m[1];
    }
  } catch {
    // ignore
  }
}
loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}
if (url.startsWith("prisma+")) {
  console.error("Accelerate URL detected — run against the local dev DB.");
  process.exit(1);
}

const parsed = new URL(url);
const schema = parsed.searchParams.get("schema") || "public";

const MERCHANTS = [
  ["Swiggy", "Food & Dining", "Delivery"],
  ["Zomato", "Food & Dining", "Delivery"],
  ["Dominos", "Food & Dining", "Restaurants"],
  ["Third Wave Coffee", "Food & Dining", "Cafe"],
  ["Street Vendor", "Food & Dining", "Street Food"],
  ["BigBasket", "Groceries", "Supermarket"],
  ["DMart", "Groceries", "Supermarket"],
  ["Zepto", "Groceries", "Vegetables"],
  ["Uber", "Transportation", "Cab"],
  ["Rapido", "Transportation", "Auto"],
  ["Namma Metro", "Transportation", "Metro"],
  ["Indian Oil", "Transportation", "Fuel"],
  ["FASTag Toll", "Transportation", "Toll"],
  ["Amazon India", "Shopping", "Electronics"],
  ["Flipkart", "Shopping", "Clothing"],
  ["IKEA", "Shopping", "Home & Kitchen"],
  ["Nykaa", "Shopping", "Personal Care"],
  ["Netflix", "Entertainment", "Streaming"],
  ["Spotify", "Entertainment", "Streaming"],
  ["PVR Cinemas", "Entertainment", "Movies"],
  ["Airtel", "Bills & Utilities", "Mobile Recharge"],
  ["Jio Fiber", "Bills & Utilities", "Internet"],
  ["BESCOM", "Bills & Utilities", "Electricity"],
  ["Cult.fit", "Health & Fitness", "Gym"],
  ["Pharmeasy", "Health & Fitness", "Medicine"],
  ["Apollo Diagnostics", "Health & Fitness", "Lab Tests"],
  ["Udemy", "Education", "Courses"],
  ["Unknown UPI", "Other", null],
  ["Local Kirana", "Other", null],
];

const CC_MERCHANTS = [
  ["HDFC Credit Card", "Credit Card Payment"],
  ["SBI Credit Card", "Credit Card Payment"],
  ["Axis Credit Card", "Credit Card Payment"],
];

const INVEST = [
  ["Zerodha", "Savings & Investments", "Equity"],
  ["Groww Gold", "Savings & Investments", "Gold"],
  ["ICICI Prudential", "Savings & Investments", "Mutual Funds"],
];

const REMARKS = [
  "Split with roommates",
  "Work reimbursable",
  "Monthly subscription",
  "Gift for mom",
  "Emergency",
  null,
  null,
  null,
];

const COUNTERPARTIES = ["Rahul", "Priya", "Office", "Amit"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  const client = new Client({ connectionString: parsed.toString() });
  await client.connect();
  await client.query(`SET search_path TO "${schema}"`);

  // Map category/subcategory names -> ids.
  const cats = await client.query(
    `SELECT id, name, "parentId" FROM "Category"`
  );
  const parentByName = new Map();
  const subByParentName = new Map();
  for (const r of cats.rows) {
    if (r.parentId === null) parentByName.set(r.name, r.id);
  }
  for (const r of cats.rows) {
    if (r.parentId !== null) subByParentName.set(`${r.parentId}:${r.name}`, r.id);
  }
  function ids(catName, subName) {
    const categoryId = parentByName.get(catName) ?? null;
    const subcategoryId =
      subName && categoryId
        ? subByParentName.get(`${categoryId}:${subName}`) ?? null
        : null;
    return { categoryId, subcategoryId };
  }

  if (parentByName.size === 0) {
    console.error(
      "No categories found. Run `npm run db:sync-categories` (or seed) first."
    );
    process.exit(1);
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const cap = Math.min(lastDay, now.getDate()); // don't seed future dates

  const rows = [];
  function dateInMonth() {
    return new Date(year, month, randInt(1, cap), randInt(8, 21), randInt(0, 59));
  }

  const TARGET = 100;

  // 1) Regular spends (~65), some low-confidence (needs review), some remarks.
  for (let i = 0; i < 65; i++) {
    const [merchant, cat, sub] = pick(MERCHANTS);
    const { categoryId, subcategoryId } = ids(cat, sub);
    const conf = Math.random() < 0.2 ? +(0.4 + Math.random() * 0.35).toFixed(2) : +(0.85 + Math.random() * 0.14).toFixed(2);
    rows.push({
      amount: randInt(80, 6000),
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: conf,
      needs_review: conf < 0.8,
      remarks: pick(REMARKS),
    });
  }

  // 2) A few large purchases (~8) to test big amounts / Large filter.
  for (let i = 0; i < 8; i++) {
    const [merchant, cat, sub] = pick(MERCHANTS);
    const { categoryId, subcategoryId } = ids(cat, sub);
    rows.push({
      amount: randInt(30000, 120000),
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: 0.9,
      needs_review: false,
      remarks: pick(REMARKS),
    });
  }

  // 3) CC payments (~6) — excluded from spend.
  for (let i = 0; i < 6; i++) {
    const [merchant, cat] = pick(CC_MERCHANTS);
    const { categoryId } = ids(cat, null);
    rows.push({
      amount: randInt(5000, 40000),
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId: null,
      is_cc_payment: true,
      confidence_score: 0.95,
      needs_review: false,
      remarks: null,
    });
  }

  // 4) Recoverables (~8) — with counterparty + recoverable_amount.
  for (let i = 0; i < 8; i++) {
    const [merchant, cat, sub] = pick(MERCHANTS);
    const { categoryId, subcategoryId } = ids(cat, sub);
    const amount = randInt(500, 8000);
    rows.push({
      amount,
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: 0.9,
      needs_review: false,
      remarks: "Paid on behalf",
      recoverable_amount: amount,
      counterparty: pick(COUNTERPARTIES),
      recovery_status: "PENDING",
    });
  }

  // 5) Tracked / excluded (~5) — Savings & Investments.
  for (let i = 0; i < 5; i++) {
    const [merchant, cat, sub] = pick(INVEST);
    const { categoryId, subcategoryId } = ids(cat, sub);
    rows.push({
      amount: randInt(2000, 25000),
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: 0.95,
      needs_review: false,
      remarks: null,
    });
  }

  // 6) EMI purchases (~3) — started this month, spread over months.
  for (let i = 0; i < 3; i++) {
    const [merchant, cat, sub] = ["Amazon India", "Shopping", "Electronics"];
    const { categoryId, subcategoryId } = ids(cat, sub);
    const amount = randInt(24000, 96000);
    const tenure = pick([3, 6, 9, 12]);
    const startDate = new Date(year, month, randInt(1, cap));
    rows.push({
      amount,
      merchant,
      date: startDate,
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: 0.92,
      needs_review: false,
      remarks: `EMI ${tenure}m`,
      is_emi: true,
      emi_tenure_months: tenure,
      emi_monthly_amount: Math.round(amount / tenure),
      emi_start_date: startDate,
    });
  }

  // Trim/pad to exactly TARGET.
  while (rows.length < TARGET) {
    const [merchant, cat, sub] = pick(MERCHANTS);
    const { categoryId, subcategoryId } = ids(cat, sub);
    rows.push({
      amount: randInt(80, 4000),
      merchant,
      date: dateInMonth(),
      category: cat,
      categoryId,
      subcategoryId,
      is_cc_payment: false,
      confidence_score: 0.9,
      needs_review: false,
      remarks: pick(REMARKS),
    });
  }
  rows.length = TARGET;

  let inserted = 0;
  for (const r of rows) {
    await client.query(
      `INSERT INTO "Transaction"
        (id, amount, merchant, date, category, "categoryId", "subcategoryId",
         is_cc_payment, confidence_score, needs_review, remarks, source,
         recoverable_amount, counterparty, recovery_status,
         is_emi, emi_tenure_months, emi_monthly_amount, emi_start_date,
         created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now(),now())`,
      [
        randomUUID(),
        r.amount,
        r.merchant,
        r.date,
        r.category,
        r.categoryId,
        r.subcategoryId,
        r.is_cc_payment,
        r.confidence_score,
        r.needs_review,
        r.remarks ?? null,
        "manual",
        r.recoverable_amount ?? null,
        r.counterparty ?? null,
        r.recovery_status ?? null,
        r.is_emi ?? false,
        r.emi_tenure_months ?? null,
        r.emi_monthly_amount ?? null,
        r.emi_start_date ?? null,
      ]
    );
    inserted++;
  }

  await client.end();
  const label = now.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
  console.log(`Seeded ${inserted} transactions for ${label}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
