import { prisma } from "@/lib/prisma";

/**
 * Soft-deleted transactions ("Ignored"). A tombstone survives the transaction
 * delete so the 2-day overlapping Gmail search cannot re-import the same email.
 * Rows older than this are purged by the daily cron.
 */
export const IGNORED_RETENTION_DAYS = (() => {
  const raw = Number(process.env.IGNORED_RETENTION_DAYS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 30;
})();

const DAY_MS = 24 * 60 * 60 * 1000;

export function ignoredExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + IGNORED_RETENTION_DAYS * DAY_MS);
}

export function ignoredDayRange(date: Date): { gte: Date; lte: Date } {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { gte: start, lte: end };
}

export function ignoredDaysLeft(createdAt: Date, now = new Date()): number {
  return Math.max(
    0,
    Math.ceil((ignoredExpiresAt(createdAt).getTime() - now.getTime()) / DAY_MS)
  );
}

/** Delete tombstones that have outlived their retention window. */
export async function purgeExpiredIgnores(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - IGNORED_RETENTION_DAYS * DAY_MS);
  const { count } = await prisma.ignoredTransaction.deleteMany({
    where: { created_at: { lt: cutoff } },
  });
  return count;
}

export interface IgnoredRepaymentSnapshot {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

/** Everything needed to put a deleted transaction back exactly as it was. */
export interface IgnoredTransactionSnapshot {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string | null;
  is_cc_payment: boolean;
  confidence_score: number;
  needs_review: boolean;
  remarks: string | null;
  source: string;
  recoverable_amount: number | null;
  counterparty: string | null;
  recovery_status: string | null;
  group_id: string | null;
  is_emi: boolean;
  emi_tenure_months: number | null;
  emi_monthly_amount: number | null;
  emi_start_date: string | null;
  created_at: string;
  repayments: IgnoredRepaymentSnapshot[];
}

export interface SnapshotSource {
  id: string;
  amount: number;
  merchant: string;
  date: Date;
  category: string;
  subcategoryRef?: { name: string } | null;
  is_cc_payment: boolean;
  confidence_score: number;
  needs_review: boolean;
  remarks: string | null;
  source: string;
  recoverable_amount: number | null;
  counterparty: string | null;
  recovery_status: string | null;
  group_id: string | null;
  is_emi: boolean;
  emi_tenure_months: number | null;
  emi_monthly_amount: number | null;
  emi_start_date: Date | null;
  created_at: Date;
  repayments?: Array<{
    id: string;
    amount: number;
    date: Date;
    note: string | null;
    created_at: Date;
  }>;
}

export function toIgnoredSnapshot(tx: SnapshotSource): IgnoredTransactionSnapshot {
  return {
    id: tx.id,
    amount: tx.amount,
    merchant: tx.merchant,
    date: tx.date.toISOString(),
    category: tx.category,
    subcategory: tx.subcategoryRef?.name ?? null,
    is_cc_payment: tx.is_cc_payment,
    confidence_score: tx.confidence_score,
    needs_review: tx.needs_review,
    remarks: tx.remarks,
    source: tx.source,
    recoverable_amount: tx.recoverable_amount,
    counterparty: tx.counterparty,
    recovery_status: tx.recovery_status,
    group_id: tx.group_id,
    is_emi: tx.is_emi,
    emi_tenure_months: tx.emi_tenure_months,
    emi_monthly_amount: tx.emi_monthly_amount,
    emi_start_date: tx.emi_start_date?.toISOString() ?? null,
    created_at: tx.created_at.toISOString(),
    repayments: (tx.repayments ?? []).map((repayment) => ({
      id: repayment.id,
      amount: repayment.amount,
      date: repayment.date.toISOString(),
      note: repayment.note,
      created_at: repayment.created_at.toISOString(),
    })),
  };
}
