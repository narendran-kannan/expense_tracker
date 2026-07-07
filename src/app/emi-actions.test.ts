import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { txStore, repaymentStore } = vi.hoisted(() => ({
  txStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn<(...args: any[]) => Promise<any>>(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: vi.fn<(...args: any[]) => Promise<any>>(async () => ({})),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn<(...args: any[]) => Promise<any>>(async () => []),
  },
  repaymentStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: txStore,
    repayment: repaymentStore,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  markAsEmi,
  unmarkEmi,
  getEmis,
  getEmiInstallmentsForMonth,
  getSpreadTransactionsForRange,
} from "./actions";

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx1",
    amount: 60000,
    merchant: "Croma",
    date: new Date(2026, 6, 7), // created 7 Jul 2026
    category: "Shopping",
    is_cc_payment: false,
    is_emi: false,
    emi_tenure_months: null as number | null,
    emi_monthly_amount: null as number | null,
    emi_start_date: null as Date | null,
    recoverable_amount: null as number | null,
    counterparty: null as string | null,
    recovery_status: null as string | null,
    subcategoryRef: null as { name: string } | null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txStore.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("markAsEmi", () => {
  it("rejects a tenure below 2 months", async () => {
    await expect(
      markAsEmi("tx1", { tenureMonths: 1 })
    ).rejects.toThrow("EMI tenure must be at least 2 months");
    expect(txStore.update).not.toHaveBeenCalled();
  });

  it("rejects a non-finite tenure", async () => {
    await expect(
      markAsEmi("tx1", { tenureMonths: NaN })
    ).rejects.toThrow("EMI tenure must be at least 2 months");
  });

  it("throws when the transaction does not exist", async () => {
    txStore.findUnique.mockResolvedValue(null);
    await expect(markAsEmi("missing", { tenureMonths: 6 })).rejects.toThrow(
      "Transaction not found"
    );
  });

  it("refuses to convert a credit card payment", async () => {
    txStore.findUnique.mockResolvedValue(makeTx({ is_cc_payment: true }));
    await expect(markAsEmi("tx1", { tenureMonths: 6 })).rejects.toThrow(
      "Credit card payments cannot be converted to EMI"
    );
    expect(txStore.update).not.toHaveBeenCalled();
  });

  it("defaults monthly amount to an even split when not provided", async () => {
    txStore.findUnique.mockResolvedValue(makeTx({ amount: 60000 }));
    await markAsEmi("tx1", { tenureMonths: 12 });
    const data = txStore.update.mock.calls[0][0].data;
    expect(data.emi_monthly_amount).toBe(5000);
    expect(data.emi_tenure_months).toBe(12);
    expect(data.is_emi).toBe(true);
  });

  it("honors an explicit monthly amount", async () => {
    txStore.findUnique.mockResolvedValue(makeTx({ amount: 60000 }));
    await markAsEmi("tx1", { tenureMonths: 12, monthlyAmount: 5300 });
    const data = txStore.update.mock.calls[0][0].data;
    expect(data.emi_monthly_amount).toBe(5300);
  });

  it("truncates a fractional tenure", async () => {
    txStore.findUnique.mockResolvedValue(makeTx());
    await markAsEmi("tx1", { tenureMonths: 6.9 });
    const data = txStore.update.mock.calls[0][0].data;
    expect(data.emi_tenure_months).toBe(6);
  });

  it("moves the transaction date to the EMI start date", async () => {
    txStore.findUnique.mockResolvedValue(makeTx({ date: new Date(2026, 6, 7) }));
    await markAsEmi("tx1", {
      tenureMonths: 6,
      startDate: "2026-08-08T00:00:00.000Z",
    });
    const data = txStore.update.mock.calls[0][0].data;
    expect(new Date(data.emi_start_date).toISOString()).toBe(
      "2026-08-08T00:00:00.000Z"
    );
    // The row's own date must follow the EMI start date so it lands in the
    // right month (regression guard for the "shows in creation month" bug).
    expect(new Date(data.date).toISOString()).toBe(
      "2026-08-08T00:00:00.000Z"
    );
  });

  it("falls back to the transaction date when no start date is given", async () => {
    const txDate = new Date(2026, 6, 7);
    txStore.findUnique.mockResolvedValue(makeTx({ date: txDate }));
    await markAsEmi("tx1", { tenureMonths: 6 });
    const data = txStore.update.mock.calls[0][0].data;
    expect(new Date(data.emi_start_date).getTime()).toBe(txDate.getTime());
    expect(new Date(data.date).getTime()).toBe(txDate.getTime());
  });

  it("clears recoverable tracking (mutually exclusive)", async () => {
    txStore.findUnique.mockResolvedValue(
      makeTx({
        recoverable_amount: 20000,
        counterparty: "Ravi",
        recovery_status: "pending",
      })
    );
    await markAsEmi("tx1", { tenureMonths: 6 });
    const data = txStore.update.mock.calls[0][0].data;
    expect(data.recoverable_amount).toBeNull();
    expect(data.counterparty).toBeNull();
    expect(data.recovery_status).toBeNull();
  });

  it("deletes any existing repayments", async () => {
    txStore.findUnique.mockResolvedValue(makeTx());
    await markAsEmi("tx1", { tenureMonths: 6 });
    expect(repaymentStore.deleteMany).toHaveBeenCalledWith({
      where: { transaction_id: "tx1" },
    });
  });
});

describe("unmarkEmi", () => {
  it("clears every EMI field", async () => {
    await unmarkEmi("tx1");
    const data = txStore.update.mock.calls[0][0].data;
    expect(data).toEqual({
      is_emi: false,
      emi_tenure_months: null,
      emi_monthly_amount: null,
      emi_start_date: null,
    });
  });
});

describe("getEmis", () => {
  beforeEach(() => {
    // Freeze "now" mid-tenure: Aug 2026 -> 3 of 12 paid for a Jun start.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 15));
  });

  it("maps progress, labels and schedule for an EMI", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "phone",
        amount: 60000,
        merchant: "Croma",
        is_emi: true,
        emi_tenure_months: 12,
        emi_monthly_amount: 5000,
        emi_start_date: new Date(2026, 5, 15),
        date: new Date(2026, 5, 15),
        subcategoryRef: { name: "Electronics" },
      }),
    ]);

    const [emi] = await getEmis();
    expect(emi.tenureMonths).toBe(12);
    expect(emi.monthlyAmount).toBe(5000);
    expect(emi.paidCount).toBe(3);
    expect(emi.remainingCount).toBe(9);
    expect(emi.paidAmount).toBe(15000);
    expect(emi.remainingAmount).toBe(45000);
    expect(emi.startLabel).toBe("Jun 2026");
    expect(emi.endLabel).toBe("May 2027");
    expect(emi.complete).toBe(false);
    expect(emi.subcategory).toBe("Electronics");
    expect(emi.schedule).toHaveLength(12);
    expect(emi.schedule[0]).toMatchObject({
      installmentNumber: 1,
      label: "Jun 2026",
      paid: true,
    });
    expect(emi.schedule[11]).toMatchObject({
      installmentNumber: 12,
      label: "May 2027",
      paid: false,
    });
  });

  it("sorts active EMIs before completed ones, newest first", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "done",
        emi_start_date: new Date(2025, 0, 1),
        date: new Date(2025, 0, 1),
        is_emi: true,
        emi_tenure_months: 6,
        emi_monthly_amount: 1000,
        amount: 6000,
      }),
      makeTx({
        id: "activeOld",
        emi_start_date: new Date(2026, 5, 1),
        date: new Date(2026, 5, 1),
        is_emi: true,
        emi_tenure_months: 12,
        emi_monthly_amount: 1000,
        amount: 12000,
      }),
      makeTx({
        id: "activeNew",
        emi_start_date: new Date(2026, 7, 1),
        date: new Date(2026, 7, 1),
        is_emi: true,
        emi_tenure_months: 12,
        emi_monthly_amount: 1000,
        amount: 12000,
      }),
    ]);

    const emis = await getEmis();
    expect(emis.map((e) => e.id)).toEqual(["activeNew", "activeOld", "done"]);
    expect(emis.find((e) => e.id === "done")?.complete).toBe(true);
  });

  it("only queries EMI rows", async () => {
    await getEmis();
    expect(txStore.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { is_emi: true } })
    );
  });
});

