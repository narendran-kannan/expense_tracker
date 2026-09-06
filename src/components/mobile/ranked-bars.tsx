"use client";

import type { MobileCategorySlice } from "./mobile-types";
import { formatINR, rankColor } from "./mobile-utils";

export function RankedBars({
  slices,
  onSelect,
}: {
  slices: MobileCategorySlice[];
  onSelect?: (name: string) => void;
}) {
  const max = slices.reduce((m, s) => Math.max(m, s.amount), 0) || 1;

  return (
    <div className="flex flex-col gap-3.5">
      {slices.map((slice, i) => {
        const width = Math.max(3, (slice.amount / max) * 100);
        const inner = (
          <>
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="text-[13px] font-bold text-[var(--m-ink)]">
                {slice.name}
              </span>
              <span className="m-tnum text-[13px] font-bold text-[var(--m-text-secondary)]">
                {formatINR(slice.amount)} · {slice.pct}%
              </span>
            </div>
            <div className="h-[9px] overflow-hidden rounded-full bg-[var(--m-fill-subtle)]">
              <div
                className="h-[9px] rounded-full"
                style={{ width: `${width}%`, background: rankColor(i) }}
              />
            </div>
          </>
        );

        if (!onSelect) {
          return (
            <div key={slice.name} className="flex flex-col gap-[7px]">
              {inner}
            </div>
          );
        }

        return (
          <button
            key={slice.name}
            type="button"
            onClick={() => onSelect(slice.name)}
            className="flex w-full cursor-pointer flex-col gap-[7px] text-left"
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
