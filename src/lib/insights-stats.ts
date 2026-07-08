import { prisma } from "@/lib/prisma";
import { type Period, periodBounds } from "@/lib/insights-period";
import {
  computeStatsFromTransactions,
  type InsightStats,
  type InsightStatsTransaction,
} from "@/lib/insights-stats-pure";
import { expandTransactionsForRange } from "@/lib/emi";

const EMI_SELECT = {
  amount: true,
  merchant: true,
  category: true,
  date: true,
  is_cc_payment: true,
  needs_review: true,
  recoverable_amount: true,
  recovery_status: true,
  repayments: { select: { amount: true } },
  is_emi: true,
  emi_tenure_months: true,
  emi_monthly_amount: true,
  emi_start_date: true,
} as const;

/**
 * Fetch transactions whose effective spend touches [start, end]:
 * - rows actually dated within the range, plus
 * - EMI purchases that started before the range but whose installment window
 *   still overlaps it.
 * Then expand EMI rows into per-month installments clipped to the range.
 */
async function getSpreadTransactions(
  start: Date,
  end: Date
): Promise<InsightStatsTransaction[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      OR: [
        { date: { gte: start, lte: end } },
        { is_emi: true, emi_start_date: { lt: start } },
      ],
    },
    select: EMI_SELECT,
  });

  return expandTransactionsForRange(rows, start, end);
}

export type {
  InsightStats,
  InsightStatsTransaction,
  CategoryTotal,
  MerchantTotal,
  PeriodDelta,
  Anomaly,
  RecurringCandidate,
  MonthBreakdown,
} from "@/lib/insights-stats-pure";
export { computeStatsFromTransactions } from "@/lib/insights-stats-pure";

export async function computeInsightStats(
  period: Period
): Promise<InsightStats> {
  const { start, end, previousStart, previousEnd } = periodBounds(period);

  const [current, previous, excludedRows] = await Promise.all([
    getSpreadTransactions(start, end),
    getSpreadTransactions(previousStart, previousEnd),
    prisma.category.findMany({
      where: { parentId: null, excluded_from_spend: true },
      select: { name: true },
    }),
  ]);

  // Insights describe counted spend only; "tracked, not counted" categories
  // (e.g. Savings & Investments) are excluded to match dashboard/analytics.
  const excluded = new Set(excludedRows.map((r) => r.name));
  const counted = (rows: typeof current) =>
    rows.filter((t) => !excluded.has(t.category));

  return computeStatsFromTransactions(period, counted(current), counted(previous));
}
