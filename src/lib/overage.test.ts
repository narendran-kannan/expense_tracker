import { describe, it, expect } from "vitest";
import {
  OVERAGE_STATUS,
  allocateWaterfall,
  computeOverageStatus,
  derivedOverage,
  grossOverage,
  isOverageStatus,
  outstandingOverage,
  overageDrift,
  sumPayments,
} from "./overage";

describe("sumPayments", () => {
  it("returns 0 for undefined or empty", () => {
    expect(sumPayments(undefined)).toBe(0);
    expect(sumPayments([])).toBe(0);
  });

  it("sums all payment amounts", () => {
    expect(sumPayments([{ amount: 1000 }, { amount: 500 }])).toBe(1500);
  });
});

describe("grossOverage", () => {
  it("derives spent minus budget when no override", () => {
    expect(
      grossOverage({ override_amount: null, budget_amount: 10000, spent_amount: 14200 })
    ).toBe(4200);
  });

  it("is 0 when spend is within budget", () => {
    expect(
      grossOverage({ override_amount: null, budget_amount: 10000, spent_amount: 8000 })
    ).toBe(0);
  });

  it("never returns a negative derived overage", () => {
    expect(
      grossOverage({ override_amount: null, budget_amount: 10000, spent_amount: 0 })
    ).toBe(0);
  });

  it("uses override when set, ignoring derived value", () => {
    expect(
      grossOverage({ override_amount: 3000, budget_amount: 10000, spent_amount: 14200 })
    ).toBe(3000);
  });

  it("clamps a negative override to 0", () => {
    expect(
      grossOverage({ override_amount: -50, budget_amount: 10000, spent_amount: 14200 })
    ).toBe(0);
  });

  it("treats an override of 0 as an explicit zero (not derived)", () => {
    expect(
      grossOverage({ override_amount: 0, budget_amount: 10000, spent_amount: 14200 })
    ).toBe(0);
  });

  it("uses the stored snapshot over the derived value", () => {
    expect(
      grossOverage({
        override_amount: null,
        computed_amount: 7000,
        budget_amount: 55000,
        spent_amount: 57000,
      })
    ).toBe(7000);
  });

  it("prefers override over snapshot", () => {
    expect(
      grossOverage({
        override_amount: 1234,
        computed_amount: 7000,
        budget_amount: 50000,
        spent_amount: 57000,
      })
    ).toBe(1234);
  });

  it("clamps a negative snapshot to 0", () => {
    expect(
      grossOverage({
        override_amount: null,
        computed_amount: -100,
        budget_amount: 10000,
        spent_amount: 14200,
      })
    ).toBe(0);
  });

  it("falls back to derived when snapshot is null", () => {
    expect(
      grossOverage({
        override_amount: null,
        computed_amount: null,
        budget_amount: 10000,
        spent_amount: 14200,
      })
    ).toBe(4200);
  });
});

describe("derivedOverage", () => {
  it("is spent minus budget, floored at 0", () => {
    expect(derivedOverage({ budget_amount: 50000, spent_amount: 57000 })).toBe(
      7000
    );
    expect(derivedOverage({ budget_amount: 50000, spent_amount: 40000 })).toBe(
      0
    );
  });
});

describe("overageDrift", () => {
  it("is 0 when there is no snapshot", () => {
    expect(
      overageDrift({
        override_amount: null,
        computed_amount: null,
        budget_amount: 50000,
        spent_amount: 57000,
      })
    ).toBe(0);
  });

  it("is 0 when an override pins the amount", () => {
    expect(
      overageDrift({
        override_amount: 5000,
        computed_amount: 7000,
        budget_amount: 55000,
        spent_amount: 57000,
      })
    ).toBe(0);
  });

  it("is 0 when derived matches the snapshot", () => {
    expect(
      overageDrift({
        override_amount: null,
        computed_amount: 7000,
        budget_amount: 50000,
        spent_amount: 57000,
      })
    ).toBe(0);
  });

  it("is negative when a retroactive budget raise lowers the derived value", () => {
    // The reported bug: budget retroactively 50k -> 55k made 5,000 vanish.
    expect(
      overageDrift({
        override_amount: null,
        computed_amount: 7000,
        budget_amount: 55000,
        spent_amount: 57000,
      })
    ).toBe(-5000);
  });

  it("is positive when late transactions raise the derived value", () => {
    expect(
      overageDrift({
        override_amount: null,
        computed_amount: 7000,
        budget_amount: 50000,
        spent_amount: 59500,
      })
    ).toBe(2500);
  });

  it("ignores sub-paisa float noise", () => {
    expect(
      overageDrift({
        override_amount: null,
        computed_amount: 7000.001,
        budget_amount: 50000,
        spent_amount: 57000,
      })
    ).toBe(0);
  });
});

