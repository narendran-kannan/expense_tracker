import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TransactionTable } from "@/components/transaction-table";

vi.mock("@/app/actions", () => ({
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
  cloneTransaction: vi.fn(),
  markRecoverable: vi.fn(),
  groupTransactions: vi.fn(),
  ungroupAll: vi.fn(),
  createCategory: vi.fn(),
  bulkApproveTransactions: vi.fn(async () => 0),
  bulkDeleteTransactions: vi.fn(async () => 0),
  bulkUpdateTransactionCategory: vi.fn(async () => 0),
}));

const categories = [
  { name: "Food", subcategories: [{ id: "s1", name: "Delivery" }] },
  { name: "Shopping", subcategories: [] },
  { name: "Savings & Investments", subcategories: [] },
];

const base = {
  is_cc_payment: false,
  confidence_score: 1,
  remarks: null,
  group_id: null,
};

const transactions = [
  {
    ...base,
    id: "t1",
    amount: 500,
    merchant: "Swiggy",
    date: "2026-03-01T00:00:00.000Z",
    category: "Food",
    needs_review: true,
  },
  {
    ...base,
    id: "t2",
    amount: 2500,
    merchant: "Amazon",
    date: "2026-03-02T00:00:00.000Z",
    category: "Shopping",
    needs_review: false,
  },
  {
    ...base,
    id: "t3",
    amount: 1200,
    merchant: "Zepto",
    date: "2026-03-03T00:00:00.000Z",
    category: "Food",
    needs_review: true,
  },
];

function idsFrom(mockFn: unknown): string[] {
  return (mockFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string[];
}

async function enterSelectMode() {
  const user = userEvent.setup();
  render(
    <TransactionTable transactions={transactions} categories={categories} />
  );
  await user.click(screen.getByRole("button", { name: /^Select$/ }));
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("TransactionTable bulk select", () => {
  it("disables bulk actions until something is selected", async () => {
    await enterSelectMode();

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Approve/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Set category/ })).toBeDisabled();
    expect(screen.getByText("Delete").closest("button")).toBeDisabled();
  });

  it("selects and clears every visible row from the header checkbox", async () => {
    const user = await enterSelectMode();
    const selectAll = screen.getByRole("checkbox", {
      name: /Select all visible/,
    });

    await user.click(selectAll);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(selectAll).toHaveAttribute("data-state", "checked");

    await user.click(selectAll);
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("shows the header checkbox as indeterminate on a partial selection", async () => {
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Swiggy/ }));

    expect(
      screen.getByRole("checkbox", { name: /Select all visible/ })
    ).toHaveAttribute("data-state", "indeterminate");
  });

  it("only acts on selected rows that match the current filters", async () => {
    const { bulkDeleteTransactions } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(
      screen.getByRole("checkbox", { name: /Select all visible/ })
    );
    await user.type(screen.getByLabelText("Search transactions"), "amazon");

    expect(screen.getByText("1 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Delete \(1\)/ }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      })
    );

    expect(idsFrom(bulkDeleteTransactions)).toEqual(["t2"]);
  });
});

describe("TransactionTable bulk approve", () => {
  it("approves only the selected rows that need review", async () => {
    const { bulkApproveTransactions } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(
      screen.getByRole("checkbox", { name: /Select all visible/ })
    );
    await user.click(screen.getByRole("button", { name: /^Approve \(2\)/ }));

    expect(bulkApproveTransactions).toHaveBeenCalledTimes(1);
    expect(idsFrom(bulkApproveTransactions).sort()).toEqual(["t1", "t3"]);
  });

  it("stays disabled when no selected row needs review", async () => {
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Amazon/ }));

    expect(screen.getByRole("button", { name: /^Approve/ })).toBeDisabled();
  });
});

describe("TransactionTable bulk delete", () => {
  it("confirms with the count and total before deleting", async () => {
    const { bulkDeleteTransactions } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Swiggy/ }));
    await user.click(screen.getByRole("checkbox", { name: /Zepto/ }));
    await user.click(screen.getByRole("button", { name: /^Delete \(2\)/ }));

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete 2 transactions");
    expect(dialog).toHaveTextContent("₹1,700");
    expect(bulkDeleteTransactions).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(idsFrom(bulkDeleteTransactions).sort()).toEqual(["t1", "t3"]);
  });

  it("does not delete when the confirmation is cancelled", async () => {
    const { bulkDeleteTransactions } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Swiggy/ }));
    await user.click(screen.getByRole("button", { name: /^Delete \(1\)/ }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Cancel",
      })
    );

    expect(bulkDeleteTransactions).not.toHaveBeenCalled();
  });
});

describe("TransactionTable bulk category", () => {
  it("opens a dialog with Apply disabled until a category is picked", async () => {
    const { bulkUpdateTransactionCategory } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Swiggy/ }));
    await user.click(screen.getByRole("button", { name: /Set category/ }));

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Set category for 1 transaction");
    expect(within(dialog).getByRole("button", { name: "Apply" })).toBeDisabled();
    expect(bulkUpdateTransactionCategory).not.toHaveBeenCalled();
  });

  it("applies the picked category to every selected row", async () => {
    const { bulkUpdateTransactionCategory } = await import("@/app/actions");
    const user = await enterSelectMode();

    await user.click(screen.getByRole("checkbox", { name: /Swiggy/ }));
    await user.click(screen.getByRole("checkbox", { name: /Amazon/ }));
    await user.click(screen.getByRole("button", { name: /Set category/ }));

    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(
      await screen.findByRole("option", { name: "Savings & Investments" })
    );
    await user.click(within(dialog).getByRole("button", { name: "Apply" }));

    expect(bulkUpdateTransactionCategory).toHaveBeenCalledTimes(1);
    const [ids, data] = (
      bulkUpdateTransactionCategory as ReturnType<typeof vi.fn>
    ).mock.calls[0];
    expect((ids as string[]).sort()).toEqual(["t1", "t2"]);
    expect(data).toEqual({
      category: "Savings & Investments",
      subcategory: null,
    });
  });
});

describe("TransactionTable grouped rows in select mode", () => {
  const grouped = [
    { ...transactions[0], group_id: "g1" },
    { ...transactions[2], group_id: "g1" },
    transactions[1],
  ];

  it("selects every member from the group summary checkbox", async () => {
    const { bulkDeleteTransactions } = await import("@/app/actions");
    const user = userEvent.setup();
    render(<TransactionTable transactions={grouped} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /^Select$/ }));
    await user.click(
      screen.getByRole("checkbox", { name: /Select all 2 grouped payments/ })
    );

    expect(screen.getByText("2 selected")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^Delete \(2\)/ }));
    await user.click(
      within(screen.getByRole("alertdialog")).getByRole("button", {
        name: "Delete",
      })
    );

    expect(idsFrom(bulkDeleteTransactions).sort()).toEqual(["t1", "t3"]);
  });

  it("lets individual members be selected once the group is expanded", async () => {
    const user = userEvent.setup();
    render(<TransactionTable transactions={grouped} categories={categories} />);

    await user.click(screen.getByRole("button", { name: /^Select$/ }));
    await user.click(screen.getByRole("button", { name: /Expand group/ }));
    await user.click(screen.getByRole("checkbox", { name: /Zepto/ }));

    expect(
      screen.getByRole("checkbox", { name: /Select all 2 grouped payments/ })
    ).toHaveAttribute("data-state", "indeterminate");
  });
});
