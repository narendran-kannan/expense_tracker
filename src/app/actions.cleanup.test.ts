import { describe, it, expect, vi, beforeEach } from "vitest";

const categoryFindMany = vi.fn();
const categoryFindUnique = vi.fn();
const categoryFindFirst = vi.fn();
const categoryUpdate = vi.fn();
const categoryDelete = vi.fn();
const categoryDeleteMany = vi.fn();
const transactionGroupBy = vi.fn();
const transactionUpdateMany = vi.fn(async () => ({ count: 0 }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findMany: categoryFindMany,
      findUnique: categoryFindUnique,
      findFirst: categoryFindFirst,
      update: categoryUpdate,
      delete: categoryDelete,
      deleteMany: categoryDeleteMany,
    },
    transaction: {
      groupBy: transactionGroupBy,
      updateMany: transactionUpdateMany,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  transactionUpdateMany.mockResolvedValue({ count: 0 });
});

describe("getCategoryStats", () => {
  it("returns counts, totals, orphans and stale count", async () => {
    categoryFindMany.mockResolvedValue([
      {
        id: "c1",
        name: "Food & Dining",
        parentId: null,
        children: [{ id: "s1", name: "Food Delivery", parentId: "c1" }],
      },
      { id: "c2", name: "Unused", parentId: null, children: [] },
    ]);
    transactionGroupBy
      .mockResolvedValueOnce([
        { categoryId: "c1", _count: { _all: 10 }, _sum: { amount: 5000 } },
      ])
      .mockResolvedValueOnce([
        { subcategoryId: "s1", _count: { _all: 4 }, _sum: { amount: 1200 } },
      ])
      .mockResolvedValueOnce([
        { category: "Investment", _count: { _all: 3 }, _sum: { amount: 900 } },
      ])
      .mockResolvedValueOnce([
        { categoryId: "c1", category: "Food", _count: { _all: 2 } },
        { categoryId: "c1", category: "Food & Dining", _count: { _all: 8 } },
      ]);

    const { getCategoryStats } = await import("./actions");
    const stats = await getCategoryStats();

    expect(stats.categories).toHaveLength(2);
    expect(stats.categories[0]).toMatchObject({
      name: "Food & Dining",
      count: 10,
      total: 5000,
    });
    expect(stats.categories[0].subcategories[0]).toMatchObject({
      name: "Food Delivery",
      count: 4,
      total: 1200,
    });
    expect(stats.categories[1]).toMatchObject({ name: "Unused", count: 0 });
    expect(stats.orphaned).toEqual([
      { category: "Investment", count: 3, total: 900 },
    ]);
    expect(stats.staleCount).toBe(2);
  });
});

describe("mergeCategory", () => {
  it("moves transactions, reparents subs, and deletes source", async () => {
    categoryFindUnique
      .mockResolvedValueOnce({
        id: "src",
        name: "Food",
        parentId: null,
        children: [{ id: "sub-a", name: "Delivery", parentId: "src" }],
      })
      .mockResolvedValueOnce({
        id: "tgt",
        name: "Food & Dining",
        parentId: null,
        children: [],
      });

    const { mergeCategory } = await import("./actions");
    await mergeCategory("src", "tgt");

    expect(categoryUpdate).toHaveBeenCalledWith({
      where: { id: "sub-a" },
      data: { parentId: "tgt" },
    });
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { categoryId: "src" },
      data: { categoryId: "tgt", category: "Food & Dining" },
    });
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { categoryId: null, category: "Food" },
      data: { categoryId: "tgt", category: "Food & Dining" },
    });
    expect(categoryDelete).toHaveBeenCalledWith({ where: { id: "src" } });
  });

  it("dedupes same-named subcategories into target's sub", async () => {
    categoryFindUnique
      .mockResolvedValueOnce({
        id: "src",
        name: "Food",
        parentId: null,
        children: [{ id: "sub-a", name: "delivery", parentId: "src" }],
      })
      .mockResolvedValueOnce({
        id: "tgt",
        name: "Food & Dining",
        parentId: null,
        children: [{ id: "sub-b", name: "Delivery", parentId: "tgt" }],
      });

    const { mergeCategory } = await import("./actions");
    await mergeCategory("src", "tgt");

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub-a" },
      data: { subcategoryId: "sub-b" },
    });
    expect(categoryDelete).toHaveBeenCalledWith({ where: { id: "sub-a" } });
    expect(categoryUpdate).not.toHaveBeenCalled();
  });

  it("rejects merging into itself", async () => {
    const { mergeCategory } = await import("./actions");
    await expect(mergeCategory("same", "same")).rejects.toThrow(
      "Cannot merge a category into itself"
    );
  });
});

