/**
 * EMI (Equated Monthly Installment) handling.
 *
 * When a purchase is made on a credit-card EMI, the bank records the FULL amount
 * as a single debit in the purchase month. That spikes one month's spend even
 * though the cost is really paid down monthly (and folded into the CC bill).
 *
 * Like `recoverable.ts`/`effectiveSpend`, this module does NOT create real debit
 * rows. Instead it RECOGNIZES the original purchase's cost spread evenly across
 * the tenure:
 *
 * - The original transaction's effective spend in its start month = 1 installment.
 * - Months 2..N are surfaced as VIRTUAL installment line items (computed, never
 *   stored), so future/past months reflect committed EMI spend.
 * - The actual CC bill payment stays excluded (`is_cc_payment`), so each rupee is
 *   counted exactly once: as recognized EMI spend, never as the CC settlement.
 *
 * v1 spreads only the original `amount` (no-cost / interest-agnostic). The schedule
 * always sums to `amount`; the final installment absorbs any rounding remainder.
 */

export interface EmiInput {
  amount: number;
  is_emi?: boolean | null;
  emi_tenure_months?: number | null;
  emi_monthly_amount?: number | null;
  emi_start_date?: string | Date | null;
  date?: string | Date | null;
}

export function isEmi(t: EmiInput): boolean {
  return (
    t.is_emi === true &&
    typeof t.emi_tenure_months === "number" &&
    t.emi_tenure_months >= 1
  );
}

/**
 * The month an EMI schedule starts from. Falls back to the transaction date.
 * Returns a {month: 0-11, year} pair.
 */
export function emiStartMonth(t: EmiInput): { month: number; year: number } {
  const raw = t.emi_start_date ?? t.date ?? new Date();
  const d = raw instanceof Date ? raw : new Date(raw);
  return { month: d.getMonth(), year: d.getFullYear() };
}

/**
 * The day-of-month each installment lands on, taken from the EMI start date (not
 * the transaction creation date). Falls back to the transaction date, then 1.
 */
export function emiInstallmentDay(t: EmiInput): number {
  const raw = t.emi_start_date ?? t.date ?? null;
  if (raw == null) return 1;
  const d = raw instanceof Date ? raw : new Date(raw);
  return d.getDate();
}

/**
 * Default no-cost monthly installment: amount / tenure. Used to pre-fill the UI.
 */
export function defaultMonthlyAmount(amount: number, tenure: number): number {
  if (tenure < 1) return amount;
  return Math.round((amount / tenure) * 100) / 100;
}

/**
 * Zero-based index of the installment that falls in (month, year), or -1 if the
 * given month is outside the EMI window.
 *
 * Installment 0 is the start month, 1 the next month, etc.
 */
export function installmentIndexForMonth(
  t: EmiInput,
  month: number,
  year: number
): number {
  if (!isEmi(t)) return -1;
  const tenure = t.emi_tenure_months as number;
  const start = emiStartMonth(t);
  const index = (year - start.year) * 12 + (month - start.month);
  if (index < 0 || index >= tenure) return -1;
  return index;
}

/**
 * The rupee amount this EMI transaction contributes to (month, year).
 *
 * Every installment uses `emi_monthly_amount` (or the even split when unset),
 * EXCEPT the final installment, which absorbs the remainder so the schedule sums
 * to exactly `amount`. Returns 0 when the month is outside the EMI window or the
 * transaction is not an EMI.
 */
export function emiInstallmentForMonth(
  t: EmiInput,
  month: number,
  year: number
): number {
  const index = installmentIndexForMonth(t, month, year);
  if (index === -1) return 0;

  const tenure = t.emi_tenure_months as number;
  const monthly =
    typeof t.emi_monthly_amount === "number" && t.emi_monthly_amount > 0
      ? t.emi_monthly_amount
      : defaultMonthlyAmount(t.amount, tenure);

  const isLast = index === tenure - 1;
  if (!isLast) {
    return Math.max(0, monthly);
  }

  // Final installment absorbs rounding drift so the total equals `amount`.
  const priorTotal = monthly * (tenure - 1);
  const remainder = t.amount - priorTotal;
  return Math.max(0, Math.round(remainder * 100) / 100);
}

/**
 * Effective spend contribution of an EMI transaction in its OWN row's month
 * (i.e. the start month). This is what `effectiveSpend` should use instead of the
 * full amount for EMI transactions.
 */
export function emiSpendForStartMonth(t: EmiInput): number {
  if (!isEmi(t)) return t.amount;
  const start = emiStartMonth(t);
  return emiInstallmentForMonth(t, start.month, start.year);
}

/**
 * Whether a virtual installment line item should be emitted for (month, year):
 * true for every installment EXCEPT the start month (which is represented by the
 * real transaction row itself).
 */
export function hasVirtualInstallmentForMonth(
  t: EmiInput,
  month: number,
  year: number
): boolean {
  const index = installmentIndexForMonth(t, month, year);
  return index > 0;
}

/**
 * Iterate the (month, year) pairs an EMI schedule covers, in order.
 */