describe("getEmiInstallmentsForMonth", () => {
  it("emits an installment dated by the EMI start day, not the creation date", async () => {
    // Created 7 Jul, EMI starts 8 Aug. September = installment 2, day 8.
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "tv",
        amount: 36000,
        merchant: "Sony TV",
        is_emi: true,
        emi_tenure_months: 6,
        emi_monthly_amount: 6000,
        emi_start_date: new Date(2026, 7, 8),
        date: new Date(2026, 6, 7),
      }),
    ]);

    const out = await getEmiInstallmentsForMonth(8, 2026); // September
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(6000);
    expect(out[0].installmentNumber).toBe(2);
    expect(out[0].tenureMonths).toBe(6);
    expect(out[0].sourceId).toBe("tv");
    const d = new Date(out[0].date);
    expect(d.getDate()).toBe(8);
    expect(d.getMonth()).toBe(8); // September
  });

  it("excludes the start month (represented by the real row)", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "tv",
        amount: 36000,
        is_emi: true,
        emi_tenure_months: 6,
        emi_monthly_amount: 6000,
        emi_start_date: new Date(2026, 7, 8),
        date: new Date(2026, 7, 8),
      }),
    ]);
    // Query the start month itself: no virtual installment expected.
    const out = await getEmiInstallmentsForMonth(7, 2026); // August
    expect(out).toHaveLength(0);
  });

  it("excludes months past the tenure window", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "tv",
        amount: 36000,
        is_emi: true,
        emi_tenure_months: 6,
        emi_monthly_amount: 6000,
        emi_start_date: new Date(2026, 7, 8),
        date: new Date(2026, 7, 8),
      }),
    ]);
    // Feb 2027 is installment 7 of a 6-month EMI -> out of range.
    const out = await getEmiInstallmentsForMonth(1, 2027);
    expect(out).toHaveLength(0);
  });

  it("queries only EMIs that started before the month", async () => {
    await getEmiInstallmentsForMonth(8, 2026);
    const where = txStore.findMany.mock.calls[0][0].where;
    expect(where.is_emi).toBe(true);
    expect(where.emi_start_date.lt).toEqual(new Date(2026, 8, 1));
  });
});

describe("getSpreadTransactionsForRange", () => {
  it("spreads an EMI into per-month installments within the range", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({
        id: "phone",
        amount: 60000,
        is_emi: true,
        emi_tenure_months: 12,
        emi_monthly_amount: 5000,
        emi_start_date: new Date(2026, 5, 15),
        date: new Date(2026, 5, 15),
        categoryRef: null,
        repayments: [],
      }),
    ]);

    const out = await getSpreadTransactionsForRange(
      new Date(2026, 5, 1),
      new Date(2026, 7, 31, 23, 59, 59, 999)
    );
    // Jun, Jul, Aug -> 3 installments of 5000 each, EMI flags cleared.
    expect(out).toHaveLength(3);
    expect(out.every((r) => r.amount === 5000)).toBe(true);
    expect(out.every((r) => r.is_emi === false)).toBe(true);
  });

  it("passes non-EMI rows through unchanged", async () => {
    txStore.findMany.mockResolvedValue([
      makeTx({ id: "swiggy", amount: 450, is_emi: false, repayments: [] }),
    ]);
    const out = await getSpreadTransactionsForRange(
      new Date(2026, 6, 1),
      new Date(2026, 6, 31, 23, 59, 59, 999)
    );
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(450);
  });
});
