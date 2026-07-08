import { describe, expect, it } from "vitest";
import {
  excludedCategorySet,
  isCountedSpend,
  isTrackedNotCounted,
} from "./spend";

const categories = [
  { name: "Food & Dining", excluded_from_spend: false },
  { name: "Savings & Investments", excluded_from_spend: true },
  { name: "Transfer", excluded_from_spend: false },
  { name: "Custom Pool", excluded_from_spend: true },
];

describe("excludedCategorySet", () => {
  it("collects only flagged categories", () => {
    const set = excludedCategorySet(categories);
    expect(set).toEqual(new Set(["Savings & Investments", "Custom Pool"]));
  });

  it("handles missing/null flags", () => {
    const set = excludedCategorySet([
      { name: "A" },
      { name: "B", excluded_from_spend: null },
    ]);
    expect(set.size).toBe(0);
  });
});

describe("isCountedSpend", () => {
  const excluded = excludedCategorySet(categories);

  it("counts a normal expense", () => {
    expect(
      isCountedSpend({ category: "Food & Dining", is_cc_payment: false }, excluded)
    ).toBe(true);
  });

  it("does not count excluded-category transactions", () => {
    expect(
      isCountedSpend(
        { category: "Savings & Investments", is_cc_payment: false },
        excluded
      )
    ).toBe(false);
  });

  it("does not count user-flagged custom categories", () => {
    expect(
      isCountedSpend({ category: "Custom Pool", is_cc_payment: false }, excluded)
    ).toBe(false);
  });

  it("does not count CC payments regardless of category", () => {
    expect(
      isCountedSpend(
        { category: "Credit Card Payment", is_cc_payment: true },
        excluded
      )
    ).toBe(false);
  });
});

describe("isTrackedNotCounted", () => {
  const excluded = excludedCategorySet(categories);

  it("tracks excluded-category transactions", () => {
    expect(
      isTrackedNotCounted(
        { category: "Savings & Investments", is_cc_payment: false },
        excluded
      )
    ).toBe(true);
  });

  it("does not track normal expenses", () => {
    expect(
      isTrackedNotCounted(
        { category: "Food & Dining", is_cc_payment: false },
        excluded
      )
    ).toBe(false);
  });

  it("does not track CC payments even if category is excluded", () => {
    expect(
      isTrackedNotCounted(
        { category: "Savings & Investments", is_cc_payment: true },
        excluded
      )
    ).toBe(false);
  });
});
