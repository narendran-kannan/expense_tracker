import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InsightsCard } from "@/components/insights-card";
import type { Period } from "@/lib/insights-period";
import type { InsightResult } from "@/lib/insights-config";

vi.mock("@/app/actions", () => ({
  getInsights: vi.fn(),
}));

const monthPeriod: Period = { type: "month", year: 2026, month: 3 };

const baseStats = {
  period: { type: "month" as const, key: "2026-04", label: "April 2026" },
  totalSpend: 12000,
  txCount: 10,
  byCategory: [{ category: "Food", total: 8000, count: 6 }],
  topMerchants: [{ merchant: "Swiggy", total: 5000, count: 4 }],
  comparisonDeltas: [],
  anomalies: [],
  recurringCandidates: [],
  latestTxDate: "2026-04-28T00:00:00.000Z",
};

const cachedResult: InsightResult = {
  status: "ok",
  cached: true,
  stats: baseStats,
  insight: {
    summary: "April spending totalled ₹12,000.",
    trends: ["Food up 20%", "Transport down 5%"],
    anomalies: [
      { merchant: "Apollo", amount: 4820, reason: "3.1σ above category mean" },
    ],
    suggestions: ["Swiggy appears 4 times"],
    model: "google/gemini-3.5-flash-lite",
    generatedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  },
};

const freshResult: InsightResult = {
  ...cachedResult,
  cached: false,
  insight: {
    ...cachedResult.insight!,
    summary: "Freshly generated summary.",
    generatedAt: new Date().toISOString(),
  },
};

const notEnoughDataResult: InsightResult = {
  status: "not_enough_data",
  cached: false,
  stats: { ...baseStats, txCount: 2 },
  insight: null,
  reason: "not_enough_data",
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("InsightsCard — empty initial state", () => {
  it("shows the Generate button when no cached insight exists", () => {
    render(<InsightsCard period={monthPeriod} initial={null} />);

    expect(
      screen.getByRole("button", { name: /generate insights/i })
    ).toBeInTheDocument();
    expect(screen.queryByText(/cached/i)).not.toBeInTheDocument();
  });

  it("does not show Regenerate when no insight is present", () => {
    render(<InsightsCard period={monthPeriod} initial={null} />);

    expect(
      screen.queryByRole("button", { name: /regenerate/i })
    ).not.toBeInTheDocument();
  });

  it("calls getInsights without force when Generate is clicked", async () => {
    const { getInsights } = await import("@/app/actions");
    vi.mocked(getInsights).mockResolvedValueOnce(freshResult);
    const user = userEvent.setup();

    render(<InsightsCard period={monthPeriod} initial={null} />);
    await user.click(screen.getByRole("button", { name: /generate insights/i }));

    expect(getInsights).toHaveBeenCalledWith(monthPeriod, false);
  });

  it("renders the insight after Generate succeeds", async () => {
    const { getInsights } = await import("@/app/actions");
    vi.mocked(getInsights).mockResolvedValueOnce(freshResult);
    const user = userEvent.setup();

    render(<InsightsCard period={monthPeriod} initial={null} />);
    await user.click(screen.getByRole("button", { name: /generate insights/i }));

    expect(
      await screen.findByText("Freshly generated summary.")
    ).toBeInTheDocument();
  });

  it("displays an error message when generate throws", async () => {
    const { getInsights } = await import("@/app/actions");
    vi.mocked(getInsights).mockRejectedValueOnce(new Error("API down"));
    const user = userEvent.setup();

    render(<InsightsCard period={monthPeriod} initial={null} />);
    await user.click(screen.getByRole("button", { name: /generate insights/i }));

    expect(await screen.findByText("API down")).toBeInTheDocument();
  });
});

describe("InsightsCard — cached initial state", () => {
  it("renders cached summary, trends, anomalies, and suggestions", () => {
    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);

    expect(
      screen.getByText("April spending totalled ₹12,000.")
    ).toBeInTheDocument();
    expect(screen.getByText("Food up 20%")).toBeInTheDocument();
    expect(screen.getByText("Transport down 5%")).toBeInTheDocument();
    expect(screen.getByText("Apollo")).toBeInTheDocument();
    expect(screen.getByText(/3.1σ above category mean/)).toBeInTheDocument();
    expect(screen.getByText("Swiggy appears 4 times")).toBeInTheDocument();
  });

  it("shows the Regenerate button and the model name", () => {
    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);

    expect(
      screen.getByRole("button", { name: /regenerate/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/google\/gemini-3.5-flash-lite/)).toBeInTheDocument();
  });

  it("displays cache provenance metadata", () => {
    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);

    expect(screen.getByText(/Cached/)).toBeInTheDocument();
    expect(screen.getByText(/10 transactions/)).toBeInTheDocument();
  });

  it("calls getInsights with force=true when Regenerate is clicked", async () => {
    const { getInsights } = await import("@/app/actions");
    vi.mocked(getInsights).mockResolvedValueOnce(freshResult);
    const user = userEvent.setup();

    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);
    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    expect(getInsights).toHaveBeenCalledWith(monthPeriod, true);
  });

  it("updates the displayed summary after Regenerate", async () => {
    const { getInsights } = await import("@/app/actions");
    vi.mocked(getInsights).mockResolvedValueOnce(freshResult);
    const user = userEvent.setup();

    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);
    await user.click(screen.getByRole("button", { name: /regenerate/i }));

    expect(
      await screen.findByText("Freshly generated summary.")
    ).toBeInTheDocument();
  });
});

describe("InsightsCard — What was analyzed disclosure", () => {
  it("hides raw stats by default", () => {
    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);

    expect(screen.queryByText("By category")).not.toBeInTheDocument();
    expect(screen.queryByText("Top merchants")).not.toBeInTheDocument();
  });

  it("reveals raw stats when toggled", async () => {
    const user = userEvent.setup();
    render(<InsightsCard period={monthPeriod} initial={cachedResult} />);

    await user.click(
      screen.getByRole("button", { name: /what was analyzed/i })
    );

    expect(screen.getByText("By category")).toBeInTheDocument();
    expect(screen.getByText("Top merchants")).toBeInTheDocument();
    expect(screen.getByText("Overall")).toBeInTheDocument();
  });
});

describe("InsightsCard — not_enough_data state", () => {
  it("does not show Generate button when result indicates not_enough_data", () => {
    render(
      <InsightsCard period={monthPeriod} initial={notEnoughDataResult} />
    );

    expect(
      screen.getByText(/Not enough transactions/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate insights/i })
    ).not.toBeInTheDocument();
  });
});
