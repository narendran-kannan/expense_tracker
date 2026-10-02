import { describe, it, expect, vi, beforeEach } from "vitest";

const { txStore, categoryStore } = vi.hoisted(() => ({
  txStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany: vi.fn<(...args: any[]) => Promise<any>>(async () => []),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    deleteMany: vi.fn<(...args: any[]) => Promise<any>>(async () => ({
      count: 0,
    })),
  },
  categoryStore: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findFirst: vi.fn<(...args: any[]) => Promise<any>>(async () => null),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: txStore,
    category: categoryStore,
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  bulkApproveTransactions,
  bulkDeleteTransactions,
  bulkUpdateTransactionCategory,
} from "./actions";
import { revalidatePath } from "next/cache";

beforeEach(() => {
  vi.clearAllMocks();
  txStore.findMany.mockResolvedValue([]);
  txStore.updateMany.mockResolvedValue({ count: 0 });
  txStore.deleteMany.mockResolvedValue({ count: 0 });
  categoryStore.findFirst.mockResolvedValue(null);
});

describe("bulk actions input validation", () => {
  it.each([
    ["bulkApproveTransactions", () => bulkApproveTransactions([])],
    ["bulkDeleteTransactions", () => bulkDeleteTransactions([""])],
    [
      "bulkUpdateTransactionCategory",
      () => bulkUpdateTransactionCategory([], { category: "Food" }),
    ],
  ])("%s rejects an empty selection", async (_name, call) => {
    await expect(call()).rejects.toThrow("Select at least one transaction");
    expect(txStore.updateMany).not.toHaveBeenCalled();
    expect(txStore.deleteMany).not.toHaveBeenCalled();
  });
});

describe("bulkUpdateTransactionCategory", () => {
  it("rejects a blank category", async () => {
    await expect(
      bulkUpdateTransactionCategory(["t1"], { category: "   " })
    ).rejects.toThrow("Category is required");
    expect(txStore.updateMany).not.toHaveBeenCalled();
  });

  it("resolves category ids once and updates every deduped id", async () => {
    categoryStore.findFirst
      .mockResolvedValueOnce({ id: "cat-food" })
      .mockResolvedValueOnce({ id: "sub-delivery" });
    txStore.updateMany.mockResolvedValue({ count: 2 });

    const count = await bulkUpdateTransactionCategory(["t1", "t2", "t1"], {
      category: "Food",
      subcategory: "Delivery",
    });

    expect(count).toBe(2);
    expect(categoryStore.findFirst).toHaveBeenCalledTimes(2);
    expect(txStore.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
      data: {
        category: "Food",
        categoryId: "cat-food",
        subcategoryId: "sub-delivery",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/tracked");
  });

  it("clears the subcategory when none is given", async () => {
    categoryStore.findFirst.mockResolvedValueOnce({ id: "cat-shop" });

    await bulkUpdateTransactionCategory(["t1"], { category: "Shopping" });

    expect(txStore.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1"] } },
      data: {
        category: "Shopping",
        categoryId: "cat-shop",
        subcategoryId: null,
      },
    });
  });
});

describe("bulkApproveTransactions", () => {
  it("only flips rows that still need review", async () => {
    txStore.updateMany.mockResolvedValue({ count: 1 });

    const count = await bulkApproveTransactions(["t1", "t2"]);

    expect(count).toBe(1);
    expect(txStore.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] }, needs_review: true },
      data: { needs_review: false },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });
});

describe("bulkDeleteTransactions", () => {
  it("deletes all ids in one query", async () => {
    txStore.deleteMany.mockResolvedValue({ count: 2 });

    const count = await bulkDeleteTransactions(["t1", "t2"]);

    expect(count).toBe(2);
    expect(txStore.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["t1", "t2"] } },
    });
  });

  it("dissolves each affected group left with one or fewer members", async () => {
    txStore.findMany
      .mockResolvedValueOnce([
        { group_id: "g1" },
        { group_id: "g1" },
        { group_id: "g2" },
        { group_id: null },
      ])
      .mockResolvedValueOnce([{ id: "survivor" }])
      .mockResolvedValueOnce([{ id: "a" }, { id: "b" }]);

    await bulkDeleteTransactions(["t1", "t2", "t3", "t4"]);

    expect(txStore.findMany).toHaveBeenCalledTimes(3);
    expect(txStore.updateMany).toHaveBeenCalledTimes(1);
    expect(txStore.updateMany).toHaveBeenCalledWith({
      where: { group_id: "g1" },
      data: { group_id: null },
    });
  });
});
