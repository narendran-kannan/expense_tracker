/**
 * Budget overage / carryover-debt handling.
 *
 * When a budget period (a month) closes over its limit, the overspend is a real
 * carry-forward liability the user pays down over time — regardless of who it is
 * owed to (family, a credit line, savings, or "future me"). This is the mirror
 * image of `recoverable.ts`: instead of money owed TO the user, it tracks money
 * the user owes because a month ran over budget.
 *
 * The overage amount is normally DERIVED live (`spent - budget`) so it stays
 * correct if the budget or transactions are edited retroactively. A manual
 * `override_amount` can pin it when the user knows the real figure differs.
 * Payments are logged independently and always persist.
 */

export const OVERAGE_STATUS = {
  OUTSTANDING: "outstanding",
  PARTIAL: "partial",
  SETTLED: "settled",
} as const;

export type OverageStatus =
  (typeof OVERAGE_STATUS)[keyof typeof OVERAGE_STATUS];

export const OVERAGE_STATUS_VALUES: OverageStatus[] = [
  OVERAGE_STATUS.OUTSTANDING,
  OVERAGE_STATUS.PARTIAL,
  OVERAGE_STATUS.SETTLED,
];

export function isOverageStatus(value: unknown): value is OverageStatus {
  return (
    typeof value === "string" &&
    (OVERAGE_STATUS_VALUES as string[]).includes(value)
  );
}

export interface OverageInput {
  /** Manual override; when set it wins over the derived amount. */
  override_amount: number | null;
  /** Budget for the period (derived source). */
  budget_amount: number;
  /** Effective spend for the period (derived source). */
  spent_amount: number;
  payments?: { amount: number }[];
}

/**
 * The gross overage for a period before any payments: the manual override when
 * set, otherwise `max(0, spent - budget)`. Never negative.
 */
export function grossOverage(t: {
  override_amount: number | null;
  budget_amount: number;
  spent_amount: number;
}): number {
  if (t.override_amount != null) return Math.max(0, t.override_amount);
  return Math.max(0, t.spent_amount - t.budget_amount);
}

export function sumPayments(payments?: { amount: number }[]): number {
  if (!payments || payments.length === 0) return 0;
  return payments.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * The amount still owed for a period: gross overage minus payments so far,
 * floored at 0.
 */
export function outstandingOverage(t: OverageInput): number {
  const gross = grossOverage(t);
  const remaining = gross - sumPayments(t.payments);
  return Math.max(0, remaining);
}

/**
 * Derive status from the gross overage and payments made.
 *
 * - No overage or fully paid: settled.
 * - Some payment but not full: partial.
 * - Overage exists with no payment: outstanding.
 *
 * A period with zero gross overage is always "settled" (nothing to owe).
 */
export function computeOverageStatus(
  grossAmount: number,
  paidTotal: number
): OverageStatus {
  if (grossAmount <= 0) return OVERAGE_STATUS.SETTLED;
  if (paidTotal >= grossAmount) return OVERAGE_STATUS.SETTLED;
  if (paidTotal > 0) return OVERAGE_STATUS.PARTIAL;
  return OVERAGE_STATUS.OUTSTANDING;
}

export interface AllocatableTarget {
  id: string;
  outstanding: number;
}

export interface Allocation {
  id: string;
  applied: number;
}

export interface WaterfallResult {
  allocations: Allocation[];
  totalApplied: number;
  leftover: number;
}

/**
 * Distribute a lump-sum `amount` across `targets` in the given order, filling
 * each target's outstanding balance before spilling into the next. Callers
 * decide the order (e.g. oldest month first).
 *
 * - Targets with outstanding <= 0 are skipped (never allocated to).
 * - Each allocation is capped at that target's outstanding balance.
 * - Only targets that actually receive a positive amount appear in the result.
 * - `leftover` is any portion of `amount` not needed (when the lump sum exceeds
 *   total outstanding); the excess is not allocated.
 *
 * Amounts are rounded to 2 decimals to avoid floating-point drift.
 */
export function allocateWaterfall(
  amount: number,
  targets: AllocatableTarget[]
): WaterfallResult {
  const round2 = (n: number) => Math.round(n * 100) / 100;

  let remaining = Math.max(0, round2(amount));
  const allocations: Allocation[] = [];

  for (const target of targets) {
    if (remaining <= 0) break;
    const owed = round2(target.outstanding);
    if (owed <= 0) continue;

    const applied = round2(Math.min(owed, remaining));
    if (applied <= 0) continue;

    allocations.push({ id: target.id, applied });
    remaining = round2(remaining - applied);
  }

  const totalApplied = round2(
    allocations.reduce((sum, a) => sum + a.applied, 0)
  );

  return { allocations, totalApplied, leftover: round2(remaining) };
}
