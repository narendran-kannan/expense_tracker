"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Home,
  Receipt,
  PieChart,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Plus,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type {
  MobileCategoryOption,
  MobileCategorySlice,
  MobileDaySpend,
  MobileMoreItem,
  MobileTab,
  MobileTransaction,
} from "./mobile-types";
import { formatINR, formatCompactINR } from "./mobile-utils";
import { RankedBars } from "./ranked-bars";
import { MiniBarChart } from "./mini-bar-chart";
import { TransactionCards } from "./transaction-cards";
import { ReviewBanner } from "./review-banner";
import { FilterSheet, type AmountBand, type MobileFilters } from "./filter-sheet";
import { AddExpenseSheet } from "./add-expense-sheet";
import { EditTransactionSheet } from "./edit-transaction-sheet";
import { ConfirmDelete } from "./confirm-delete";
import { SwitchToDesktopButton } from "./view-mode";

export interface MobileDashboardProps {
  month: number;
  year: number;
  monthLabel: string;
  isCurrentMonth: boolean;
  totalSpend: number;
  budget: number | null;
  totalTransactions: number;
  avgTransaction: number;
  trackedTotal: number;
  outstandingTotal: number;
  outstandingCount: number;
  categorySlices: MobileCategorySlice[];
  dailySpend: MobileDaySpend[];
  transactions: MobileTransaction[];
  categories: MobileCategoryOption[];
  knownCounterparties: string[];
  moreItems: MobileMoreItem[];
  insightCopy: string | null;
  onSignOut: () => Promise<void>;
}

const EMPTY_FILTERS: MobileFilters = {
  categories: [],
  amountBand: null,
  status: "all",
  query: "",
};

function matchAmountBand(amount: number, band: AmountBand | null): boolean {
  if (!band) return true;
  if (band === "lt1k") return amount < 1000;
  if (band === "1k-25k") return amount >= 1000 && amount < 25000;
  return amount >= 25000;
}

