import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
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

const mockTransaction = {
  id: "txn-1",
  amount: 1500,
  merchant: "Amazon",
  date: "2026-03-10T00:00:00.000Z",
  category: "Shopping",
  is_cc_payment: false,
  confidence_score: 0.95,
  needs_review: false,
  remarks: null,
  email_message_id: "msg-1",
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
    '[data-slot="alert-dialog-trigger"][title="Delete"]'
  ) as HTMLElement;
}

describe("TransactionTable delete confirmation", () => {
  it("does not call deleteTransaction immediately on delete button click", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <TransactionTable
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
      <TransactionTable
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
    expect(within(dialog).getByText(/Amazon/)).toBeInTheDocument();
  });

  it("does not delete when Cancel is clicked in the confirmation dialog", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <TransactionTable
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
      <TransactionTable
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    const dialog = screen.getByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", { name: "Delete" });
    await user.click(confirmButton);

    expect(deleteTransaction).toHaveBeenCalledWith("txn-1");
  });

  it("passes matchFingerprint when also-ignore is checked", async () => {
    const { deleteTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <TransactionTable
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(getTriggerButton());

    const dialog = screen.getByRole("alertdialog");
    await user.click(within(dialog).getByRole("checkbox"));
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(deleteTransaction).toHaveBeenCalledWith("txn-1", {
      matchFingerprint: true,
    });
  });
});

describe("TransactionTable clone", () => {
  it("does not call cloneTransaction until the copy is confirmed", async () => {
    const { cloneTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <TransactionTable
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(
      document.querySelector(
        '[title="Clone (duplicate for a recurring expense)"]'
      ) as HTMLElement
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Clone transaction")).toBeInTheDocument();
    expect(cloneTransaction).not.toHaveBeenCalled();
  });

  it("calls cloneTransaction with the chosen date when confirmed", async () => {
    const { cloneTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <TransactionTable
        transactions={[mockTransaction]}
        categories={categories}
      />
    );

    await user.click(
      document.querySelector(
        '[title="Clone (duplicate for a recurring expense)"]'
      ) as HTMLElement
    );

    const dialog = screen.getByRole("dialog");
    const confirmButton = within(dialog).getByRole("button", {
      name: "Create copy",
    });
    await user.click(confirmButton);

    expect(cloneTransaction).toHaveBeenCalledTimes(1);
    expect(cloneTransaction).toHaveBeenCalledWith(
      "txn-1",
      expect.any(String)
    );
  });
});
