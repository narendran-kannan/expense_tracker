import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IgnoredList, type IgnoredItem } from "@/components/ignored-list";

vi.mock("@/app/actions", () => ({
  restoreIgnoredTransaction: vi.fn(async () => {}),
  deleteIgnoredTransaction: vi.fn(async () => {}),
}));

const item: IgnoredItem = {
  id: "ign-1",
  amount: 1500,
  merchant: "Amazon",
  date: "2026-03-10T00:00:00.000Z",
  category: "Shopping",
  is_cc_payment: false,
  match_fingerprint: false,
  source: "email",
  created_at: "2026-03-11T00:00:00.000Z",
  expires_at: "2026-04-10T00:00:00.000Z",
  days_left: 12,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("IgnoredList", () => {
  it("shows the empty state", () => {
    render(<IgnoredList items={[]} />);
    expect(screen.getByText(/Nothing ignored/)).toBeInTheDocument();
  });

  it("restores an ignored row", async () => {
    const { restoreIgnoredTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(<IgnoredList items={[item]} />);
    await user.click(screen.getByTitle("Restore"));

    expect(restoreIgnoredTransaction).toHaveBeenCalledWith("ign-1");
  });

  it("permanently deletes only after confirmation", async () => {
    const { deleteIgnoredTransaction } = await import("@/app/actions");
    const user = userEvent.setup();

    render(<IgnoredList items={[item]} />);
    await user.click(screen.getByTitle("Delete forever"));

    expect(deleteIgnoredTransaction).not.toHaveBeenCalled();

    const dialog = screen.getByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete forever" })
    );

    expect(deleteIgnoredTransaction).toHaveBeenCalledWith("ign-1");
  });
});
