import { Client } from "pg";
import { randomUUID } from "node:crypto";

const DEFAULT_CATEGORIES = [
  { name: "ATM Withdrawal" },
  { name: "Bills & Utilities", subcategories: ["Electricity", "Water", "Gas", "Internet", "Mobile Recharge", "DTH", "Rent"] },
  { name: "Credit Card Payment" },
  { name: "Education", subcategories: ["Courses", "Books", "Tuition", "Certifications"] },
  { name: "Entertainment", subcategories: ["Streaming", "Movies", "Gaming", "Events"] },
  { name: "Food & Dining", subcategories: ["Restaurants", "Delivery", "Cafe", "Street Food"] },
  { name: "Groceries", subcategories: ["Supermarket", "Vegetables", "Dairy", "Meat"] },
  { name: "Health & Fitness", subcategories: ["Gym", "Medicine", "Doctor", "Lab Tests", "Sports"] },
  { name: "Insurance", subcategories: ["Health", "Life", "Vehicle", "Home"] },
  { name: "Other" },
  { name: "Savings & Investments", excludedFromSpend: true, subcategories: ["Equity", "Mutual Funds", "Gold", "Fixed Deposit", "PPF", "NPS", "Bonds", "Crypto", "Real Estate"] },
  { name: "Shopping", subcategories: ["Clothing", "Electronics", "Home & Kitchen", "Personal Care"] },
  { name: "Transfer", subcategories: ["Family", "Friends", "Self"] },
  { name: "Transportation", subcategories: ["Cab", "Auto", "Metro", "Bus", "Fuel", "Parking", "Toll"] },
  { name: "Travel", subcategories: ["Flights", "Hotels", "Trains", "Buses", "Packages"] },
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  let createdParents = 0;
  let createdSubcategories = 0;

  try {
    for (const category of DEFAULT_CATEGORIES) {
      let parentResult = await client.query(
        'SELECT id FROM "Category" WHERE name = $1 AND "parentId" IS NULL LIMIT 1',
        [category.name]
      );

      let parentId = parentResult.rows[0]?.id;
      if (!parentId) {
        parentId = randomUUID();
        // excluded_from_spend is set only on first insert; existing rows are
        // never updated so user toggles are preserved across deploys.
        await client.query(
          'INSERT INTO "Category" (id, name, "parentId", "excluded_from_spend") VALUES ($1, $2, $3, $4)',
          [parentId, category.name, null, category.excludedFromSpend === true]
        );
        createdParents += 1;
      }

      for (const subcategory of category.subcategories ?? []) {
        const existing = await client.query(
          'SELECT id FROM "Category" WHERE name = $1 AND "parentId" = $2 LIMIT 1',
          [subcategory, parentId]
        );

        if (existing.rowCount === 0) {
          await client.query(
            'INSERT INTO "Category" (id, name, "parentId") VALUES ($1, $2, $3)',
            [randomUUID(), subcategory, parentId]
          );
          createdSubcategories += 1;
        }
      }
    }

    console.log(
      `Category sync complete. Created ${createdParents} parent categories and ${createdSubcategories} subcategories.`
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
