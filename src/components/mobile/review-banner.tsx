"use client";

import { useTransition } from "react";
import { approveTransaction } from "@/app/actions";
import type { MobileTransaction } from "./mobile-types";
import { formatINR } from "./mobile-utils";

export function ReviewBanner({
  pending,
  onFixCategory,
  onReviewAll,
}: {
  pending: MobileTransaction[];
  onFixCategory: (t: MobileTransaction) => void;
  onReviewAll: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (pending.length === 0) return null;

  const latest = pending[0];
  const count = pending.length;

  function looksRight() {
    startTransition(() => approveTransaction(latest.id));
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-[20px] bg-white p-4"
      style={{ border: "1px solid var(--m-warn-border)" }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-[26px] w-[26px] items-center justify-center rounded-[9px] text-[14px] font-extrabold"
          style={{
            background: "var(--m-warn-surface)",
            color: "var(--m-warn-glyph)",
          }}
        >
          !
        </span>
        <span className="text-[14px] font-extrabold text-[var(--m-ink)]">
          {count === 1
            ? "1 expense needs review"
            : `${count} expenses need review`}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2.5 rounded-[14px] bg-[var(--m-surface-sunken)] px-3 py-2.5">
        <div className="flex min-w-0 flex-col gap-[3px]">
          <span className="truncate text-[14px] font-bold text-[var(--m-ink)]">
            {latest.merchant}
          </span>
          <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
            {new Date(latest.date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
            })}{" "}
            · category guessed
          </span>
        </div>
        <span className="m-tnum text-[15px] font-extrabold text-[var(--m-ink)]">
          {formatINR(latest.amount)}
        </span>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={looksRight}
          disabled={isPending}
          className="h-11 flex-1 cursor-pointer rounded-[14px] border-0 bg-[var(--m-ink)] text-[14px] font-extrabold text-[var(--m-canvas)] disabled:opacity-60"
        >
          Looks right
        </button>
        <button
          type="button"
          onClick={() => (count > 1 ? onReviewAll() : onFixCategory(latest))}
          className="h-11 flex-1 cursor-pointer rounded-[14px] border border-[var(--m-border-strong)] bg-white text-[14px] font-extrabold text-[var(--m-ink)]"
        >
          {count > 1 ? "Review all" : "Fix category"}
        </button>
      </div>
    </div>
  );
}
