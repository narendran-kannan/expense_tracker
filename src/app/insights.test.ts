import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  transactionFindMany,
  categoryFindMany,
  insightFindUnique,
  insightUpsert,
  generateObjectMock,
  revalidatePathMock,
  googleMock,
} = vi.hoisted(() => ({
  transactionFindMany: vi.fn(),
  categoryFindMany: vi.fn().mockResolvedValue([]),
  insightFindUnique: vi.fn(),
  insightUpsert: vi.fn(),
  generateObjectMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  googleMock: vi.fn(() => "gemini-2.5-pro"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    transaction: { findMany: transactionFindMany },
    category: { findMany: categoryFindMany },
    insight: { findUnique: insightFindUnique, upsert: insightUpsert },
  },
}));

vi.mock("@ai-sdk/google", () => ({
  google: googleMock,
}));

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { getInsights, getCachedInsight } from "./actions";
import type { Period } from "@/lib/insights-period";

const monthPeriod: Period = { type: "month", year: 2026, month: 3 };
const yearPeriod: Period = { type: "year", year: 2026 };

function makeTransactions(count: number, opts?: { latest?: Date }) {
  const latest = opts?.latest ?? new Date(2026, 3, 28);
  return Array.from({ length: count }, (_, i) => ({
    amount: 100 + i * 10,
    merchant: i % 2 === 0 ? "Swiggy" : "Uber",
    category: i % 2 === 0 ? "Food & Dining" : "Transport",
    date: i === count - 1 ? latest : new Date(2026, 3, 1 + i),
    is_cc_payment: false,
    needs_review: false,
  }));
}

const llmOutput = {
  summary: "Spending up vs last month.",
  trends: ["Food up 20%"],
  anomalies: [],
  suggestions: ["Swiggy appears often"],
};

beforeEach(() => {
  vi.clearAllMocks();
  generateObjectMock.mockResolvedValue({ object: llmOutput });
  insightUpsert.mockImplementation(async ({ create, update }) => ({
    id: "insight-1",
    period_type: monthPeriod.type,
    period_key: "2026-04",
    month: monthPeriod.month,
    year: monthPeriod.year,
    summary: (create ?? update).summary,
    trends: (create ?? update).trends,
    anomalies: (create ?? update).anomalies,
    suggestions: (create ?? update).suggestions,
    model: "gemini-2.5-pro",
    updated_at: new Date("2026-04-30T10:00:00Z"),
    tx_count_at_generation: (create ?? update).tx_count_at_generation,
    tx_latest_at_generation: (create ?? update).tx_latest_at_generation,
    stats: (create ?? update).stats,
  }));
});

describe("getInsights — empty / not_enough_data", () => {
  it("returns not_enough_data when fewer than 5 transactions and does NOT call the LLM", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(3));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    const result = await getInsights(monthPeriod);

    expect(result.status).toBe("not_enough_data");
    expect(result.insight).toBeNull();
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(insightUpsert).not.toHaveBeenCalled();
  });

  it("returns not_enough_data when no transactions at all", async () => {
    transactionFindMany.mockResolvedValueOnce([]);
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    const result = await getInsights(monthPeriod);

    expect(result.status).toBe("not_enough_data");
    expect(generateObjectMock).not.toHaveBeenCalled();
  });
});

describe("getInsights — fresh generation", () => {
  it("calls the LLM and upserts when no cache exists", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    const result = await getInsights(monthPeriod);

    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(insightUpsert).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    expect(result.cached).toBe(false);
    expect(result.insight?.summary).toBe(llmOutput.summary);
    expect(revalidatePathMock).toHaveBeenCalledWith("/analytics");
  });

  it("upserts with the correct period_key and month for a month period", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    const call = insightUpsert.mock.calls[0][0];
    expect(call.where.period_type_period_key).toEqual({
      period_type: "month",
      period_key: "2026-04",
    });
    expect(call.create.period_type).toBe("month");
    expect(call.create.period_key).toBe("2026-04");
    expect(call.create.month).toBe(3);
    expect(call.create.year).toBe(2026);
    expect(call.create.model).toBe("gemini-2.5-pro");
  });

  it("upserts with null month and year-only key for a year period", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(yearPeriod);

    const call = insightUpsert.mock.calls[0][0];
    expect(call.where.period_type_period_key).toEqual({
      period_type: "year",
      period_key: "2026",
    });
    expect(call.create.month).toBeNull();
    expect(call.create.year).toBe(2026);
  });

  it("stores tx_count_at_generation and tx_latest_at_generation matching the stats", async () => {
    const latest = new Date(2026, 3, 28);
    transactionFindMany.mockResolvedValueOnce(makeTransactions(7, { latest }));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    const call = insightUpsert.mock.calls[0][0];
    expect(call.create.tx_count_at_generation).toBe(7);
    expect(call.create.tx_latest_at_generation).toEqual(latest);
  });
});

