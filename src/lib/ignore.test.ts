import { describe, it, expect, vi, beforeEach } from "vitest";

const { ignoredDeleteMany } = vi.hoisted(() => ({
  ignoredDeleteMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ignoredTransaction: {
      deleteMany: ignoredDeleteMany,
    },
  },
}));

import {
  IGNORED_RETENTION_DAYS,
  ignoredDayRange,
  ignoredDaysLeft,
  ignoredExpiresAt,
  purgeExpiredIgnores,
  toIgnoredSnapshot,
} from "./ignore";

beforeEach(() => {
  vi.clearAllMocks();
  ignoredDeleteMany.mockResolvedValue({ count: 0 });
});

describe("ignored retention", () => {
  it("defaults to 30 days", () => {
    expect(IGNORED_RETENTION_DAYS).toBe(30);
  });

  it("computes the expiry from the deleted timestamp", () => {
    const created = new Date("2026-03-01T10:00:00.000Z");
    expect(ignoredExpiresAt(created).toISOString()).toBe(
      "2026-03-31T10:00:00.000Z"
    );
  });

  it("reports whole days left for the UI", () => {
    expect(
      ignoredDaysLeft(
        new Date("2026-03-01T10:00:00.000Z"),
        new Date("2026-03-21T10:00:00.000Z")
      )
    ).toBe(10);
  });

  it("purges rows older than the retention window", async () => {
    ignoredDeleteMany.mockResolvedValue({ count: 4 });

    const purged = await purgeExpiredIgnores(
      new Date("2026-03-31T00:00:00.000Z")
    );

    expect(purged).toBe(4);
    expect(ignoredDeleteMany).toHaveBeenCalledWith({
      where: { created_at: { lt: new Date("2026-03-01T00:00:00.000Z") } },
    });
  });

  it("covers the whole transaction day for fingerprint matching", () => {
    const { gte, lte } = ignoredDayRange(
      new Date("2026-03-01T14:30:00.000Z")
    );
    expect(gte.getHours()).toBe(0);
    expect(gte.getMinutes()).toBe(0);
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
  });
});

describe("toIgnoredSnapshot", () => {
  it("serializes dates and repayments so restore is lossless", () => {
    const snapshot = toIgnoredSnapshot({
      id: "tx-1",
      amount: 1200,
      merchant: "Amazon",
      date: new Date("2026-02-10T00:00:00.000Z"),
      category: "Shopping",
      subcategoryRef: { name: "Electronics" },
      is_cc_payment: false,
      confidence_score: 0.95,
      needs_review: false,
      remarks: null,
      source: "email",
      recoverable_amount: 200,
      counterparty: "Friend",
      recovery_status: "pending",
      group_id: "g1",
      is_emi: true,
      emi_tenure_months: 6,
      emi_monthly_amount: 200,
      emi_start_date: new Date("2026-02-10T00:00:00.000Z"),
      created_at: new Date("2026-02-11T00:00:00.000Z"),
      repayments: [
        {
          id: "rep-1",
          amount: 100,
          date: new Date("2026-02-20T00:00:00.000Z"),
          note: "partial",
          created_at: new Date("2026-02-20T00:00:00.000Z"),
        },
      ],
    });

    expect(snapshot.date).toBe("2026-02-10T00:00:00.000Z");
    expect(snapshot.subcategory).toBe("Electronics");
    expect(snapshot.emi_start_date).toBe("2026-02-10T00:00:00.000Z");
    expect(snapshot.repayments).toHaveLength(1);
    expect(snapshot.repayments[0].date).toBe("2026-02-20T00:00:00.000Z");
  });
});
