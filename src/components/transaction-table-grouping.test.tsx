import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionTable } from "@/components/transaction-table";

vi.mock("@/app/actions", () => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  cloneTransaction: vi.fn(),
  markRecoverable: vi.fn(),
  groupTransactions: vi.fn(),
  ungroupAll: vi.fn(),
}));

const categories = [
  { name: "Transportation", subcategories: [] },
  { name: "Food & Dining", subcategories: [] },
];

const ungrouped = [
  {
    id: "labour",
    amount: 4500,
    merchant: "Car Service - Labour",
    date: "2026-06-27T00:00:00.000Z",
    category: "Transportation",
    is_cc_payment: false,
    confidence_score: 1,
    needs_review: false,
    remarks: null,
    group_id: null,
  },
  {
    id: "parts",
    amount: 3200,
    merchant: "Car Service - Parts",
    date: "2026-06-25T00:00:00.000Z",
    category: "Transportation",
    is_cc_payment: false,
    confidence_score: 1,
    needs_review: false,
    remarks: null,
    group_id: null,
  },
  {
    id: "swiggy",
    amount: 317,
    merchant: "SWIGGY IN",
    date: "2026-06-10T00:00:00.000Z",
    category: "Food & Dining",
    is_cc_payment: false,
    confidence_score: 1,
    needs_review: false,
    remarks: null,
    group_id: null,
  },
];

const grouped = [
  { ...ungrouped[0], group_id: "g1" },
  { ...ungrouped[1], group_id: "g1" },
  ungrouped[2],
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("TransactionTable selection mode", () => {
  it("shows checkboxes and a group button after entering selection mode", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={ungrouped} categories={categories} />
    );

    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Select$/ }));

    expect(
      screen.getByRole("checkbox", { name: /Select all visible/ })
    ).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(ungrouped.length + 1);
  });

  it("calls groupTransactions with the selected ids", async () => {
    const { groupTransactions } = await import("@/app/actions");
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={ungrouped} categories={categories} />
    );

    await user.click(screen.getByRole("button", { name: /^Select$/ }));
    await user.click(
      screen.getByRole("checkbox", {
        name: /Car Service - Labour/,
      })
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /Car Service - Parts/,
      })
    );

    await user.click(screen.getByRole("button", { name: /Group \(2\)/ }));

    expect(groupTransactions).toHaveBeenCalledTimes(1);
    expect(groupTransactions).toHaveBeenCalledWith(
      expect.arrayContaining(["labour", "parts"])
    );
    const ids = (groupTransactions as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string[];
    expect(ids).toHaveLength(2);
  });

  it("disables the group button until at least two rows are selected", async () => {
    const user = userEvent.setup();
    render(
      <TransactionTable transactions={ungrouped} categories={categories} />
    );

    await user.click(screen.getByRole("button", { name: /^Select$/ }));
    expect(screen.getByRole("button", { name: /^Group/ })).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /Car Service - Labour/ })
    );
    expect(screen.getByRole("button", { name: /^Group/ })).toBeDisabled();

    await user.click(
      screen.getByRole("checkbox", { name: /Car Service - Parts/ })
    );
    expect(screen.getByRole("button", { name: /Group \(2\)/ })).toBeEnabled();
  });
});

describe("TransactionTable grouped rollup", () => {
  it("collapses grouped rows into one summary row with the summed amount", () => {
    render(<TransactionTable transactions={grouped} categories={categories} />);

    expect(screen.getByText(/2 payments/)).toBeInTheDocument();
    expect(screen.getByText("₹7,700")).toBeInTheDocument();
    expect(screen.getByText(/Car Service - Labour \+1 more/)).toBeInTheDocument();
    expect(screen.queryByText("₹4,500")).not.toBeInTheDocument();
  });

  it("uses the earliest member date on the group summary row", () => {
    render(<TransactionTable transactions={grouped} categories={categories} />);

    expect(screen.getByText("25 Jun 2026")).toBeInTheDocument();
  });

  it("expands to reveal member transactions", async () => {
    const user = userEvent.setup();
    render(<TransactionTable transactions={grouped} categories={categories} />);

    expect(screen.queryByText("₹4,500")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Expand group/ }));

    expect(screen.getByText("₹4,500")).toBeInTheDocument();
    expect(screen.getByText("₹3,200")).toBeInTheDocument();
  });

  it("calls ungroupAll when the ungroup button is clicked", async () => {
    const { ungroupAll } = await import("@/app/actions");
    const user = userEvent.setup();
    render(<TransactionTable transactions={grouped} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /Ungroup/ }));

    expect(ungroupAll).toHaveBeenCalledWith("g1");
  });

  it("counts grouped members in the filtered total (display-only grouping)", () => {
    render(<TransactionTable transactions={grouped} categories={categories} />);

    expect(screen.getByText("₹8,017")).toBeInTheDocument();
  });
});
