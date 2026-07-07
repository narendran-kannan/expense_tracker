import { describe, it, expect } from "vitest";
import {
  isEmi,
  emiStartMonth,
  defaultMonthlyAmount,
  installmentIndexForMonth,
  emiInstallmentForMonth,
  emiSpendForStartMonth,
  hasVirtualInstallmentForMonth,
  emiScheduleMonths,
  expandTransactionsForRange,
  emiEndMonth,
  emiInstallmentsPaid,
  emiProgress,
  emiSchedule,
  emiInstallmentDay,
  type EmiInput,
} from "./emi";

// A 60,000 phone on a 12-month no-cost EMI starting June 2026.
const phone: EmiInput = {
  amount: 60000,
  is_emi: true,
  emi_tenure_months: 12,
  emi_monthly_amount: 5000,
  emi_start_date: new Date(2026, 5, 15),
};

describe("isEmi", () => {
  it("is false when not flagged", () => {
    expect(isEmi({ amount: 1000 })).toBe(false);
    expect(isEmi({ amount: 1000, is_emi: false, emi_tenure_months: 6 })).toBe(
      false
    );
  });

  it("is false when tenure is missing or invalid", () => {
    expect(isEmi({ amount: 1000, is_emi: true })).toBe(false);
    expect(
      isEmi({ amount: 1000, is_emi: true, emi_tenure_months: 0 })
    ).toBe(false);
  });

  it("is true when flagged with a valid tenure", () => {
    expect(isEmi(phone)).toBe(true);
  });
});

describe("emiInstallmentDay", () => {
  it("uses the EMI start date's day, not the transaction date", () => {
    expect(
      emiInstallmentDay({
        amount: 1000,
        is_emi: true,
        emi_tenure_months: 6,
        emi_start_date: new Date(2026, 7, 8), // 8 Aug
        date: new Date(2026, 6, 7), // created 7 Jul
      })
    ).toBe(8);
  });

  it("falls back to the transaction date when no EMI start date", () => {
    expect(emiInstallmentDay({ amount: 1000, date: new Date(2026, 6, 7) })).toBe(
      7
    );
  });

  it("falls back to 1 when nothing is set", () => {
    expect(emiInstallmentDay({ amount: 1000 })).toBe(1);
  });
});

describe("emiStartMonth", () => {
  it("uses emi_start_date when present", () => {
    expect(emiStartMonth(phone)).toEqual({ month: 5, year: 2026 });
  });

  it("falls back to transaction date", () => {
    expect(
      emiStartMonth({ amount: 100, date: new Date(2025, 0, 3) })
    ).toEqual({ month: 0, year: 2025 });
  });
});

describe("defaultMonthlyAmount", () => {
  it("splits evenly", () => {
    expect(defaultMonthlyAmount(60000, 12)).toBe(5000);
  });

  it("rounds to 2 decimals", () => {
    expect(defaultMonthlyAmount(10000, 3)).toBe(3333.33);
  });

  it("returns full amount for tenure < 1", () => {
    expect(defaultMonthlyAmount(5000, 0)).toBe(5000);
  });
});

describe("installmentIndexForMonth", () => {
  it("returns 0 for the start month", () => {
    expect(installmentIndexForMonth(phone, 5, 2026)).toBe(0);
  });

  it("returns the right index mid-tenure (crossing year boundary)", () => {
    // Jun 2026 = 0 ... Jan 2027 = 7
    expect(installmentIndexForMonth(phone, 0, 2027)).toBe(7);
    // May 2027 = 11 (last installment)
    expect(installmentIndexForMonth(phone, 4, 2027)).toBe(11);
  });

  it("returns -1 before the window", () => {
    expect(installmentIndexForMonth(phone, 4, 2026)).toBe(-1);
  });

  it("returns -1 after the window", () => {
    expect(installmentIndexForMonth(phone, 5, 2027)).toBe(-1);
  });

  it("returns -1 when not an EMI", () => {
    expect(installmentIndexForMonth({ amount: 100 }, 5, 2026)).toBe(-1);
  });
});

