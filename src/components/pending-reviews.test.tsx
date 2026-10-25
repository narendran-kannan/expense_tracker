import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PendingReviews } from "@/components/pending-reviews";

vi.mock("@/app/actions", () => ({
  approveTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}));

const mockTransaction = {
  id: "txn-2",
  amount: 2500,
  merchant: "Swiggy",
  date: "2026-03-12T00:00:00.000Z",
  category: "Food",
  is_cc_payment: false,
  confidence_score: 0.6,
  needs_review: true,
  remarks: null,
};

const categories = [
  { name: "Shopping", subcategories: [] },
  { name: "Food", subcategories: [] },
  { name: "Transport", subcategories: [] },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

function getTriggerButton() {
  return document.querySelector(
    '[data-slot="alert-dialog-trigger"]'
  ) as HTMLElement;
}

describe("PendingReviews delete confirmation", () => {
  it("does not call deleteTransaction immediately on delete button click", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <PendingReviews
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    expect(deleteTransaction).not.toHaveBeenCalled();
  });

  it("shows confirmation dialog when delete button is clicked", async () => {
    const user = userEvent.setup();

    render(
      <PendingReviews
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Delete Transaction")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/This moves the/)
    ).toBeInTheDocument();
    expect(within(dialog).getByText(/Swiggy/)).toBeInTheDocument();
  });

  it("does not delete when Cancel is clicked in the confirmation dialog", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <PendingReviews
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    const dialog = screen.getByRole("alertdialog");
    const cancelButton = within(dialog).getByRole("button", { name: "Cancel" });
    await user.click(cancelButton);

    expect(deleteTransaction).not.toHaveBeenCalled();
  });

  it("calls deleteTransaction when Delete is confirmed", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <PendingReviews
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    const dialog = screen.getByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(confirmButton);

    expect(deleteTransaction).toHaveBeenCalledWith("txn-2");
  });
});
