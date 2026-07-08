import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalyticsPeriodSelector } from "@/components/analytics-period-selector";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AnalyticsPeriodSelector", () => {
  it("renders Monthly and Yearly toggle buttons", () => {
    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    expect(screen.getByText("Monthly")).toBeInTheDocument();
    expect(screen.getByText("Yearly")).toBeInTheDocument();
    expect(screen.getByText("Combined")).toBeInTheDocument();
  });

  it("updates category mode filter", async () => {
    const user = userEvent.setup();

    render(
      <AnalyticsPeriodSelector
        mode="monthly"
        categoryMode="combined"
          spendMode="spend"
        month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    const triggers = screen.getAllByRole("combobox");
    await user.click(triggers[0]);
    await user.click(screen.getByText("Parent Categories"));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("category_mode=parent")
    );
  });

  it("displays current month label in monthly mode", () => {
    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    const label = new Date(2026, 2).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("navigates to previous month when left arrow is clicked", async () => {
    const user = userEvent.setup();

    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    const buttons = screen.getAllByRole("button");
    const prevButton = buttons.find(
      (b) => !b.textContent?.includes("Monthly") && !b.textContent?.includes("Yearly")
    )!;
    await user.click(prevButton);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=1")
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("year=2026")
    );
  });

  it("wraps around to December of previous year from January", async () => {
    const user = userEvent.setup();

    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={0}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    const buttons = screen.getAllByRole("button");
    const prevButton = buttons.find(
      (b) => !b.textContent?.includes("Monthly") && !b.textContent?.includes("Yearly")
    )!;
    await user.click(prevButton);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("month=11")
    );
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("year=2025")
    );
  });

  it("disables forward navigation on current month", () => {
    const now = new Date();

    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={now.getMonth()}
        year={now.getFullYear()}
        availableYears={[now.getFullYear()]}
      />
    );

    const buttons = screen.getAllByRole("button");
    const navButtons = buttons.filter(
      (b) => !b.textContent?.includes("Monthly") && !b.textContent?.includes("Yearly")
    );
    const forwardButton = navButtons[navButtons.length - 1];
    expect(forwardButton).toBeDisabled();
  });

  it("switches mode when Yearly button is clicked", async () => {
    const user = userEvent.setup();

    render(
        <AnalyticsPeriodSelector
          mode="monthly"
          categoryMode="combined"
          spendMode="spend"
          month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    await user.click(screen.getByText("Yearly"));

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("view=yearly")
    );
  });

  it("shows year selector in yearly mode", () => {
    render(
        <AnalyticsPeriodSelector
          mode="yearly"
          categoryMode="combined"
          spendMode="spend"
          month={2}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    expect(screen.getByText("2026")).toBeInTheDocument();
  });

  it("disables forward navigation on current year in yearly mode", () => {
    const now = new Date();

    render(
        <AnalyticsPeriodSelector
          mode="yearly"
          categoryMode="combined"
          spendMode="spend"
          month={0}
        year={now.getFullYear()}
        availableYears={[now.getFullYear(), now.getFullYear() - 1]}
      />
    );

    const buttons = screen.getAllByRole("button");
    const navButtons = buttons.filter(
      (b) => !b.textContent?.includes("Monthly") && !b.textContent?.includes("Yearly")
    );
    const forwardButton = navButtons[navButtons.length - 1];
    expect(forwardButton).toBeDisabled();
  });

  it("navigates to previous year in yearly mode", async () => {
    const user = userEvent.setup();

    render(
        <AnalyticsPeriodSelector
          mode="yearly"
          categoryMode="combined"
          spendMode="spend"
          month={0}
        year={2026}
        availableYears={[2026, 2025]}
      />
    );

    const buttons = screen.getAllByRole("button");
    const navButtons = buttons.filter(
      (b) => !b.textContent?.includes("Monthly") && !b.textContent?.includes("Yearly")
    );
    await user.click(navButtons[0]);

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("year=2025")
    );
  });
});
