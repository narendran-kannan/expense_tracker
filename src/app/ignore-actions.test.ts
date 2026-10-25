import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  txStore,
  ignoredStore,
  skippedEmailStore,
  categoryStore,
  markMessagesRead,
} = vi.hoisted(() => ({
  txStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn<(...args: any[]) => Promise<any>>(async () => []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create: vi.fn<(...args: any[]) => Promise<any>>(async () => ({})),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
  },
  ignoredStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn<(...args: any[]) => Promise<any>>(async () => []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete: vi.fn<(...args: any[]) => Promise<any>>(async () => ({})),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
  },
  skippedEmailStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
  },
  categoryStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
  },
  markMessagesRead: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: txStore,
    ignoredTransaction: ignoredStore,
    skippedEmail: skippedEmailStore,
    category: categoryStore,
  },
}));

vi.mock("@/lib/gmail", () => ({
  hasGmailCredentials: () => true,
  createGmailClient: () => ({}),
  markMessagesRead,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  bulkDeleteTransactions,
  deleteIgnoredTransaction,
  deleteTransaction,
  getIgnoredTransactions,
  restoreIgnoredTransaction,
} from "./actions";

function makeTx(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    amount: 100,
    merchant: "Swiggy",
    date: new Date("2026-03-01T00:00:00.000Z"),
    category: "Food",
    categoryId: null,
    subcategoryId: null,
    subcategoryRef: null,
    is_cc_payment: false,
    confidence_score: 1,
    needs_review: false,
    email_message_id: null,
    remarks: null,
    source: "manual",
    recoverable_amount: null,
    counterparty: null,
    recovery_status: null,
    group_id: null,
    is_emi: false,
    emi_tenure_months: null,
    emi_monthly_amount: null,
    emi_start_date: null,
    repayments: [],
    created_at: new Date("2026-03-01T00:00:00.000Z"),
    updated_at: new Date("2026-03-01T00:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  txStore.findMany.mockResolvedValue([]);
  txStore.findUnique.mockResolvedValue(null);
  txStore.create.mockResolvedValue({});
  txStore.deleteMany.mockResolvedValue({ count: 0 });
  txStore.updateMany.mockResolvedValue({ count: 0 });
  ignoredStore.createMany.mockResolvedValue({ count: 0 });
  ignoredStore.findUnique.mockResolvedValue(null);
  ignoredStore.findMany.mockResolvedValue([]);
  ignoredStore.delete.mockResolvedValue({});
  ignoredStore.deleteMany.mockResolvedValue({ count: 0 });
  skippedEmailStore.deleteMany.mockResolvedValue({ count: 0 });
  categoryStore.findFirst.mockResolvedValue(null);
  markMessagesRead.mockResolvedValue(undefined);
});

describe("deleteTransaction", () => {
  it("writes an ignore tombstone before deleting the row", async () => {
    txStore.findMany.mockResolvedValueOnce([
      makeTx("tx-1", { email_message_id: "msg-1" }),
    ]);
    txStore.deleteMany.mockResolvedValue({ count: 1 });

    await deleteTransaction("tx-1");

    expect(ignoredStore.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            email_message_id: "msg-1",
            amount: 100,
            merchant: "Swiggy",
            match_fingerprint: false,
            original_transaction_id: "tx-1",
          }),
        ],
      })
    );
    expect(txStore.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["tx-1"] } },
    });
    expect(skippedEmailStore.deleteMany).toHaveBeenCalledWith({
      where: { email_message_id: { in: ["msg-1"] } },
    });
    expect(markMessagesRead).toHaveBeenCalledWith({}, ["msg-1"]);
  });

  it("opts into fingerprint matching when asked", async () => {
    txStore.findMany.mockResolvedValueOnce([
      makeTx("tx-1", { email_message_id: "msg-1" }),
    ]);

    await deleteTransaction("tx-1", { matchFingerprint: true });

    const data = ignoredStore.createMany.mock.calls[0]?.[0]?.data;
    expect(data[0].match_fingerprint).toBe(true);
  });

  it("returns the deleted count for bulk deletes", async () => {
    txStore.findMany.mockResolvedValueOnce([makeTx("t1"), makeTx("t2")]);
    txStore.deleteMany.mockResolvedValue({ count: 2 });

    await expect(bulkDeleteTransactions(["t1", "t2"])).resolves.toBe(2);
  });
});

describe("restoreIgnoredTransaction", () => {
  it("recreates the transaction and its repayments from the snapshot", async () => {
    ignoredStore.findUnique.mockResolvedValue({
      id: "ign-1",
      email_message_id: "msg-1",
      amount: 100,
      merchant: "Swiggy",
      date: new Date("2026-03-01T00:00:00.000Z"),
      category: "Food",
      is_cc_payment: false,
      source: "email",
      snapshot: {
        id: "tx-1",
        amount: 100,
        merchant: "Swiggy",
        date: "2026-03-01T00:00:00.000Z",
        category: "Food",
        subcategory: "Delivery",
        is_cc_payment: false,
        confidence_score: 0.95,
        needs_review: false,
        remarks: null,
        source: "email",
        recoverable_amount: null,
        counterparty: null,
        recovery_status: null,
        group_id: null,
        is_emi: false,
        emi_tenure_months: null,
        emi_monthly_amount: null,
        emi_start_date: null,
        created_at: "2026-03-01T00:00:00.000Z",
        repayments: [
          {
            id: "rep-1",
            amount: 10,
            date: "2026-03-02T00:00:00.000Z",
            note: null,
            created_at: "2026-03-02T00:00:00.000Z",
          },
        ],
      },
    });
    categoryStore.findFirst
      .mockResolvedValueOnce({ id: "cat-food" })
      .mockResolvedValueOnce({ id: "sub-delivery" });

    await restoreIgnoredTransaction("ign-1");

    expect(txStore.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "tx-1",
        email_message_id: "msg-1",
        categoryId: "cat-food",
        subcategoryId: "sub-delivery",
        repayments: {
          create: [
            expect.objectContaining({
              id: "rep-1",
              amount: 10,
            }),
          ],
        },
      }),
    });
    expect(ignoredStore.delete).toHaveBeenCalledWith({
      where: { id: "ign-1" },
    });
  });

  it("refuses to restore when the email already has a transaction", async () => {
    ignoredStore.findUnique.mockResolvedValue({
      id: "ign-1",
      email_message_id: "msg-1",
      snapshot: null,
    });
    txStore.findUnique.mockResolvedValue({ id: "existing" });

    await expect(restoreIgnoredTransaction("ign-1")).rejects.toThrow(
      "already exists"
    );
    expect(txStore.create).not.toHaveBeenCalled();
  });

  it("permanently deletes from the ignored list", async () => {
    await deleteIgnoredTransaction("ign-1");
    expect(ignoredStore.delete).toHaveBeenCalledWith({
      where: { id: "ign-1" },
    });
  });
});

describe("getIgnoredTransactions", () => {
  it("adds days_left for the ignored list UI", async () => {
    ignoredStore.findMany.mockResolvedValue([
      {
        id: "ign-1",
        amount: 100,
        merchant: "Swiggy",
        date: new Date("2026-03-01T00:00:00.000Z"),
        category: "Food",
        is_cc_payment: false,
        match_fingerprint: true,
        source: "email",
        created_at: new Date(),
      },
    ]);

    const rows = await getIgnoredTransactions();

    expect(rows).toHaveLength(1);
    expect(rows[0].days_left).toBeGreaterThanOrEqual(0);
    expect(rows[0].days_left).toBeLessThanOrEqual(30);
  });
});