describe("emiInstallmentForMonth", () => {
  it("returns the monthly amount within the window", () => {
    expect(emiInstallmentForMonth(phone, 5, 2026)).toBe(5000);
    expect(emiInstallmentForMonth(phone, 0, 2027)).toBe(5000);
  });

  it("returns 0 outside the window", () => {
    expect(emiInstallmentForMonth(phone, 4, 2026)).toBe(0);
    expect(emiInstallmentForMonth(phone, 5, 2027)).toBe(0);
  });

  it("schedule sums to the original amount (even split)", () => {
    let total = 0;
    for (let i = 0; i < 12; i++) {
      const month = (5 + i) % 12;
      const year = 2026 + Math.floor((5 + i) / 12);
      total += emiInstallmentForMonth(phone, month, year);
    }
    expect(total).toBe(60000);
  });

  it("last installment absorbs rounding remainder", () => {
    // 10000 over 3 months: 3333.33 + 3333.33 + 3333.34 = 10000
    const t: EmiInput = {
      amount: 10000,
      is_emi: true,
      emi_tenure_months: 3,
      emi_monthly_amount: 3333.33,
      emi_start_date: new Date(2026, 0, 1),
    };
    expect(emiInstallmentForMonth(t, 0, 2026)).toBe(3333.33);
    expect(emiInstallmentForMonth(t, 1, 2026)).toBe(3333.33);
    expect(emiInstallmentForMonth(t, 2, 2026)).toBeCloseTo(3333.34, 2);

    let total = 0;
    for (let i = 0; i < 3; i++) total += emiInstallmentForMonth(t, i, 2026);
    expect(total).toBeCloseTo(10000, 2);
  });

  it("falls back to even split when monthly amount unset", () => {
    const t: EmiInput = {
      amount: 12000,
      is_emi: true,
      emi_tenure_months: 6,
      emi_start_date: new Date(2026, 2, 1),
    };
    expect(emiInstallmentForMonth(t, 2, 2026)).toBe(2000);
  });

  it("returns 0 for non-EMI transactions", () => {
    expect(emiInstallmentForMonth({ amount: 5000 }, 5, 2026)).toBe(0);
  });
});

describe("emiSpendForStartMonth", () => {
  it("returns one installment for an EMI", () => {
    expect(emiSpendForStartMonth(phone)).toBe(5000);
  });

  it("returns the full amount for a non-EMI", () => {
    expect(emiSpendForStartMonth({ amount: 5000 })).toBe(5000);
  });
});

describe("hasVirtualInstallmentForMonth", () => {
  it("is false for the start month (the real row represents it)", () => {
    expect(hasVirtualInstallmentForMonth(phone, 5, 2026)).toBe(false);
  });

  it("is true for later installments", () => {
    expect(hasVirtualInstallmentForMonth(phone, 6, 2026)).toBe(true);
    expect(hasVirtualInstallmentForMonth(phone, 4, 2027)).toBe(true);
  });

  it("is false outside the window", () => {
    expect(hasVirtualInstallmentForMonth(phone, 5, 2027)).toBe(false);
  });
});

describe("emiScheduleMonths", () => {
  it("returns all tenure months in order, crossing year boundary", () => {
    const months = emiScheduleMonths(phone);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual({ month: 5, year: 2026, index: 0 });
    expect(months[7]).toEqual({ month: 0, year: 2027, index: 7 });
    expect(months[11]).toEqual({ month: 4, year: 2027, index: 11 });
  });

  it("is empty for non-EMI", () => {
    expect(emiScheduleMonths({ amount: 100 })).toEqual([]);
  });
});

