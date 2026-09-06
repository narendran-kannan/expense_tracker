"use client";

import { useState, useTransition } from "react";
import {
  updateTransaction,
  cloneTransaction,
  markRecoverable,
  unmarkRecoverable,
  markAsEmi,
  unmarkEmi,
} from "@/app/actions";
import { defaultMonthlyAmount } from "@/lib/emi";
import { CategorySelect } from "@/components/category-select";
import { BottomSheet } from "./bottom-sheet";
import type { MobileCategoryOption, MobileTransaction } from "./mobile-types";
import { formatINR } from "./mobile-utils";

function toDateInputValue(date: string) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

type Mode = "menu" | "edit" | "clone" | "recover" | "emi";

export function EditTransactionSheet({
  transaction,
  categories,
  knownCounterparties,
  onClose,
}: {
  transaction: MobileTransaction | null;
  categories: MobileCategoryOption[];
  knownCounterparties: string[];
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={transaction !== null}
      title="Transaction"
      onClose={onClose}
    >
      {transaction && (
        <EditBody
          key={transaction.id}
          transaction={transaction}
          categories={categories}
          knownCounterparties={knownCounterparties}
          onClose={onClose}
        />
      )}
    </BottomSheet>
  );
}

function EditBody({
  transaction,
  categories,
  knownCounterparties,
  onClose,
}: {
  transaction: MobileTransaction;
  categories: MobileCategoryOption[];
  knownCounterparties: string[];
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const isRecoverable = transaction.recoverable_amount != null;
  const isEmi = transaction.is_emi === true;

  if (mode === "edit") {
    return (
      <EditForm
        transaction={transaction}
        categories={categories}
        onBack={() => setMode("menu")}
        onDone={onClose}
      />
    );
  }
  if (mode === "clone") {
    return (
      <CloneForm
        transaction={transaction}
        onBack={() => setMode("menu")}
        onDone={onClose}
      />
    );
  }
  if (mode === "recover") {
    return (
      <RecoverForm
        transaction={transaction}
        knownCounterparties={knownCounterparties}
        onBack={() => setMode("menu")}
        onDone={onClose}
      />
    );
  }
  if (mode === "emi") {
    return (
      <EmiForm
        transaction={transaction}
        onBack={() => setMode("menu")}
        onDone={onClose}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-[14px] bg-[var(--m-surface-sunken)] px-3.5 py-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-bold text-[var(--m-ink)]">
            {transaction.merchant}
          </span>
          <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
            {new Date(transaction.date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </span>
        </div>
        <span className="m-tnum text-[16px] font-extrabold text-[var(--m-ink)]">
          {formatINR(transaction.amount)}
        </span>
      </div>

      <ActionRow label="Edit details" onClick={() => setMode("edit")} />
      <ActionRow
        label="Clone / duplicate"
        sub="Copy to another date"
        onClick={() => setMode("clone")}
      />
      <RecoverableAction
        transaction={transaction}
        isRecoverable={isRecoverable}
        onOpen={() => setMode("recover")}
        onDone={onClose}
      />
      <EmiAction
        transaction={transaction}
        isEmi={isEmi}
        onOpen={() => setMode("emi")}
        onDone={onClose}
      />
    </div>
  );
}

function ActionRow({
  label,
  sub,
  onClick,
}: {
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-left"
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[14px] font-bold text-[var(--m-ink)]">
          {label}
        </span>
        {sub && (
          <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
            {sub}
          </span>
        )}
      </div>
      <span className="text-[var(--m-text-tertiary)]">›</span>
    </button>
  );
}

function RecoverableAction({
  transaction,
  isRecoverable,
  onOpen,
  onDone,
}: {
  transaction: MobileTransaction;
  isRecoverable: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (transaction.is_cc_payment || transaction.is_emi) return null;

  if (isRecoverable) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await unmarkRecoverable(transaction.id);
            onDone();
          })
        }
        className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-left disabled:opacity-60"
      >
        <span className="text-[14px] font-bold text-[var(--m-ink)]">
          Unmark recoverable
        </span>
        <span className="text-[var(--m-text-tertiary)]">×</span>
      </button>
    );
  }

  return (
    <ActionRow
      label="Mark recoverable"
      sub="Someone owes you this"
      onClick={onOpen}
    />
  );
}

function EmiAction({
  transaction,
  isEmi,
  onOpen,
  onDone,
}: {
  transaction: MobileTransaction;
  isEmi: boolean;
  onOpen: () => void;
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (transaction.is_cc_payment) return null;

  if (isEmi) {
    return (
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await unmarkEmi(transaction.id);
            onDone();
          })
        }
        className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-left disabled:opacity-60"
      >
        <span className="text-[14px] font-bold text-[var(--m-ink)]">
          Remove EMI
        </span>
        <span className="text-[var(--m-text-tertiary)]">×</span>
      </button>
    );
  }

  return (
    <ActionRow
      label="Convert to EMI"
      sub="Spread over months"
      onClick={onOpen}
    />
  );
}

function BackHeader({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex cursor-pointer items-center gap-1.5 text-[13px] font-bold text-[var(--m-text-secondary)]"
    >
      ‹ {label}
    </button>
  );
}

const labelCls =
  "text-[12px] font-extrabold uppercase tracking-[0.06em] text-[var(--m-text-tertiary)]";
const inputCls =
  "h-12 rounded-[14px] border border-[var(--m-border)] bg-white px-4 text-[15px] font-semibold text-[var(--m-ink)] outline-none";
