export const RECOVERY_STATUS = {
  PENDING: "pending",
  PARTIAL: "partial",
  RECOVERED: "recovered",
  WRITTEN_OFF: "written_off",
} as const;

export type RecoveryStatus =
  (typeof RECOVERY_STATUS)[keyof typeof RECOVERY_STATUS];

export const RECOVERY_STATUS_VALUES: RecoveryStatus[] = [
  RECOVERY_STATUS.PENDING,
  RECOVERY_STATUS.PARTIAL,
  RECOVERY_STATUS.RECOVERED,
  RECOVERY_STATUS.WRITTEN_OFF,
];

export function isRecoveryStatus(value: unknown): value is RecoveryStatus {
  return (
    typeof value === "string" &&
    (RECOVERY_STATUS_VALUES as string[]).includes(value)
  );
}

import { isEmi, emiSpendForStartMonth, type EmiInput } from "./emi";

export interface RecoverableInput {
  amount: number;
  recoverable_amount: number | null;
  recovery_status: string | null;
  repayments?: { amount: number }[];
}

export function sumRepayments(repayments?: { amount: number }[]): number {
  if (!repayments || repayments.length === 0) return 0;
  return repayments.reduce((sum, r) => sum + r.amount, 0);
}

export function outstandingAmount(t: RecoverableInput): number {
  if (t.recoverable_amount == null) return 0;
  if (t.recovery_status === RECOVERY_STATUS.RECOVERED) return 0;
  if (t.recovery_status === RECOVERY_STATUS.WRITTEN_OFF) return 0;
  const remaining = t.recoverable_amount - sumRepayments(t.repayments);
  return Math.max(0, remaining);
}

/**
 * Effective spend for analytics/budgets: the portion of `amount` that is
 * "really" out-of-pocket for the user given recovery status.
 *
 * - Not recoverable: full amount.
 * - Recovered: amount minus the recoverable portion (0 when full amount was lent).
 * - Written off: amount minus what was already repaid (only the outstanding
 *   portion is abandoned; money already received stays received).
 * - Pending/partial: amount minus repayments so far, capped at [0, amount].
 *   If recoverable_amount < amount (only part of the spend was lent), the
 *   non-recoverable portion always counts; only the recoverable portion shrinks.
 */
export function effectiveSpend(t: RecoverableInput & EmiInput): number {
  // EMI purchases recognize only the start-month installment here; later
  // installments surface as virtual line items. EMI and recoverable are
  // mutually exclusive, so EMI takes precedence when both are somehow set.
  if (isEmi(t)) return emiSpendForStartMonth(t);
  if (t.recoverable_amount == null) return t.amount;
  if (t.recovery_status === RECOVERY_STATUS.RECOVERED) {
    return Math.max(0, t.amount - t.recoverable_amount);
  }
  const repaid = sumRepayments(t.repayments);
  const recoveredSoFar = Math.min(repaid, t.recoverable_amount);
  return Math.max(0, t.amount - recoveredSoFar);
}

export function computeRecoveryStatus(
  recoverableAmount: number,
  repaidTotal: number,
  currentStatus: RecoveryStatus | null
): RecoveryStatus {
  if (currentStatus === RECOVERY_STATUS.WRITTEN_OFF) {
    return RECOVERY_STATUS.WRITTEN_OFF;
  }
  if (repaidTotal >= recoverableAmount) return RECOVERY_STATUS.RECOVERED;
  if (repaidTotal > 0) return RECOVERY_STATUS.PARTIAL;
  return RECOVERY_STATUS.PENDING;
}
