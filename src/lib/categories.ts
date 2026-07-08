export interface CategoryDefinition {
  name: string;
  subcategories?: string[];
  /**
   * Default for the Category.excluded_from_spend flag, applied only when the
   * category row is first created. "Tracked, not counted": transactions in
   * these categories are recorded but never counted as expenses. Users can
   * toggle this per category later; sync never overrides their choice.
   */
  excludedFromSpend?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryDefinition[] = [
  { name: "ATM Withdrawal" },
  {
    name: "Bills & Utilities",
    subcategories: [
      "Electricity",
      "Water",
      "Gas",
      "Internet",
      "Mobile Recharge",
      "DTH",
      "Rent",
    ],
  },
  { name: "Credit Card Payment" },
  {
    name: "Education",
    subcategories: ["Courses", "Books", "Tuition", "Certifications"],
  },
  {
    name: "Entertainment",
    subcategories: ["Streaming", "Movies", "Gaming", "Events"],
  },
  {
    name: "Food & Dining",
    subcategories: ["Restaurants", "Delivery", "Cafe", "Street Food"],
  },
  {
    name: "Groceries",
    subcategories: ["Supermarket", "Vegetables", "Dairy", "Meat"],
  },
  {
    name: "Health & Fitness",
    subcategories: ["Gym", "Medicine", "Doctor", "Lab Tests", "Sports"],
  },
  {
    name: "Insurance",
    subcategories: ["Health", "Life", "Vehicle", "Home"],
  },
  { name: "Other" },
  {
    name: "Savings & Investments",
    excludedFromSpend: true,
    subcategories: [
      "Equity",
      "Mutual Funds",
      "Gold",
      "Fixed Deposit",
      "PPF",
      "NPS",
      "Bonds",
      "Crypto",
      "Real Estate",
    ],
  },
  {
    name: "Shopping",
    subcategories: ["Clothing", "Electronics", "Home & Kitchen", "Personal Care"],
  },
  {
    name: "Transfer",
    subcategories: ["Family", "Friends", "Self"],
  },
  {
    name: "Transportation",
    subcategories: ["Cab", "Auto", "Metro", "Bus", "Fuel", "Parking", "Toll"],
  },
  {
    name: "Travel",
    subcategories: ["Flights", "Hotels", "Trains", "Buses", "Packages"],
  },
];

export function getCategoryNames(): string[] {
  return DEFAULT_CATEGORIES.map((c) => c.name);
}

export function getSubcategories(categoryName: string): string[] {
  const category = DEFAULT_CATEGORIES.find((c) => c.name === categoryName);
  return category?.subcategories ?? [];
}

export function buildCategoryPromptText(
  categories: { name: string; subcategories: string[] }[]
): string {
  return categories
    .map((c) => {
      if (c.subcategories.length === 0) {
        return c.name;
      }
      return `${c.name} (subcategories: ${c.subcategories.join(", ")})`;
    })
    .join("\n");
}
