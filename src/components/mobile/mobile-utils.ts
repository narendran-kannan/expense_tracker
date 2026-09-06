export function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatCompactINR(value: number) {
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}k`;
  return `₹${Math.round(value)}`;
}

// Ranked-bar fill color by rank, matching the design spec:
// rank 0 = ink, rank i = oklch(0.5 + i*0.045, 0.15 − i*0.012, 258).
export function rankColor(rank: number): string {
  if (rank === 0) return "var(--m-ink)";
  const l = 0.5 + rank * 0.045;
  const c = Math.max(0.02, 0.15 - rank * 0.012);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} 258)`;
}
