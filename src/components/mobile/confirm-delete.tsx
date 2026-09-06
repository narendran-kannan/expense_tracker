"use client";

import { useTransition } from "react";
import { deleteTransaction } from "@/app/actions";
import type { MobileTransaction } from "./mobile-types";
import { formatINR } from "./mobile-utils";

export function ConfirmDelete({
  transaction,
  onClose,
}: {
  transaction: MobileTransaction | null;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!transaction) return null;

  function confirm() {
    if (!transaction) return;
    startTransition(async () => {
      await deleteTransaction(transaction.id);
      onClose();
    });
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="Cancel"
        onClick={onClose}
        className="m-anim-overlay absolute inset-0 cursor-pointer border-0"
        style={{ background: "rgba(20,19,15,0.4)" }}
      />
      <div className="relative flex w-full flex-col gap-4 rounded-[24px] bg-[var(--m-canvas)] p-5">
        <div className="flex flex-col gap-1.5">
          <span className="text-[16px] font-extrabold text-[var(--m-ink)]">
            Delete transaction?
          </span>
          <span className="text-[13px] font-semibold text-[var(--m-text-tertiary)]">
            This permanently deletes the {formatINR(transaction.amount)}{" "}
            transaction to {transaction.merchant}. This cannot be undone.
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 cursor-pointer rounded-[14px] border border-[var(--m-border-strong)] bg-white text-[14px] font-extrabold text-[var(--m-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={isPending}
            className="h-12 flex-1 cursor-pointer rounded-[14px] border-0 text-[14px] font-extrabold text-white disabled:opacity-60"
            style={{ background: "var(--m-danger)" }}
          >
            {isPending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