describe("mergeSubcategory", () => {
  it("moves transactions to target sub and its parent", async () => {
    categoryFindUnique
      .mockResolvedValueOnce({ id: "sa", name: "Delivery", parentId: "p1" })
      .mockResolvedValueOnce({ id: "sb", name: "Food Delivery", parentId: "p2" })
      .mockResolvedValueOnce({ id: "p2", name: "Food & Dining", parentId: null });

    const { mergeSubcategory } = await import("./actions");
    await mergeSubcategory("sa", "sb");

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sa" },
      data: {
        subcategoryId: "sb",
        categoryId: "p2",
        category: "Food & Dining",
      },
    });
    expect(categoryDelete).toHaveBeenCalledWith({ where: { id: "sa" } });
  });
});

describe("deleteCategory", () => {
  it("reassigns transactions to the chosen target", async () => {
    categoryFindUnique.mockResolvedValueOnce({
      id: "del",
      name: "Old",
      parentId: null,
      children: [{ id: "sub-x", name: "X", parentId: "del" }],
    });
    categoryFindFirst.mockResolvedValueOnce({
      id: "tgt",
      name: "Shopping",
      parentId: null,
    });

    const { deleteCategory } = await import("./actions");
    await deleteCategory("del", "tgt");

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: {
        OR: [{ categoryId: "del" }, { subcategoryId: { in: ["sub-x"] } }],
      },
      data: {
        subcategoryId: null,
        categoryId: "tgt",
        category: "Shopping",
      },
    });
  });

  it("falls back to the Other category row when no target given", async () => {
    categoryFindUnique.mockResolvedValueOnce({
      id: "del",
      name: "Old",
      parentId: null,
      children: [],
    });
    categoryFindFirst.mockResolvedValueOnce({
      id: "other-id",
      name: "Other",
      parentId: null,
    });

    const { deleteCategory } = await import("./actions");
    await deleteCategory("del");

    expect(transactionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          subcategoryId: null,
          categoryId: "other-id",
          category: "Other",
        },
      })
    );
  });

  it("only clears subcategoryId when deleting a subcategory", async () => {
    categoryFindUnique.mockResolvedValueOnce({
      id: "sub",
      name: "Chips",
      parentId: "parent",
      children: [],
    });

    const { deleteCategory } = await import("./actions");
    await deleteCategory("sub");

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { subcategoryId: "sub" },
      data: { subcategoryId: null },
    });
    expect(categoryDelete).toHaveBeenCalledWith({ where: { id: "sub" } });
    expect(categoryDeleteMany).not.toHaveBeenCalled();
  });
});

describe("deleteEmptyCategories", () => {
  it("deletes only unused non-Other categories", async () => {
    categoryFindMany.mockResolvedValue([
      { id: "used", name: "Food", parentId: null, children: [] },
      { id: "empty", name: "Old Stuff", parentId: null, children: [] },
      { id: "other", name: "Other", parentId: null, children: [] },
      {
        id: "sub-used",
        name: "Parent",
        parentId: null,
        children: [{ id: "s1", name: "S", parentId: "sub-used" }],
      },
      { id: "legacy", name: "Investment", parentId: null, children: [] },
    ]);
    transactionGroupBy
      .mockResolvedValueOnce([{ categoryId: "used", _count: { _all: 5 } }])
      .mockResolvedValueOnce([{ subcategoryId: "s1", _count: { _all: 2 } }])
      .mockResolvedValueOnce([{ category: "investment", _count: { _all: 1 } }]);

    const { deleteEmptyCategories } = await import("./actions");
    const deleted = await deleteEmptyCategories();

    expect(deleted).toBe(1);
    expect(categoryDeleteMany).toHaveBeenCalledWith({
      where: { parentId: { in: ["empty"] } },
    });
    expect(categoryDeleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["empty"] } },
    });
  });
});

describe("syncLegacyCategoryStrings", () => {
  it("rewrites stale legacy strings per category", async () => {
    categoryFindMany.mockResolvedValue([
      { id: "c1", name: "Food & Dining", parentId: null },
      { id: "c2", name: "Shopping", parentId: null },
    ]);
    transactionUpdateMany
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 0 });

    const { syncLegacyCategoryStrings } = await import("./actions");
    const updated = await syncLegacyCategoryStrings();

    expect(updated).toBe(3);
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { categoryId: "c1", NOT: { category: "Food & Dining" } },
      data: { category: "Food & Dining" },
    });
  });
});

describe("assignOrphanedTransactions", () => {
  it("links orphans to the target category", async () => {
    categoryFindFirst.mockResolvedValueOnce({
      id: "tgt",
      name: "Savings & Investments",
      parentId: null,
    });
    transactionUpdateMany.mockResolvedValueOnce({ count: 7 });

    const { assignOrphanedTransactions } = await import("./actions");
    const count = await assignOrphanedTransactions("Investment", "tgt");

    expect(count).toBe(7);
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { categoryId: null, category: "Investment" },
      data: { categoryId: "tgt", category: "Savings & Investments" },
    });
  });
});
