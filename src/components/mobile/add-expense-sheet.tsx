"use client";

import { useState, useTransition } from "react";
import { createTransaction } from "@/app/actions";
import { CategorySelect } from "@/components/category-select";
import { BottomSheet } from "./bottom-sheet";
import type { MobileCategoryOption } from "./mobile-types";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"];

function formatDraft(draft: string) {
  if (!draft) return "0";
  const [int, dec] = draft.split(".");
  const grouped = Number(int || "0").toLocaleString("en-IN");
  return dec !== undefined ? `${grouped}.${dec}` : grouped;
}

function todayInputValue() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function AddExpenseSheet({
  open,
  categories,
  onClose,
}: {
  open: boolean;
  categories: MobileCategoryOption[];
  onClose: () => void;
}) {
  return (
    <BottomSheet open={open} title="Add expense" onClose={onClose}>
      {open && <AddForm categories={categories} onClose={onClose} />}
    </BottomSheet>
  );
}

function AddForm({
  categories,
  onClose,
}: {
  categories: MobileCategoryOption[];
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState(categories[0]?.name ?? "Other");
  const [subcategory, setSubcategory] = useState<string | null>(null);
  const [date, setDate] = useState(todayInputValue());
  const [isCc, setIsCc] = useState(false);
  const [isPending, startTransition] = useTransition();

  function press(k: string) {
    setDraft((prev) => {
      if (k === "⌫") return prev.slice(0, -1);
      if (k === "." && prev.includes(".")) return prev;
      if (k === "." && !prev) return "0.";
      return (prev + k).slice(0, 12);
    });
  }

  function save() {
    const amount = Number(draft);
    if (!(amount > 0)) return;
    startTransition(async () => {
      await createTransaction({
        amount,
        merchant: merchant.trim() || category,
        date: new Date(date).toISOString(),
        category,
        subcategory,
        is_cc_payment: isCc,
      });
      onClose();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-center justify-between rounded-[20px] px-[18px] py-[18px]"
        style={{ background: "var(--m-ink)" }}
      >
        <span className="text-[13px] font-semibold text-[var(--m-ink-muted)]">
          Amount
        </span>
        <span className="m-tnum text-[32px] font-extrabold tracking-[-0.02em] text-[var(--m-canvas)]">
          ₹{formatDraft(draft)}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-[48px] cursor-pointer rounded-[15px] border border-[var(--m-border)] bg-white text-[20px] font-bold text-[var(--m-ink)]"
          >
            {k}
          </button>
        ))}
      </div>

      <input
        value={merchant}
        onChange={(e) => setMerchant(e.target.value)}
        placeholder="Merchant (optional)"
        className="h-12 rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-[15px] font-semibold text-[var(--m-ink)] outline-none placeholder:text-[var(--m-text-quaternary)]"
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]">
          Category
        </span>
        <CategorySelect
          value={category}
          onChange={setCategory}
          subcategory={subcategory}
          onSubcategoryChange={setSubcategory}
          categories={categories.map((c) => ({
            name: c.name,
            subcategories: c.subcategories.map((s) => s.name),
          }))}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]">
          Date
        </span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-12 rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-[15px] font-semibold text-[var(--m-ink)] outline-none"
        />
      </label>

      <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--m-text-secondary)]">
        <input
          type="checkbox"
          checked={isCc}
          onChange={(e) => setIsCc(e.target.checked)}
          className="h-4 w-4"
        />
        Credit card payment
      </label>

      <button
        type="button"
        onClick={save}
        disabled={isPending || !(Number(draft) > 0)}
        className="h-[52px] cursor-pointer rounded-[16px] border-0 bg-[var(--m-ink)] text-[15px] font-extrabold text-[var(--m-canvas)] disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save expense"}
      </button>
    </div>
  );
}