describe("outstandingOverage", () => {
  it("equals gross overage with no payments", () => {
    expect(
      outstandingOverage({
        override_amount: null,
        budget_amount: 10000,
        spent_amount: 14200,
      })
    ).toBe(4200);
  });

  it("subtracts payments so far", () => {
    expect(
      outstandingOverage({
        override_amount: null,
        budget_amount: 10000,
        spent_amount: 14200,
        payments: [{ amount: 1200 }, { amount: 800 }],
      })
    ).toBe(2200);
  });

  it("floors at 0 when overpaid", () => {
    expect(
      outstandingOverage({
        override_amount: null,
        budget_amount: 10000,
        spent_amount: 14200,
        payments: [{ amount: 5000 }],
      })
    ).toBe(0);
  });

  it("is 0 when the month was within budget", () => {
    expect(
      outstandingOverage({
        override_amount: null,
        budget_amount: 10000,
        spent_amount: 9000,
      })
    ).toBe(0);
  });

  it("respects an override amount", () => {
    expect(
      outstandingOverage({
        override_amount: 3000,
        budget_amount: 10000,
        spent_amount: 14200,
        payments: [{ amount: 1000 }],
      })
    ).toBe(2000);
  });
});

describe("computeOverageStatus", () => {
  it("returns SETTLED when there is no overage", () => {
    expect(computeOverageStatus(0, 0)).toBe(OVERAGE_STATUS.SETTLED);
  });

  it("returns OUTSTANDING when overage exists and nothing paid", () => {
    expect(computeOverageStatus(4200, 0)).toBe(OVERAGE_STATUS.OUTSTANDING);
  });

  it("returns PARTIAL when some but not all paid", () => {
    expect(computeOverageStatus(4200, 2000)).toBe(OVERAGE_STATUS.PARTIAL);
  });

  it("returns SETTLED when fully paid", () => {
    expect(computeOverageStatus(4200, 4200)).toBe(OVERAGE_STATUS.SETTLED);
  });

  it("returns SETTLED when overpaid", () => {
    expect(computeOverageStatus(4200, 5000)).toBe(OVERAGE_STATUS.SETTLED);
  });
});

describe("allocateWaterfall", () => {
  const feb = { id: "feb", outstanding: 6450 };
  const mar = { id: "mar", outstanding: 3300 };

  it("fully settles the first target and partially fills the next", () => {
    const result = allocateWaterfall(8000, [feb, mar]);
    expect(result.allocations).toEqual([
      { id: "feb", applied: 6450 },
      { id: "mar", applied: 1550 },
    ]);
    expect(result.totalApplied).toBe(8000);
    expect(result.leftover).toBe(0);
  });

  it("only partially pays the first target when amount is small", () => {
    const result = allocateWaterfall(2000, [feb, mar]);
    expect(result.allocations).toEqual([{ id: "feb", applied: 2000 }]);
    expect(result.totalApplied).toBe(2000);
    expect(result.leftover).toBe(0);
  });

  it("settles everything and reports leftover on overpayment", () => {
    const result = allocateWaterfall(10000, [feb, mar]);
    expect(result.allocations).toEqual([
      { id: "feb", applied: 6450 },
      { id: "mar", applied: 3300 },
    ]);
    expect(result.totalApplied).toBe(9750);
    expect(result.leftover).toBe(250);
  });

  it("exactly clears all targets with no leftover", () => {
    const result = allocateWaterfall(9750, [feb, mar]);
    expect(result.totalApplied).toBe(9750);
    expect(result.leftover).toBe(0);
    expect(result.allocations).toHaveLength(2);
  });

  it("respects the given order (waterfall direction is caller-controlled)", () => {
    const result = allocateWaterfall(4000, [mar, feb]);
    expect(result.allocations).toEqual([
      { id: "mar", applied: 3300 },
      { id: "feb", applied: 700 },
    ]);
  });

  it("skips targets with no outstanding balance", () => {
    const result = allocateWaterfall(5000, [
      { id: "settled", outstanding: 0 },
      feb,
    ]);
    expect(result.allocations).toEqual([{ id: "feb", applied: 5000 }]);
  });

  it("returns empty allocations for a zero or negative amount", () => {
    expect(allocateWaterfall(0, [feb, mar]).allocations).toEqual([]);
    expect(allocateWaterfall(-100, [feb, mar]).totalApplied).toBe(0);
  });

  it("returns full leftover when there is nothing to pay", () => {
    const result = allocateWaterfall(5000, [
      { id: "a", outstanding: 0 },
      { id: "b", outstanding: 0 },
    ]);
    expect(result.allocations).toEqual([]);
    expect(result.leftover).toBe(5000);
  });

  it("avoids floating-point drift", () => {
    const result = allocateWaterfall(0.3, [
      { id: "a", outstanding: 0.1 },
      { id: "b", outstanding: 0.1 },
      { id: "c", outstanding: 0.1 },
    ]);
    expect(result.totalApplied).toBe(0.3);
    expect(result.leftover).toBe(0);
  });
});

describe("isOverageStatus", () => {
  it("accepts known statuses", () => {
    expect(isOverageStatus("outstanding")).toBe(true);
    expect(isOverageStatus("partial")).toBe(true);
    expect(isOverageStatus("settled")).toBe(true);
  });

  it("rejects unknown values", () => {
    expect(isOverageStatus("recovered")).toBe(false);
    expect(isOverageStatus(null)).toBe(false);
    expect(isOverageStatus(42)).toBe(false);
  });
});