export function emiScheduleMonths(
  t: EmiInput
): { month: number; year: number; index: number }[] {
  if (!isEmi(t)) return [];
  const tenure = t.emi_tenure_months as number;
  const start = emiStartMonth(t);
  const out: { month: number; year: number; index: number }[] = [];
  for (let i = 0; i < tenure; i++) {
    const month = (start.month + i) % 12;
    const year = start.year + Math.floor((start.month + i) / 12);
    out.push({ month, year, index: i });
  }
  return out;
}

/**
 * The final (month, year) an EMI schedule covers.
 */
export function emiEndMonth(t: EmiInput): { month: number; year: number } {
  const tenure = isEmi(t) ? (t.emi_tenure_months as number) : 1;
  const start = emiStartMonth(t);
  const totalMonths = start.month + (tenure - 1);
  return { month: totalMonths % 12, year: start.year + Math.floor(totalMonths / 12) };
}

export interface EmiScheduleEntry {
  index: number;
  installmentNumber: number;
  month: number;
  year: number;
  amount: number;
  paid: boolean;
}

/**
 * How many installments have elapsed as of `asOf` (default: now). An installment
 * counts as paid once its month has started (i.e. asOf is in or past that month).
 * Clamped to [0, tenure].
 */
export function emiInstallmentsPaid(t: EmiInput, asOf: Date = new Date()): number {
  if (!isEmi(t)) return 0;
  const tenure = t.emi_tenure_months as number;
  const start = emiStartMonth(t);
  const elapsed =
    (asOf.getFullYear() - start.year) * 12 + (asOf.getMonth() - start.month) + 1;
  return Math.max(0, Math.min(tenure, elapsed));
}

export interface EmiProgress {
  tenure: number;
  monthly: number;
  paidCount: number;
  remainingCount: number;
  paidAmount: number;
  remainingAmount: number;
  start: { month: number; year: number };
  end: { month: number; year: number };
  complete: boolean;
}

/**
 * Time-based progress of an EMI: how many installments have elapsed, how much has
 * been recognized so far, and how much remains. Amounts are derived from the
 * schedule so the last-installment rounding remainder is respected.
 */
export function emiProgress(t: EmiInput, asOf: Date = new Date()): EmiProgress {
  const tenure = isEmi(t) ? (t.emi_tenure_months as number) : 0;
  const monthly =
    typeof t.emi_monthly_amount === "number" && t.emi_monthly_amount > 0
      ? t.emi_monthly_amount
      : defaultMonthlyAmount(t.amount, Math.max(1, tenure));
  const paidCount = emiInstallmentsPaid(t, asOf);
  const schedule = emiSchedule(t, asOf);
  const paidAmount = schedule
    .filter((e) => e.paid)
    .reduce((s, e) => s + e.amount, 0);
  return {
    tenure,
    monthly,
    paidCount,
    remainingCount: Math.max(0, tenure - paidCount),
    paidAmount: Math.round(paidAmount * 100) / 100,
    remainingAmount: Math.round((t.amount - paidAmount) * 100) / 100,
    start: emiStartMonth(t),
    end: emiEndMonth(t),
    complete: paidCount >= tenure,
  };
}

/**
 * Full month-by-month schedule for an EMI, each entry flagged paid/upcoming
 * relative to `asOf` (default: now).
 */
export function emiSchedule(t: EmiInput, asOf: Date = new Date()): EmiScheduleEntry[] {
  if (!isEmi(t)) return [];
  const paidCount = emiInstallmentsPaid(t, asOf);
  return emiScheduleMonths(t).map(({ month, year, index }) => ({
    index,
    installmentNumber: index + 1,
    month,
    year,
    amount: emiInstallmentForMonth(t, month, year),
    paid: index < paidCount,
  }));
}

/**
 * Expand a list of transactions for an inclusive [start, end] date range, with
 * EMI purchases spread into per-month installments.
 *
 * - Non-EMI rows pass through unchanged (callers are expected to have queried by
 *   the same range).
 * - EMI rows are replaced by one entry per installment month that overlaps the
 *   range. Each entry carries the installment amount and a synthetic date placed
 *   inside the installment month, so downstream grouping/charts attribute the
 *   spend to the right month. The original lump-sum amount is never emitted.
 *
 * Generic over the row shape so both analytics and insights can reuse it; the
 * returned entries preserve all original fields except `amount` and `date`.
 */
export function expandTransactionsForRange<
  T extends EmiInput & { date: Date },
>(rows: T[], start: Date, end: Date): T[] {
  const out: T[] = [];
  for (const row of rows) {
    if (!isEmi(row)) {
      out.push(row);
      continue;
    }
    const baseDay = emiInstallmentDay(row);
    for (const { month, year } of emiScheduleMonths(row)) {
      const installmentDate = new Date(year, month, Math.min(baseDay, 28));
      if (installmentDate < start || installmentDate > end) continue;
      const amount = emiInstallmentForMonth(row, month, year);
      if (amount <= 0) continue;
      // Emit a plain entry: the installment amount is final, so clear the EMI
      // flags to prevent downstream effectiveSpend from re-spreading it.
      out.push({
        ...row,
        amount,
        date: installmentDate,
        is_emi: false,
        emi_tenure_months: null,
        emi_monthly_amount: null,
        emi_start_date: null,
      });
    }
  }
  return out;
}
