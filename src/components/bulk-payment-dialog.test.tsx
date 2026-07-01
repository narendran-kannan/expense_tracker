import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BulkPaymentDialog } from "@/components/bulk-payment-dialog";

vi.mock("@/app/actions", () => ({
  addBulkOveragePayment: vi.fn(),
  previewBulkOveragePayment: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("BulkPaymentDialog", () => {
  it("disables the trigger when nothing is outstanding", () => {
    render(<BulkPaymentDialog totalOutstanding={0} />);

    expect(
      screen.getByRole("button", { name: /log bulk payment/i })
    ).toBeDisabled();
  });

  it("shows total outstanding in the dialog description", async () => {
    const user = userEvent.setup();
    render(<BulkPaymentDialog totalOutstanding={9750} />);

    await user.click(screen.getByRole("button", { name: /log bulk payment/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/₹9,750/)).toBeInTheDocument();
  });

  it("previews the waterfall split as the amount is typed", async () => {
    const { previewBulkOveragePayment } = await import("@/app/actions");
    vi.mocked(previewBulkOveragePayment).mockResolvedValue({
      items: [
        { id: "feb", month: 1, year: 2026, outstandingBefore: 6450, applied: 6450, outstandingAfter: 0 },
        { id: "mar", month: 2, year: 2026, outstandingBefore: 3300, applied: 1550, outstandingAfter: 1750 },
      ],
      totalApplied: 8000,
      leftover: 0,
      totalOutstanding: 9750,
    });
    const user = userEvent.setup();

    render(<BulkPaymentDialog totalOutstanding={9750} />);
    await user.click(screen.getByRole("button", { name: /log bulk payment/i }));

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/amount/i), "8000");

    await waitFor(() =>
      expect(previewBulkOveragePayment).toHaveBeenCalledWith(8000)
    );
    expect(await within(dialog).findByText("February 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("March 2026")).toBeInTheDocument();
    expect(within(dialog).getByText("settled")).toBeInTheDocument();
    expect(within(dialog).getByText(/₹1,750 left/)).toBeInTheDocument();
  });

  it("reports leftover in the preview on overpayment", async () => {
    const { previewBulkOveragePayment } = await import("@/app/actions");
    vi.mocked(previewBulkOveragePayment).mockResolvedValue({
      items: [
        { id: "mar", month: 2, year: 2026, outstandingBefore: 1750, applied: 1750, outstandingAfter: 0 },
      ],
      totalApplied: 1750,
      leftover: 1250,
      totalOutstanding: 1750,
    });
    const user = userEvent.setup();

    render(<BulkPaymentDialog totalOutstanding={1750} />);
    await user.click(screen.getByRole("button", { name: /log bulk payment/i }));

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/amount/i), "3000");

    expect(
      await within(dialog).findByText(/₹1,250 not needed/i)
    ).toBeInTheDocument();
  });

  it("submits the bulk payment with the entered amount", async () => {
    const { addBulkOveragePayment, previewBulkOveragePayment } = await import(
      "@/app/actions"
    );
    vi.mocked(previewBulkOveragePayment).mockResolvedValue({
      items: [],
      totalApplied: 0,
      leftover: 0,
      totalOutstanding: 9750,
    });
    vi.mocked(addBulkOveragePayment).mockResolvedValue({
      totalApplied: 8000,
      leftover: 0,
      monthsPaid: 2,
    });
    vi.stubGlobal("alert", vi.fn());
    const user = userEvent.setup();

    render(<BulkPaymentDialog totalOutstanding={9750} />);
    await user.click(screen.getByRole("button", { name: /log bulk payment/i }));

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/amount/i), "8000");
    await user.click(within(dialog).getByRole("button", { name: /apply payment/i }));

    await waitFor(() =>
      expect(addBulkOveragePayment).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 8000 })
      )
    );
  });
});