describe("getInsights — cache", () => {
  const latest = new Date(2026, 3, 28);
  const cachedRow = {
    id: "insight-1",
    period_type: "month",
    period_key: "2026-04",
    month: 3,
    year: 2026,
    stats: {},
    summary: "cached summary",
    trends: ["cached trend"],
    anomalies: [],
    suggestions: [],
    model: "gemini-2.5-pro",
    tx_count_at_generation: 7,
    tx_latest_at_generation: latest,
    updated_at: new Date("2026-04-28T12:00:00Z"),
    created_at: new Date("2026-04-28T12:00:00Z"),
  };

  it("returns cached result without calling LLM when txCount and latestTx match", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(7, { latest }));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(cachedRow);

    const result = await getInsights(monthPeriod);

    expect(result.cached).toBe(true);
    expect(result.insight?.summary).toBe("cached summary");
    expect(generateObjectMock).not.toHaveBeenCalled();
    expect(insightUpsert).not.toHaveBeenCalled();
  });

  it("regenerates when txCount has changed", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(8, { latest }));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(cachedRow);

    const result = await getInsights(monthPeriod);

    expect(result.cached).toBe(false);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(insightUpsert).toHaveBeenCalledTimes(1);
  });

  it("regenerates when latestTxDate has changed", async () => {
    const newerLatest = new Date(2026, 3, 30);
    transactionFindMany.mockResolvedValueOnce(
      makeTransactions(7, { latest: newerLatest })
    );
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(cachedRow);

    const result = await getInsights(monthPeriod);

    expect(result.cached).toBe(false);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
  });

  it("regenerates when force=true even if cache is fresh", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(7, { latest }));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(cachedRow);

    const result = await getInsights(monthPeriod, true);

    expect(result.cached).toBe(false);
    expect(generateObjectMock).toHaveBeenCalledTimes(1);
    expect(insightUpsert).toHaveBeenCalledTimes(1);
  });
});

describe("getCachedInsight", () => {
  it("returns null when no cache row exists", async () => {
    insightFindUnique.mockResolvedValueOnce(null);

    const result = await getCachedInsight(monthPeriod);

    expect(result).toBeNull();
    expect(transactionFindMany).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("returns cached insight without calling LLM or computing stats", async () => {
    insightFindUnique.mockResolvedValueOnce({
      id: "insight-1",
      period_type: "month",
      period_key: "2026-04",
      month: 3,
      year: 2026,
      stats: { totalSpend: 1000, txCount: 5 },
      summary: "cached",
      trends: ["t1"],
      anomalies: [],
      suggestions: ["s1"],
      model: "gemini-2.5-pro",
      tx_count_at_generation: 5,
      tx_latest_at_generation: new Date(),
      updated_at: new Date("2026-04-28T12:00:00Z"),
      created_at: new Date("2026-04-28T12:00:00Z"),
    });

    const result = await getCachedInsight(monthPeriod);

    expect(result?.cached).toBe(true);
    expect(result?.insight?.summary).toBe("cached");
    expect(transactionFindMany).not.toHaveBeenCalled();
    expect(generateObjectMock).not.toHaveBeenCalled();
  });

  it("queries with the correct period key", async () => {
    insightFindUnique.mockResolvedValueOnce(null);

    await getCachedInsight(monthPeriod);

    expect(insightFindUnique).toHaveBeenCalledWith({
      where: {
        period_type_period_key: {
          period_type: "month",
          period_key: "2026-04",
        },
      },
    });
  });
});

describe("getInsights — output clamping", () => {
  it("trims model output to the configured limits before storing", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    generateObjectMock.mockResolvedValueOnce({
      object: {
        summary: "test",
        trends: ["t1", "t2", "t3", "t4", "t5", "t6", "t7"],
        anomalies: [],
        suggestions: ["s1", "s2", "s3", "s4", "s5"],
      },
    });

    const result = await getInsights(monthPeriod);

    expect(result.insight?.trends).toHaveLength(5);
    expect(result.insight?.suggestions).toHaveLength(3);

    const upsertCall = insightUpsert.mock.calls[0][0];
    expect(upsertCall.create.trends).toHaveLength(5);
    expect(upsertCall.create.suggestions).toHaveLength(3);
  });
});

describe("getInsights — prompt construction", () => {
  it("includes the period label and previous-period label in the prompt", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    const call = generateObjectMock.mock.calls[0][0];
    expect(call.prompt).toMatch(/April 2026/);
    expect(call.prompt).toMatch(/March 2026/);
  });

  it("includes the stats JSON in the prompt so the LLM has aggregates", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    const call = generateObjectMock.mock.calls[0][0];
    expect(call.prompt).toMatch(/"totalSpend"/);
    expect(call.prompt).toMatch(/"byCategory"/);
    expect(call.prompt).toMatch(/"topMerchants"/);
  });

  it("includes explicit per-array length limits in the prompt", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    const call = generateObjectMock.mock.calls[0][0];
    expect(call.prompt).toMatch(/trends: 5 items max/);
    expect(call.prompt).toMatch(/anomalies: 5 items max/);
    expect(call.prompt).toMatch(/suggestions: 3 items max/);
  });

  it("uses gemini-2.5-pro model", async () => {
    transactionFindMany.mockResolvedValueOnce(makeTransactions(10));
    transactionFindMany.mockResolvedValueOnce([]);
    insightFindUnique.mockResolvedValueOnce(null);

    await getInsights(monthPeriod);

    expect(googleMock).toHaveBeenCalledWith("gemini-2.5-pro");
  });
});