describe("expandTransactionsForRange", () => {
  it("passes non-EMI rows through unchanged", () => {
    const row = {
      amount: 1200,
      date: new Date(2026, 5, 10),
      merchant: "Swiggy",
    };
    const out = expandTransactionsForRange(
      [row],
      new Date(2026, 5, 1),
      new Date(2026, 5, 30, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(row);
  });

  it("emits one installment per EMI month within the range", () => {
    const emiRow = {
      ...phone,
      date: new Date(2026, 5, 15),
      merchant: "Croma",
    };
    // June–August 2026 window
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2026, 5, 1),
      new Date(2026, 7, 31, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.amount)).toEqual([5000, 5000, 5000]);
    expect(out.map((r) => r.date.getMonth())).toEqual([5, 6, 7]);
  });

  it("clears EMI flags so amounts are not re-spread downstream", () => {
    const emiRow = { ...phone, date: new Date(2026, 5, 15), merchant: "Croma" };
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2026, 5, 1),
      new Date(2026, 5, 30, 23, 59, 59, 999)
    );
    expect(out[0].is_emi).toBe(false);
    expect(out[0].emi_tenure_months).toBeNull();
  });

  it("dates installments by the EMI start day, not the creation date", () => {
    // Created 7 Jul, but EMI starts 8 Aug — installment must land on the 8th.
    const emiRow = {
      amount: 12000,
      is_emi: true,
      emi_tenure_months: 6,
      emi_monthly_amount: 2000,
      emi_start_date: new Date(2026, 7, 8), // 8 Aug
      date: new Date(2026, 6, 7), // created 7 Jul
      merchant: "Dell",
    };
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2026, 7, 1),
      new Date(2026, 7, 31, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(1);
    expect(out[0].date.getDate()).toBe(8);
    expect(out[0].date.getMonth()).toBe(7); // August
  });

  it("includes installments for an EMI that started before the range", () => {
    const emiRow = { ...phone, date: new Date(2026, 5, 15), merchant: "Croma" };
    // Range = Jan 2027 only; installment index 7 falls here.
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2027, 0, 1),
      new Date(2027, 0, 31, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(5000);
    expect(out[0].date.getFullYear()).toBe(2027);
    expect(out[0].date.getMonth()).toBe(0);
  });

  it("excludes installments outside the range", () => {
    const emiRow = { ...phone, date: new Date(2026, 5, 15), merchant: "Croma" };
    // Range entirely after the 12-month window.
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2028, 0, 1),
      new Date(2028, 11, 31, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(0);
  });

  it("spread installments sum to the original amount across the full window", () => {
    const emiRow = { ...phone, date: new Date(2026, 5, 15), merchant: "Croma" };
    const out = expandTransactionsForRange(
      [emiRow],
      new Date(2026, 0, 1),
      new Date(2027, 11, 31, 23, 59, 59, 999)
    );
    const total = out.reduce((s, r) => s + r.amount, 0);
    expect(total).toBe(60000);
  });
});

describe("emiEndMonth", () => {
  it("returns the last installment month", () => {
    // Jun 2026 start, 12 months -> May 2027
    expect(emiEndMonth(phone)).toEqual({ month: 4, year: 2027 });
  });
});

describe("emiInstallmentsPaid", () => {
  it("is 0 before the start month", () => {
    expect(emiInstallmentsPaid(phone, new Date(2026, 4, 30))).toBe(0);
  });

  it("counts the start month as 1 once it begins", () => {
    expect(emiInstallmentsPaid(phone, new Date(2026, 5, 1))).toBe(1);
  });

  it("counts elapsed installments mid-tenure", () => {
    // Aug 2026 -> Jun,Jul,Aug = 3
    expect(emiInstallmentsPaid(phone, new Date(2026, 7, 15))).toBe(3);
  });

  it("clamps to tenure after the window ends", () => {
    expect(emiInstallmentsPaid(phone, new Date(2030, 0, 1))).toBe(12);
  });

  it("is 0 for a non-EMI", () => {
    expect(emiInstallmentsPaid({ amount: 100 })).toBe(0);
  });
});

describe("emiProgress", () => {
  it("reports paid/remaining counts and amounts mid-tenure", () => {
    const p = emiProgress(phone, new Date(2026, 7, 15)); // 3 of 12 paid
    expect(p.tenure).toBe(12);
    expect(p.monthly).toBe(5000);
    expect(p.paidCount).toBe(3);
    expect(p.remainingCount).toBe(9);
    expect(p.paidAmount).toBe(15000);
    expect(p.remainingAmount).toBe(45000);
    expect(p.start).toEqual({ month: 5, year: 2026 });
    expect(p.end).toEqual({ month: 4, year: 2027 });
    expect(p.complete).toBe(false);
  });

  it("marks complete when all installments have elapsed", () => {
    const p = emiProgress(phone, new Date(2027, 11, 1));
    expect(p.paidCount).toBe(12);
    expect(p.remainingCount).toBe(0);
    expect(p.paidAmount).toBe(60000);
    expect(p.remainingAmount).toBe(0);
    expect(p.complete).toBe(true);
  });
});

describe("emiSchedule", () => {
  it("returns tenure entries flagged paid/upcoming", () => {
    const s = emiSchedule(phone, new Date(2026, 7, 15)); // 3 paid
    expect(s).toHaveLength(12);
    expect(s[0]).toMatchObject({ installmentNumber: 1, month: 5, year: 2026, amount: 5000, paid: true });
    expect(s[2]).toMatchObject({ installmentNumber: 3, paid: true });
    expect(s[3]).toMatchObject({ installmentNumber: 4, paid: false });
    expect(s[11]).toMatchObject({ installmentNumber: 12, month: 4, year: 2027, paid: false });
  });

  it("schedule amounts sum to the original amount", () => {
    const total = emiSchedule(phone).reduce((sum, e) => sum + e.amount, 0);
    expect(total).toBe(60000);
  });
});