const primaryCls =
  "h-[52px] cursor-pointer rounded-[16px] border-0 bg-[var(--m-ink)] text-[15px] font-extrabold text-[var(--m-canvas)] disabled:opacity-60";

function EditForm({
  transaction,
  categories,
  onBack,
  onDone,
}: {
  transaction: MobileTransaction;
  categories: MobileCategoryOption[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [merchant, setMerchant] = useState(transaction.merchant);
  const [amount, setAmount] = useState(String(transaction.amount));
  const [category, setCategory] = useState(transaction.category);
  const [subcategory, setSubcategory] = useState<string | null>(
    transaction.subcategory ?? null
  );
  const [isCc, setIsCc] = useState(transaction.is_cc_payment);
  const [isPending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await updateTransaction(transaction.id, {
        merchant,
        amount: Number(amount) || transaction.amount,
        category,
        subcategory,
        is_cc_payment: isCc,
      });
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackHeader label="Back" onBack={onBack} />
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Merchant</span>
        <input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          className={inputCls}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Amount</span>
        <input
          value={amount}
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className={`m-tnum ${inputCls}`}
        />
      </label>
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Category</span>
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
        disabled={isPending}
        className={primaryCls}
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

function CloneForm({
  transaction,
  onBack,
  onDone,
}: {
  transaction: MobileTransaction;
  onBack: () => void;
  onDone: () => void;
}) {
  const [date, setDate] = useState(toDateInputValue(transaction.date));
  const [isPending, startTransition] = useTransition();

  function clone() {
    startTransition(async () => {
      await cloneTransaction(transaction.id, new Date(date).toISOString());
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackHeader label="Back" onBack={onBack} />
      <p className="text-[13px] font-semibold text-[var(--m-text-secondary)]">
        Duplicate {formatINR(transaction.amount)} to {transaction.merchant} on a
        new date (useful for recurring expenses).
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>New date</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputCls}
        />
      </label>
      <button
        type="button"
        onClick={clone}
        disabled={isPending}
        className={primaryCls}
      >
        {isPending ? "Cloning…" : "Clone transaction"}
      </button>
    </div>
  );
}

function RecoverForm({
  transaction,
  knownCounterparties,
  onBack,
  onDone,
}: {
  transaction: MobileTransaction;
  knownCounterparties: string[];
  onBack: () => void;
  onDone: () => void;
}) {
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState(String(transaction.amount));
  const [isPending, startTransition] = useTransition();

  const amt = parseFloat(amount);
  const valid =
    counterparty.trim() !== "" &&
    Number.isFinite(amt) &&
    amt > 0 &&
    amt <= transaction.amount;

  function save() {
    if (!valid) return;
    startTransition(async () => {
      await markRecoverable(transaction.id, {
        counterparty: counterparty.trim(),
        recoverable_amount: amt,
      });
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackHeader label="Back" onBack={onBack} />
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Owed by</span>
        <input
          value={counterparty}
          onChange={(e) => setCounterparty(e.target.value)}
          list="mobile-counterparties"
          placeholder="Who owes you?"
          className={`${inputCls} placeholder:text-[var(--m-text-quaternary)]`}
        />
        <datalist id="mobile-counterparties">
          {knownCounterparties.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Recoverable amount</span>
        <input
          value={amount}
          inputMode="decimal"
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          className={`m-tnum ${inputCls}`}
        />
        <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
          Up to {formatINR(transaction.amount)}
        </span>
      </label>
      <button
        type="button"
        onClick={save}
        disabled={isPending || !valid}
        className={primaryCls}
      >
        {isPending ? "Saving…" : "Mark recoverable"}
      </button>
    </div>
  );
}

function EmiForm({
  transaction,
  onBack,
  onDone,
}: {
  transaction: MobileTransaction;
  onBack: () => void;
  onDone: () => void;
}) {
  const [tenure, setTenure] = useState("3");
  const [monthly, setMonthly] = useState(
    String(defaultMonthlyAmount(transaction.amount, 3))
  );
  const [start, setStart] = useState(toDateInputValue(transaction.date));
  const [isPending, startTransition] = useTransition();

  function onTenureChange(value: string) {
    setTenure(value);
    const t = parseInt(value, 10);
    if (Number.isFinite(t) && t >= 2) {
      setMonthly(String(defaultMonthlyAmount(transaction.amount, t)));
    }
  }

  const t = parseInt(tenure, 10);
  const m = parseFloat(monthly);
  const valid = Number.isFinite(t) && t >= 2 && Number.isFinite(m) && m > 0;

  function save() {
    if (!valid) return;
    startTransition(async () => {
      await markAsEmi(transaction.id, {
        tenureMonths: t,
        monthlyAmount: m,
        startDate: new Date(start).toISOString(),
      });
      onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackHeader label="Back" onBack={onBack} />
      <p className="text-[13px] font-semibold text-[var(--m-text-secondary)]">
        Spread {formatINR(transaction.amount)} across monthly installments.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Tenure (months)</span>
        <input
          type="number"
          min="2"
          step="1"
          value={tenure}
          onChange={(e) => onTenureChange(e.target.value)}
          className={`m-tnum ${inputCls}`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>Monthly installment (₹)</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={monthly}
          onChange={(e) => setMonthly(e.target.value)}
          className={`m-tnum ${inputCls}`}
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={labelCls}>First installment</span>
        <input
          type="date"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className={inputCls}
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={isPending || !valid}
        className={primaryCls}
      >
        {isPending ? "Converting…" : "Convert to EMI"}
      </button>
    </div>
  );
}
