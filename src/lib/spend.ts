/**
 * "Tracked, not counted" spend classification.
 *
 * Categories can be flagged `excluded_from_spend` (e.g. Savings & Investments):
 * their transactions are recorded and visible, but never counted as expenses in
 * dashboard totals, budgets, analytics or insights — money moved to an excluded
 * category is a transfer to yourself, not consumption.
 *
 * Exclusion is derived at read time from the transaction's category NAME, so
 * recategorizing a transaction immediately moves it in/out of spend and user
 * toggles apply retroactively. Nothing is stamped on transaction rows.
 *
 * The exclusion set always comes from parent categories; a transaction filed
 * under a subcategory (e.g. "Equity") carries its parent's name in `category`,
 * so parent-level exclusion covers all its subcategories.
 */

export interface SpendClassifiable {
  category: string;
  is_cc_payment: boolean;
}

/**
 * Build the excluded-name set from category rows. Accepts anything that has
 * name/excluded_from_spend so both Prisma rows and DTOs work.
 */
export function excludedCategorySet(
  categories: { name: string; excluded_from_spend?: boolean | null }[]
): Set<string> {
  return new Set(
    categories.filter((c) => c.excluded_from_spend === true).map((c) => c.name)
  );
}

/**
 * Whether a transaction counts toward spend totals. CC bill payments and
 * excluded-category transactions are tracked but not counted.
 */
export function isCountedSpend(
  t: SpendClassifiable,
  excluded: ReadonlySet<string>
): boolean {
  return !t.is_cc_payment && !excluded.has(t.category);
}

/**
 * Whether a transaction belongs to the tracked-not-counted set (excluded
 * category). CC payments are NOT tracked — they are settlements, not outflows
 * of interest.
 */
export function isTrackedNotCounted(
  t: SpendClassifiable,
  excluded: ReadonlySet<string>
): boolean {
  return !t.is_cc_payment && excluded.has(t.category);
}