export function MobileDashboard(props: MobileDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<MobileTab>("home");
  const [filters, setFilters] = useState<MobileFilters>(EMPTY_FILTERS);
  const [sheet, setSheet] = useState<"add" | "filter" | null>(null);
  const [editTx, setEditTx] = useState<MobileTransaction | null>(null);
  const [deleteTx, setDeleteTx] = useState<MobileTransaction | null>(null);

  const pending = useMemo(
    () => props.transactions.filter((t) => t.needs_review),
    [props.transactions]
  );

  const categoryNames = useMemo(
    () => props.categories.map((c) => c.name),
    [props.categories]
  );

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return props.transactions.filter((t) => {
      if (
        filters.categories.length &&
        !filters.categories.includes(t.category)
      ) {
        return false;
      }
      if (!matchAmountBand(t.amount, filters.amountBand)) return false;
      if (filters.status === "needs_review" && !t.needs_review) return false;
      if (
        q &&
        !t.merchant.toLowerCase().includes(q) &&
        !(t.remarks ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [props.transactions, filters]);

  const filterCount =
    filters.categories.length + (filters.amountBand ? 1 : 0);
  const resultTotal = filtered.reduce((s, t) => s + t.amount, 0);

  function navMonth(direction: -1 | 1) {
    let m = props.month + direction;
    let y = props.year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(m));
    params.set("year", String(y));
    router.push(`/?${params.toString()}`);
  }

  function switchTab(next: MobileTab) {
    setTab(next);
    setSheet(null);
    const scroller = document.getElementById("m-scroll");
    if (scroller) scroller.scrollTop = 0;
  }

  function goToCategory(name: string) {
    setFilters({ ...EMPTY_FILTERS, categories: [name] });
    switchTab("activity");
  }

  const budgetPct = props.budget
    ? Math.min(Math.round((props.totalSpend / props.budget) * 100), 999)
    : null;
  const budgetLeft = props.budget ? props.budget - props.totalSpend : 0;
  const budgetOver = props.budget ? props.totalSpend > props.budget : false;

  return (
    <div className="mobile-shell relative flex min-h-screen flex-col">
      {/* Top bar: month stepper + tab title */}
      <div className="flex flex-none items-center justify-between gap-2.5 px-5 pt-3 pb-3">
        <div className="flex items-center gap-0.5 rounded-[12px] bg-[var(--m-fill-strong)] p-[3px]">
          <button
            type="button"
            onClick={() => navMonth(-1)}
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-[var(--m-text-secondary)]"
            aria-label="Previous month"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[92px] text-center text-[15px] font-extrabold tracking-[-0.01em] text-[var(--m-ink)]">
            {props.monthLabel}
          </span>
          <button
            type="button"
            onClick={() => navMonth(1)}
            disabled={props.isCurrentMonth}
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[10px] border-0 bg-transparent text-[var(--m-text-secondary)] disabled:opacity-40"
            aria-label="Next month"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <SwitchToDesktopButton />
      </div>

      {/* Scroll area */}
      <div
        id="m-scroll"
        className="m-noscroll flex-1 overflow-y-auto"
      >
        {tab === "home" && (
          <div className="flex flex-col gap-3.5 px-5 pt-0.5 pb-32">
            {/* Hero */}
            <div
              className="flex flex-col gap-4 rounded-[24px] p-[22px]"
              style={{ background: "var(--m-ink)", color: "var(--m-canvas)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-[7px]">
                  <span className="text-[13px] font-semibold text-[var(--m-ink-muted)]">
                    Spent this month
                  </span>
                  <span className="m-tnum text-[38px] font-extrabold leading-none tracking-[-0.03em]">
                    {formatINR(props.totalSpend)}
                  </span>
                </div>
                {budgetPct !== null && (
                  <span
                    className="whitespace-nowrap rounded-[8px] px-[9px] py-1.5 text-[11px] font-bold text-[var(--m-ink)]"
                    style={{ background: "var(--m-warn)" }}
                  >
                    {budgetPct}% of budget
                  </span>
                )}
              </div>
              {props.budget !== null && (
                <div className="flex flex-col gap-2">
                  <div
                    className="flex h-2 overflow-hidden rounded-full"
                    style={{ background: "var(--m-ink-line)" }}
                  >
                    <div
                      className="rounded-full"
                      style={{
                        width: `${Math.min(budgetPct ?? 0, 100)}%`,
                        background: budgetOver
                          ? "var(--m-danger)"
                          : "var(--m-warn)",
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[12px] font-semibold text-[var(--m-ink-muted)]">
                    <span>
                      {budgetOver
                        ? `${formatINR(Math.abs(budgetLeft))} over`
                        : `${formatINR(budgetLeft)} left`}{" "}
                      of {formatINR(props.budget)}
                    </span>
                  </div>
                </div>
              )}
              <div
                className="grid grid-cols-3 gap-px overflow-hidden rounded-[14px]"
                style={{ background: "var(--m-ink-line)" }}
              >
                <HeroStat
                  value={String(props.totalTransactions)}
                  label="transactions"
                />
                <HeroStat
                  value={formatCompactINR(props.avgTransaction)}
                  label="avg spend"
                />
                <HeroStat
                  value={formatCompactINR(props.trackedTotal)}
                  label="set aside"
                />
              </div>
            </div>

            <ReviewBanner
              pending={pending}
              onFixCategory={(t) => setEditTx(t)}
              onReviewAll={() => {
                setFilters({ ...EMPTY_FILTERS, status: "needs_review" });
                switchTab("activity");
              }}
            />

            {props.outstandingTotal > 0 && (
              <Link
                href="/recoverables"
                className="flex items-center gap-3 rounded-[20px] border border-[var(--m-border)] bg-white p-4"
              >
                <span
                  className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[13px] text-[15px] font-extrabold"
                  style={{
                    background: "var(--m-positive-surface)",
                    color: "var(--m-positive)",
                  }}
                >
                  ₹
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
                    Owed to you
                  </span>
                  <span className="m-tnum text-[18px] font-extrabold text-[var(--m-ink)]">
                    {formatINR(props.outstandingTotal)}
                  </span>
                </div>
                <span className="text-[12px] font-bold text-[var(--m-text-tertiary)]">
                  {props.outstandingCount}{" "}
                  {props.outstandingCount === 1 ? "person" : "people"} ›
                </span>
              </Link>
            )}

            {props.categorySlices.length > 0 && (
              <div className="flex flex-col gap-3.5 rounded-[20px] border border-[var(--m-border)] bg-white p-[18px]">
                <div className="flex items-center justify-between">
                  <span className="text-[15px] font-extrabold text-[var(--m-ink)]">
                    Where it went
                  </span>
                  <span className="text-[12px] font-bold text-[var(--m-text-tertiary)]">
                    Top {Math.min(5, props.categorySlices.length)} of{" "}
                    {props.categorySlices.length}
                  </span>
                </div>
                <RankedBars
                  slices={props.categorySlices.slice(0, 5)}
                  onSelect={goToCategory}
                />
                {props.categorySlices.length > 5 && (
                  <button
                    type="button"
                    onClick={() => switchTab("insights")}
                    className="h-10 cursor-pointer rounded-[13px] border border-[var(--m-border-strong)] bg-[var(--m-canvas)] text-[13px] font-extrabold text-[var(--m-ink)]"
                  >
                    See all categories
                  </button>
                )}
              </div>
            )}

            {props.dailySpend.length > 0 && (
              <div className="flex flex-col gap-4 rounded-[20px] border border-[var(--m-border)] bg-white p-[18px]">
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-extrabold text-[var(--m-ink)]">
                    Daily spending
                  </span>
                  <span className="text-[12px] font-bold text-[var(--m-text-tertiary)]">
                    Last {props.dailySpend.length} days
                  </span>
                </div>
                <MiniBarChart
                  bars={props.dailySpend.map((d) => ({
                    short: d.label,
                    label: formatCompactINR(d.amount),
                    amount: d.amount,
                  }))}
                />
              </div>
            )}
          </div>
        )}

        {tab === "activity" && (
          <div className="flex flex-col pb-32">
            <div className="sticky top-0 z-[3] flex flex-col gap-2.5 bg-[var(--m-canvas)] px-5 pt-0.5 pb-2.5">
              <div className="flex gap-2">
                <div className="flex h-11 flex-1 items-center gap-2.5 rounded-[14px] bg-[var(--m-fill-strong)] px-3.5">
                  <Search className="h-3.5 w-3.5 flex-none text-[var(--m-text-quaternary)]" />
                  <input
                    value={filters.query}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, query: e.target.value }))
                    }
                    placeholder="Search merchant or remark"
                    className="w-full bg-transparent text-[14px] font-semibold text-[var(--m-ink)] outline-none placeholder:text-[var(--m-text-quaternary)]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSheet("filter")}
                  className="relative flex h-11 w-11 flex-none cursor-pointer items-center justify-center rounded-[14px] border-0 bg-[var(--m-ink)] text-[var(--m-canvas)]"
                  aria-label="Filters"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  {filterCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-[var(--m-ink)]"
                      style={{ background: "var(--m-warn)" }}
                    >
                      {filterCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="m-noscroll flex gap-[7px] overflow-x-auto pb-0.5">
                <Chip
                  label="All"
                  active={filterCount === 0 && filters.status === "all"}
                  onClick={() => setFilters(EMPTY_FILTERS)}
                />
                <Chip
                  label="Needs review"
                  count={pending.length}
                  active={filters.status === "needs_review"}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      status:
                        f.status === "needs_review" ? "all" : "needs_review",
                    }))
                  }
                />
                <Chip
                  label="Large"
                  active={filters.amountBand === "gt25k"}
                  onClick={() =>
                    setFilters((f) => ({
                      ...f,
                      amountBand: f.amountBand === "gt25k" ? null : "gt25k",
                    }))
                  }
                />
                {categoryNames.slice(0, 6).map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    active={filters.categories.includes(name)}
                    onClick={() =>
                      setFilters((f) => ({
                        ...f,
                        categories: f.categories.includes(name)
                          ? f.categories.filter((c) => c !== name)
                          : [...f.categories, name],
                      }))
                    }
                  />
                ))}
              </div>
              <div className="flex items-baseline justify-between text-[12px] font-semibold text-[var(--m-text-tertiary)]">
                <span>
                  {filtered.length} of {props.transactions.length} transactions
                </span>
                <span className="m-tnum text-[13px] font-extrabold text-[var(--m-ink)]">
                  {formatINR(resultTotal)}
                </span>
              </div>
            </div>

            <TransactionCards
              transactions={filtered}
              onEdit={(t) => setEditTx(t)}
              onDelete={(t) => setDeleteTx(t)}
              onClearFilters={() => setFilters(EMPTY_FILTERS)}
            />
          </div>
        )}

        {tab === "insights" && (
          <div className="flex flex-col gap-3.5 px-5 pt-0.5 pb-32">
            <div className="flex flex-col gap-3.5 rounded-[20px] border border-[var(--m-border)] bg-white p-[18px]">
              <span className="text-[15px] font-extrabold text-[var(--m-ink)]">
                All categories
              </span>
              {props.categorySlices.length > 0 ? (
                <RankedBars slices={props.categorySlices} onSelect={goToCategory} />
              ) : (
                <p className="text-[13px] font-semibold text-[var(--m-text-tertiary)]">
                  No spending this month.
                </p>
              )}
            </div>
            {props.insightCopy && (
              <div className="flex flex-col gap-3 rounded-[20px] border border-[var(--m-border)] bg-white p-[18px]">
                <span className="text-[15px] font-extrabold text-[var(--m-ink)]">
                  Summary
                </span>
                <p className="text-[13px] font-semibold leading-relaxed text-[var(--m-text-secondary)]">
                  {props.insightCopy}
                </p>
              </div>
            )}
            <Link
              href="/analytics"
              className="flex h-12 items-center justify-center rounded-[16px] border border-[var(--m-border-strong)] bg-white text-[14px] font-extrabold text-[var(--m-ink)]"
            >
              Open full analytics
            </Link>
          </div>
        )}

        {tab === "more" && (
          <div className="flex flex-col gap-3.5 px-5 pt-0.5 pb-32">
            <div className="flex flex-col overflow-hidden rounded-[20px] border border-[var(--m-border)] bg-white">
              {props.moreItems.map((item, i) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-[60px] items-center gap-3 px-4 py-3.5"
                  style={{
                    borderTop:
                      i === 0 ? "none" : "1px solid var(--m-fill-subtle)",
                  }}
                >
                  <div className="flex flex-1 flex-col gap-1">
                    <span className="text-[14px] font-bold text-[var(--m-ink)]">
                      {item.label}
                    </span>
                    <span className="text-[12px] font-semibold text-[var(--m-text-tertiary)]">
                      {item.sub}
                    </span>
                  </div>
                  <span className="text-[13px] font-extrabold text-[var(--m-text-tertiary)]">
                    {item.value} ›
                  </span>
                </Link>
              ))}
            </div>
            <form action={props.onSignOut}>
              <button
                type="submit"
                className="h-[50px] w-full cursor-pointer rounded-[16px] border border-[var(--m-border-strong)] bg-white text-[14px] font-extrabold text-[var(--m-ink)]"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Sheets & dialogs */}
      <FilterSheet
        open={sheet === "filter"}
        onClose={() => setSheet(null)}
        filters={filters}
        categoryNames={categoryNames}
        resultCount={filtered.length}
        onToggleCategory={(name) =>
          setFilters((f) => ({
            ...f,
            categories: f.categories.includes(name)
              ? f.categories.filter((c) => c !== name)
              : [...f.categories, name],
          }))
        }
        onSetAmountBand={(band) =>
          setFilters((f) => ({ ...f, amountBand: band }))
        }
        onClear={() => setFilters(EMPTY_FILTERS)}
      />
      <AddExpenseSheet
        open={sheet === "add"}
        categories={props.categories}
        onClose={() => setSheet(null)}
      />
      <EditTransactionSheet
        transaction={editTx}
        categories={props.categories}
        knownCounterparties={props.knownCounterparties}
        onClose={() => setEditTx(null)}
      />
      <ConfirmDelete transaction={deleteTx} onClose={() => setDeleteTx(null)} />

      {/* Bottom tab bar */}
      <div
        className="absolute inset-x-0 bottom-0 z-[5] flex items-end gap-1 border-t px-3.5 pt-2 pb-5"
        style={{
          background: "rgba(251,250,248,0.94)",
          backdropFilter: "blur(12px)",
          borderColor: "#eae7e2",
        }}
      >
        <TabButton
          icon={<Home className="h-5 w-5" />}
          label="Home"
          active={tab === "home"}
          onClick={() => switchTab("home")}
        />
        <TabButton
          icon={<Receipt className="h-5 w-5" />}
          label="Activity"
          active={tab === "activity"}
          onClick={() => switchTab("activity")}
        />
        <button
          type="button"
          onClick={() => setSheet("add")}
          className="mx-0.5 flex h-[58px] w-[58px] flex-none cursor-pointer items-center justify-center rounded-[20px] border-0 text-[var(--m-canvas)]"
          style={{
            background: "var(--m-ink)",
            boxShadow: "0 10px 22px -8px rgba(20,19,15,0.6)",
          }}
          aria-label="Add expense"
        >
          <Plus className="h-7 w-7" />
        </button>
        <TabButton
          icon={<PieChart className="h-5 w-5" />}
          label="Insights"
          active={tab === "insights"}
          onClick={() => switchTab("insights")}
        />
        <TabButton
          icon={<MoreHorizontal className="h-5 w-5" />}
          label="More"
          active={tab === "more"}
          onClick={() => switchTab("more")}
        />
      </div>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div
      className="flex flex-col gap-1 p-3"
      style={{ background: "var(--m-ink-raised)" }}
    >
      <span className="m-tnum text-[17px] font-extrabold">{value}</span>
      <span className="text-[11px] font-semibold text-[var(--m-ink-muted)]">
        {label}
      </span>
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[34px] flex-none cursor-pointer items-center gap-1.5 rounded-[11px] border px-3.5 text-[13px] font-extrabold ${
        active
          ? "border-[var(--m-ink)] bg-[var(--m-ink)] text-[var(--m-canvas)]"
          : "border-[var(--m-border-strong)] bg-white text-[var(--m-ink)]"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-[11px] font-bold opacity-65">{count}</span>
      )}
    </button>
  );
}

function TabButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[54px] flex-1 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border-0 bg-transparent"
      style={{ color: active ? "var(--m-ink)" : "var(--m-text-quaternary)" }}
    >
      {icon}
      <span className="text-[10px] font-extrabold">{label}</span>
    </button>
  );
}
