"use client";

interface Bar {
  short: string;
  label: string;
  amount: number;
}

export function MiniBarChart({
  bars,
  height = 78,
  containerHeight = 112,
  currentIndex,
}: {
  bars: Bar[];
  height?: number;
  containerHeight?: number;
  currentIndex?: number;
}) {
  const max = bars.reduce((m, b) => Math.max(m, b.amount), 0) || 1;

  return (
    <div
      className="flex items-end gap-2"
      style={{ height: `${containerHeight}px` }}
    >
      {bars.map((bar, i) => {
        const isPeak =
          currentIndex !== undefined ? i === currentIndex : bar.amount === max;
        const h = Math.max(3, Math.round((bar.amount / max) * height));
        return (
          <div
            key={`${bar.short}-${i}`}
            className="flex flex-1 flex-col items-center justify-end gap-[7px]"
          >
            <span className="m-tnum text-[10px] font-bold text-[var(--m-text-secondary)]">
              {bar.short}
            </span>
            <div
              className="w-full"
              style={{
                height: `${h}px`,
                borderRadius: "8px 8px 3px 3px",
                background: isPeak ? "var(--m-ink)" : "var(--m-accent)",
              }}
            />
            <span className="text-[10px] font-semibold text-[var(--m-text-quaternary)]">
              {bar.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
