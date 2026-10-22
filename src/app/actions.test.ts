import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseExpenseText } from "./actions";

vi.mock("@/lib/ai", () => ({
  extractionModel: vi.fn(() => "extraction-model"),
  insightsModel: vi.fn(() => "insights-model"),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(async () => ({
    object: {
      transactions: [
        {
          amount: 100,
          merchant: "Swiggy",
          date: "2026-03-31T00:00:00.000Z",
          category: "Food & Dining",
          subcategory: "Food Delivery",
          is_cc_payment: false,
          confidence_score: 0.95,
        },
      ],
    },
  })),
}));

vi.mock("@/lib/date-extraction", () => ({
  resolveTransactionDate: vi.fn((isoDate: string) => new Date(isoDate)),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: {
      findMany: vi.fn(async () => [
        {
          id: "1",
          name: "Food & Dining",
          parentId: null,
          children: [
            { id: "2", name: "Food Delivery", parentId: "1" },
            { id: "3", name: "Restaurants", parentId: "1" },
          ],
        },
        {
          id: "4",
          name: "Transport",
          parentId: null,
          children: [{ id: "5", name: "Cab", parentId: "4" }],
        },
      ]),
    },
  },
}));

describe("parseExpenseText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should parse natural expense text and return array", async () => {
    const results = await parseExpenseText("Spent Rs.100 at Swiggy today");

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      amount: 100,
      merchant: "Swiggy",
      date: expect.any(String),
      category: "Food & Dining",
      subcategory: "Food Delivery",
      is_cc_payment: false,
      confidence_score: 0.95,
    });
  });

  it("should return ISO date strings for all transactions", async () => {
    const results = await parseExpenseText("Spent Rs.100 at Swiggy today");
    expect(results[0].date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(new Date(results[0].date)).toBeInstanceOf(Date);
  });

  it("should handle multiple transactions in batch", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        transactions: [
          {
            amount: 100,
            merchant: "Swiggy",
            date: "2026-03-31T00:00:00.000Z",
            category: "Food & Dining",
            subcategory: "Food Delivery",
            is_cc_payment: false,
            confidence_score: 0.95,
          },
          {
            amount: 200,
            merchant: "BigBasket",
            date: "2026-03-31T00:00:00.000Z",
            category: "Shopping",
            subcategory: "Groceries",
            is_cc_payment: false,
            confidence_score: 0.9,
          },
        ],
      },
    } as never);

    const results = await parseExpenseText(
      "Rs.100 at Swiggy\nRs.200 at BigBasket"
    );

    expect(results).toHaveLength(2);
    expect(results[0].merchant).toBe("Swiggy");
    expect(results[1].merchant).toBe("BigBasket");
  });

  it("should handle multiple bank alert emails pasted together", async () => {
    const { generateObject } = await import("ai");
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        transactions: [
          {
            amount: 100,
            merchant: "Musk and Tusk",
            date: "2026-03-27T00:00:00.000Z",
            category: "Food & Dining",
            subcategory: "Restaurants",
            is_cc_payment: false,
            confidence_score: 0.92,
          },
          {
            amount: 250,
            merchant: "Amazon",
            date: "2026-03-28T00:00:00.000Z",
            category: "Shopping",
            subcategory: null,
            is_cc_payment: false,
            confidence_score: 0.88,
          },
        ],
      },
    } as never);

    const multipleEmails = `Dear Cardmember,

Transaction Successful! INR 100.00 spent on your Bank Credit Card ending XXXX at Musk and Tusk on 27 MAR 2026.

Available Limit: INR 99999.00.

Dear Cardmember,

Transaction Successful! INR 250.00 spent on your Bank Credit Card ending XXXX at Amazon on 28 MAR 2026.

Available Limit: INR 99749.00.`;

    const results = await parseExpenseText(multipleEmails);

    expect(results).toHaveLength(2);
    expect(results[0].merchant).toBe("Musk and Tusk");
    expect(results[0].amount).toBe(100);
    expect(results[1].merchant).toBe("Amazon");
    expect(results[1].amount).toBe(250);
  });
});
