import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CarryoverMonthCard } from "@/components/carryover-list";
import type { CarryoverMonthDTO } from "@/app/actions";

vi.mock("@/app/actions", () => ({
  acceptOverageRecomputation: vi.fn(),
  addOveragePayment: vi.fn(),
  deleteOveragePayment: vi.fn(),
  setOverageOverride: vi.fn(),
  setOverageOwedTo: vi.fn(),
}));

function makeOverage(overrides: Partial<CarryoverMonthDTO> = {}): CarryoverMonthDTO {
  return {
    id: "ov-feb",
    month: 1,
    year: 2026,
    budget_amount: 10000,
    spent_amount: 16450,
    gross_overage: 6450,
    computed_amount: 6450,
    drift: 0,
    override_amount: null,
    owed_to: null,
    outstanding: 6450,
    paid: 0,
    status: "outstanding",
    payments: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("CarryoverMonthCard", () => {
  it("renders month, budget, spend, and derived amounts", () => {
    render(<CarryoverMonthCard overage={makeOverage()} />);

    expect(screen.getByText("February 2026")).toBeInTheDocument();
    expect(screen.getByText("Budget: ₹10,000")).toBeInTheDocument();
    expect(screen.getByText("Spent: ₹16,450")).toBeInTheDocument();
    expect(screen.getAllByText("₹6,450").length).toBeGreaterThan(0);
  });

  it("shows the correct status badge for a partial payment", () => {
    render(
      <CarryoverMonthCard
        overage={makeOverage({ status: "partial", paid: 2000, outstanding: 4450 })}
      />
    );

    expect(screen.getByText("Partially paid")).toBeInTheDocument();
  });

  it("marks the amount as custom when an override is set", () => {
    render(
      <CarryoverMonthCard
        overage={makeOverage({ override_amount: 5000, gross_overage: 5000, outstanding: 5000 })}
      />
    );

    expect(screen.getByText("custom")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /edit custom amount/i })
    ).toBeInTheDocument();
  });

  it("disables logging a payment when nothing is outstanding", () => {
    render(
      <CarryoverMonthCard
        overage={makeOverage({ status: "settled", paid: 6450, outstanding: 0 })}
      />
    );

    expect(screen.getByRole("button", { name: /log payment/i })).toBeDisabled();
  });

  it("submits a payment with the entered amount and note", async () => {
    const { addOveragePayment } = await import("@/app/actions");
    const user = userEvent.setup();

    render(<CarryoverMonthCard overage={makeOverage()} />);

    await user.click(screen.getByRole("button", { name: /log payment/i }));

    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/amount/i), "2000");
    await user.type(within(dialog).getByLabelText(/note/i), "UPI to dad");
    await user.click(within(dialog).getByRole("button", { name: /save payment/i }));

    expect(addOveragePayment).toHaveBeenCalledWith(
      "ov-feb",
      expect.objectContaining({ amount: 2000, note: "UPI to dad" })
    );
  });

  it("saves the owed-to label", async () => {
    const { setOverageOwedTo } = await import("@/app/actions");
    const user = userEvent.setup();

    render(<CarryoverMonthCard overage={makeOverage()} />);

    await user.click(
      screen.getByRole("button", { name: /add who it's owed to/i })
    );
    await user.type(
      screen.getByPlaceholderText(/family, credit card/i),
      "Family"
    );
    await user.click(screen.getByRole("button", { name: /save owed to/i }));

    expect(setOverageOwedTo).toHaveBeenCalledWith("ov-feb", "Family");
  });

  it("renders payment history and deletes a payment", async () => {
    const { deleteOveragePayment } = await import("@/app/actions");
    const user = userEvent.setup();

    render(
      <CarryoverMonthCard
        overage={makeOverage({
          status: "partial",
          paid: 2000,
          outstanding: 4450,
          payments: [
            {
              id: "pay-1",
              amount: 2000,
              date: "2026-07-01T00:00:00.000Z",
              note: "UPI part payment",
              created_at: "2026-07-01T00:00:00.000Z",
            },
          ],
        })}
      />
    );

    expect(screen.getByText("Payment history")).toBeInTheDocument();
    expect(screen.getByText(/UPI part payment/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /delete payment/i }));
    expect(deleteOveragePayment).toHaveBeenCalledWith("pay-1");
  });

  it("shows no drift notice when snapshot and derived agree", () => {
    render(<CarryoverMonthCard overage={makeOverage()} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps the recorded amount and surfaces a drift notice when derived shrinks", async () => {
    const { acceptOverageRecomputation } = await import("@/app/actions");
    const user = userEvent.setup();

    // Recorded ₹7,000 overspend; budget later raised so derived is only ₹2,000.
    render(
      <CarryoverMonthCard
        overage={makeOverage({
          budget_amount: 55000,
          spent_amount: 57000,
          computed_amount: 7000,
          gross_overage: 7000,
          outstanding: 7000,
          drift: -5000,
        })}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("₹2,000");
    expect(alert.textContent).toContain("₹5,000");
    expect(alert.textContent).toContain("lower");
    expect(alert.textContent).toContain("₹7,000");

    await user.click(screen.getByRole("button", { name: /use ₹2,000/i }));
    expect(acceptOverageRecomputation).toHaveBeenCalledWith("ov-feb");
  });

  it("surfaces a drift notice when derived grows", () => {
    render(
      <CarryoverMonthCard
        overage={makeOverage({
          budget_amount: 10000,
          spent_amount: 19000,
          computed_amount: 6450,
          gross_overage: 6450,
          outstanding: 6450,
          drift: 2550,
        })}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("higher");
    expect(
      screen.getByRole("button", { name: /use ₹9,000/i })
    ).toBeInTheDocument();
  });
});
