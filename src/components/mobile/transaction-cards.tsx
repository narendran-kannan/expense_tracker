"use client";

import { useState } from "react";
import type { MobileTransaction } from "./mobile-types";
import { formatINR } from "./mobile-utils";

interface DateGroup {
  date: string;
  label: string;
  total: number;
  items: MobileTransaction[];
}

function groupByDate(transactions: MobileTransaction[]): DateGroup[] {
  const groups = new Map<string, MobileTransaction[]>();
  for (const t of transactions) {
    const key = new Date(t.date).toISOString().slice(0, 10);
    const arr = groups.get(key) ?? [];
    arr.push(t);
    groups.set(key, arr);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      date: key,
      label: new Date(items[0].date)
        .toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
        })
        .toUpperCase(),
      total: items.reduce((s, t) => s + t.effectiveAmount, 0),
      items,
    }));
}

export function TransactionCards({
  transactions,
  onEdit,
  onDelete,
  onClearFilters,
}: {
  transactions: MobileTransaction[];
  onEdit: (t: MobileTransaction) => void;
  onDelete: (t: MobileTransaction) => void;
  onClearFilters?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = groupByDate(transactions);

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
        <p className="text-[14px] font-semibold text-[var(--m-text-tertiary)]">
          No transactions match these filters
        </p>
        {onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-11 cursor-pointer rounded-[14px] border border-[var(--m-border-strong)] bg-white px-4 text-[14px] font-bold text-[var(--m-ink)]"
          >
            Clear filters
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <div key={group.date} className="flex flex-col gap-2 px-5 pt-3 pb-1">
          <div className="flex items-baseline justify-between">
            <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]">
              {group.label}
            </span>
            <span className="m-tnum text-[12px] font-bold text-[var(--m-text-quaternary)]">
              {formatINR(group.total)}
            </span>
          </div>
          <div className="flex flex-col overflow-hidden rounded-[20px] border border-[var(--m-border)] bg-white">
            {group.items.map((tx, i) => {
              const open = openId === tx.id;
              return (
                <div
                  key={tx.id}
                  className="flex flex-col"
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid var(--m-fill-subtle)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : tx.id)}
                    className="flex min-h-[64px] cursor-pointer items-center gap-3 px-4 py-3.5 text-left"
                    style={{
                      background: open ? "var(--m-surface-sunken)" : "#fff",
                    }}
                  >
                    <span
                      className="m-tnum flex h-9 w-9 flex-none items-center justify-center rounded-[12px] text-[14px] font-bold"
                      style={{
                        background: tx.needs_review
                          ? "var(--m-danger-surface)"
                          : "var(--m-fill-subtle)",
                        color: tx.needs_review
                          ? "var(--m-danger-glyph)"
                          : "var(--m-text-secondary)",
                      }}
                    >
                      {tx.merchant.charAt(0).toUpperCase()}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
                      <span className="truncate text-[14px] font-bold text-[var(--m-ink)]">
                        {tx.merchant}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-[7px] bg-[var(--m-fill-subtle)] px-[7px] py-[5px] text-[11px] font-bold text-[var(--m-text-secondary)]">
                          {tx.subcategory
                            ? `${tx.category} / ${tx.subcategory}`
                            : tx.category}
                        </span>
                        {tx.is_cc_payment && (
                          <span className="rounded-[7px] bg-[var(--m-fill-subtle)] px-[7px] py-[5px] text-[11px] font-bold text-[var(--m-text-tertiary)]">
                            CC
                          </span>
                        )}
                        {tx.needs_review && (
                          <span
                            className="rounded-[7px] px-[7px] py-[5px] text-[11px] font-extrabold"
                            style={{
                              background: "var(--m-danger-surface)",
                              color: "var(--m-danger-glyph)",
                            }}
                          >
                            Review
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="m-tnum flex-none text-[15px] font-extrabold text-[var(--m-ink)]">
                      {formatINR(tx.amount)}
                    </span>
                  </button>
                  {open && (
                    <div
                      className="m-anim-fade grid grid-cols-2 gap-2 px-4 pb-3.5"
                      style={{ background: "var(--m-surface-sunken)" }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null);
                          onEdit(tx);
                        }}
                        className="h-[46px] cursor-pointer rounded-[13px] border border-[var(--m-border)] bg-white text-[12px] font-bold text-[var(--m-ink)]"
                      >
                        Edit & more
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOpenId(null);
                          onDelete(tx);
                        }}
                        className="h-[46px] cursor-pointer rounded-[13px] bg-white text-[12px] font-bold"
                        style={{
                          border: "1px solid var(--m-danger-border)",
                          color: "var(--m-danger)",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      <div className="px-5 pt-4 text-center text-[12px] font-semibold text-[var(--m-text-quaternary)]">
        Tap a row to edit, clone, mark recoverable, convert to EMI or delete.
      </div>
    </div>
  );
}
