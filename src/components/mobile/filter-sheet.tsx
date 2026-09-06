"use client";

import { BottomSheet } from "./bottom-sheet";

export type AmountBand = "lt1k" | "1k-25k" | "gt25k";

export interface MobileFilters {
  categories: string[];
  amountBand: AmountBand | null;
  status: "all" | "needs_review";
  query: string;
}

const AMOUNT_BANDS: { value: AmountBand; label: string }[] = [
  { value: "lt1k", label: "Under ₹1,000" },
  { value: "1k-25k", label: "₹1k–₹25k" },
  { value: "gt25k", label: "Over ₹25,000" },
];

function chipClass(active: boolean) {
  return active
    ? "border-[var(--m-ink)] bg-[var(--m-ink)] text-[var(--m-canvas)]"
    : "border-[var(--m-border-strong)] bg-white text-[var(--m-ink)]";
}

export function FilterSheet({
  open,
  onClose,
  filters,
  categoryNames,
  resultCount,
  onToggleCategory,
  onSetAmountBand,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  filters: MobileFilters;
  categoryNames: string[];
  resultCount: number;
  onToggleCategory: (name: string) => void;
  onSetAmountBand: (band: AmountBand | null) => void;
  onClear: () => void;
}) {
  return (
    <BottomSheet open={open} title="Filter transactions" onClose={onClose}>
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-[9px]">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]">
            Category
          </span>
          <div className="flex flex-wrap gap-2">
            {categoryNames.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => onToggleCategory(name)}
                className={`h-[38px] cursor-pointer rounded-[12px] border px-3.5 text-[13px] font-bold ${chipClass(
                  filters.categories.includes(name)
                )}`}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-[9px]">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]">
            Amount
          </span>
          <div className="flex flex-wrap gap-2">
            {AMOUNT_BANDS.map((band) => {
              const active = filters.amountBand === band.value;
              return (
                <button
                  key={band.value}
                  type="button"
                  onClick={() => onSetAmountBand(active ? null : band.value)}
                  className={`h-[38px] cursor-pointer rounded-[12px] border px-3.5 text-[13px] font-bold ${chipClass(
                    active
                  )}`}
                >
                  {band.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClear}
            className="h-[50px] flex-1 cursor-pointer rounded-[16px] border border-[var(--m-border-strong)] bg-white text-[14px] font-extrabold text-[var(--m-ink)]"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-[50px] flex-[2] cursor-pointer rounded-[16px] border-0 bg-[var(--m-ink)] text-[14px] font-extrabold text-[var(--m-canvas)]"
          >
            Show {resultCount} results
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
