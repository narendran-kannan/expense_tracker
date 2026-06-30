"use client";

import { useMemo, useState, useTransition } from "react";
import {
  updateTransaction,
  deleteTransaction,
  markRecoverable,
  markAsEmi,
  unmarkEmi,
  cloneTransaction,
  groupTransactions,
  ungroupAll,
} from "@/app/actions";
import { effectiveSpend, RECOVERY_STATUS } from "@/lib/recoverable";
import { defaultMonthlyAmount } from "@/lib/emi";
import type { SerializedRepayment, EmiInstallmentDTO } from "@/app/actions";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CategorySelect } from "@/components/category-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Copy,
  HandCoins,
  Layers,
  Pencil,
  Trash2,
  Ungroup,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  date: string | Date;
  category: string;
  subcategory?: string | null;
  is_cc_payment: boolean;
  confidence_score: number;
  needs_review: boolean;
  remarks: string | null;
  recoverable_amount?: number | null;
  recovery_status?: string | null;
  counterparty?: string | null;
  group_id?: string | null;
  repayments?: SerializedRepayment[];
  is_emi?: boolean | null;
  emi_tenure_months?: number | null;
  emi_monthly_amount?: number | null;
  emi_start_date?: string | null;
}

function txEffectiveSpend(t: Transaction) {
  return effectiveSpend({
    amount: t.amount,
    recoverable_amount: t.recoverable_amount ?? null,
    recovery_status: t.recovery_status ?? null,
    repayments: t.repayments,
    is_emi: t.is_emi ?? null,
    emi_tenure_months: t.emi_tenure_months ?? null,
    emi_monthly_amount: t.emi_monthly_amount ?? null,
    emi_start_date: t.emi_start_date ?? null,
    date: t.date,
  });
}

type StatusFilter = "all" | "verified" | "needs_review" | "cc_payment";

type DisplayRow =
  | { kind: "single"; transaction: Transaction }
  | { kind: "group"; groupId: string; members: Transaction[] };

const ALL_VALUE = "__all__";
const NONE_VALUE = "__none__";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function toDateInputValue(date: string | Date) {
  const d = new Date(date);
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 10);
}

export function TransactionTable({
  transactions,
  categories,
  knownCounterparties = [],
  emiInstallments = [],
}: {
  transactions: Transaction[];
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
  knownCounterparties?: string[];
  emiInstallments?: EmiInstallmentDTO[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL_VALUE);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string>(ALL_VALUE);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isGrouping, startGrouping] = useTransition();

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelected(new Set());
  }

  function handleGroupSelected() {
    if (selected.size < 2) return;
    startGrouping(async () => {
      await groupTransactions(Array.from(selected));
      exitSelectionMode();
    });
  }

  const availableSubcategories = useMemo(() => {
    if (categoryFilter === ALL_VALUE) return [];
    return (
      categories.find((c) => c.name === categoryFilter)?.subcategories ?? []
    );
  }, [categories, categoryFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const min = minAmount.trim() === "" ? null : Number(minAmount);
    const max = maxAmount.trim() === "" ? null : Number(maxAmount);

    return transactions.filter((t) => {
      if (query) {
        const haystack = `${t.merchant} ${t.remarks ?? ""}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      if (categoryFilter !== ALL_VALUE && t.category !== categoryFilter) {
        return false;
      }
      if (subcategoryFilter !== ALL_VALUE) {
        if (subcategoryFilter === NONE_VALUE) {
          if (t.subcategory) return false;
        } else if (t.subcategory !== subcategoryFilter) {
          return false;
        }
      }
      if (status === "verified" && (t.needs_review || t.is_cc_payment)) {
        return false;
      }
      if (status === "needs_review" && !t.needs_review) return false;
      if (status === "cc_payment" && !t.is_cc_payment) return false;
      if (min !== null && Number.isFinite(min) && t.amount < min) return false;
      if (max !== null && Number.isFinite(max) && t.amount > max) return false;
      return true;
    });
  }, [
    transactions,
    search,
    categoryFilter,
    subcategoryFilter,
    status,
    minAmount,
    maxAmount,
  ]);

  const filteredTotal = useMemo(
    () =>
      filtered
        .filter((t) => !t.is_cc_payment)
        .reduce((sum, t) => sum + txEffectiveSpend(t), 0),
    [filtered]
  );

  const monthTotal = useMemo(
    () =>
      transactions
        .filter((t) => !t.is_cc_payment)
        .reduce((sum, t) => sum + txEffectiveSpend(t), 0),
    [transactions]
  );

  const displayRows = useMemo<DisplayRow[]>(() => {
    const groups = new Map<string, Transaction[]>();
    const rows: DisplayRow[] = [];

    for (const t of filtered) {
      if (t.group_id) {
        const arr = groups.get(t.group_id) ?? [];
        arr.push(t);
        groups.set(t.group_id, arr);
      }
    }

    const emitted = new Set<string>();
    for (const t of filtered) {
      if (t.group_id && (groups.get(t.group_id)?.length ?? 0) > 1) {
        if (emitted.has(t.group_id)) continue;
        emitted.add(t.group_id);
        const members = groups.get(t.group_id)!;
        rows.push({ kind: "group", groupId: t.group_id, members });
      } else {
        rows.push({ kind: "single", transaction: t });
      }
    }
    return rows;
  }, [filtered]);

  const hasActiveFilters =
    search.trim() !== "" ||
    categoryFilter !== ALL_VALUE ||
    subcategoryFilter !== ALL_VALUE ||
    status !== "all" ||
    minAmount.trim() !== "" ||
    maxAmount.trim() !== "";

  const percentOfMonth =
    monthTotal > 0 ? (filteredTotal / monthTotal) * 100 : 0;

  function clearFilters() {
    setSearch("");
    setCategoryFilter(ALL_VALUE);
    setSubcategoryFilter(ALL_VALUE);
    setStatus("all");
    setMinAmount("");
    setMaxAmount("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search merchant or remarks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
              aria-label="Search transactions"
            />
            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value);
                setSubcategoryFilter(ALL_VALUE);
              }}
            >
              <SelectTrigger className="h-9" aria-label="Filter by category">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.name} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subcategoryFilter}
              onValueChange={setSubcategoryFilter}
              disabled={categoryFilter === ALL_VALUE}
            >
              <SelectTrigger
                className="h-9"
                aria-label="Filter by subcategory"
              >
                <SelectValue placeholder="Subcategory" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_VALUE}>All subcategories</SelectItem>
                <SelectItem value={NONE_VALUE}>No subcategory</SelectItem>
                {availableSubcategories.map((s) => (
                  <SelectItem key={s.id} value={s.name}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as StatusFilter)}
            >
              <SelectTrigger className="h-9" aria-label="Filter by status">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="verified">Verified</SelectItem>
                <SelectItem value="needs_review">Needs Review</SelectItem>
                <SelectItem value="cc_payment">CC Payments</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Min ₹"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              className="h-9 w-28"
              aria-label="Minimum amount"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              inputMode="decimal"
              placeholder="Max ₹"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              className="h-9 w-28"
              aria-label="Maximum amount"
            />
            <div className="ml-auto flex items-center gap-2">
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9"
                >
                  <X className="mr-1 h-4 w-4" />
                  Clear filters
                </Button>
              )}
              {selectionMode ? (
                <>
                  <Button
                    size="sm"
                    onClick={handleGroupSelected}
                    disabled={selected.size < 2 || isGrouping}
                    className="h-9"
                  >
                    <Layers className="mr-1 h-4 w-4" />
                    Group {selected.size > 0 ? `(${selected.size})` : ""}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={exitSelectionMode}
                    className="h-9"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectionMode(true)}
                  className="h-9"
                >
                  <Layers className="mr-1 h-4 w-4" />
                  Group expenses
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-baseline justify-between gap-2 border-t pt-3 text-sm">
            <span className="text-muted-foreground">
              Showing{" "}
              <span className="font-medium text-foreground">
                {filtered.length}
              </span>{" "}
              of{" "}
              <span className="font-medium text-foreground">
                {transactions.length}
              </span>{" "}
              transactions
            </span>
            <span className="text-muted-foreground">
              Total:{" "}
              <span className="text-base font-semibold text-foreground">
                {formatINR(filteredTotal)}
              </span>
              {hasActiveFilters && monthTotal > 0 && (
                <span className="ml-1">
                  ({percentOfMonth.toFixed(1)}% of month)
                </span>
              )}
            </span>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {transactions.length === 0
              ? "No transactions found for this month."
              : "No transactions match the current filters."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {selectionMode && <TableHead className="w-8" />}
                <TableHead>Date</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row) =>
                row.kind === "group" ? (
                  <GroupRow
                    key={row.groupId}
                    groupId={row.groupId}
                    members={row.members}
                    categories={categories}
                    knownCounterparties={knownCounterparties}
                    selectionMode={selectionMode}
                    selected={selected}
                    onToggleSelected={toggleSelected}
                  />
                ) : (
                  <TransactionRow
                    key={row.transaction.id}
                    transaction={row.transaction}
                    categories={categories}
                    knownCounterparties={knownCounterparties}
                    selectionMode={selectionMode}
                    selected={selected.has(row.transaction.id)}
                    onToggleSelected={toggleSelected}
                  />
                )
              )}
            </TableBody>
          </Table>
        )}

        {emiInstallments.length > 0 && (
          <div className="space-y-2 rounded-lg border border-dashed bg-muted/20 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <CalendarClock className="h-4 w-4 text-muted-foreground" />
                EMI installments this month
              </div>
              <span className="text-sm text-muted-foreground">
                {formatINR(
                  emiInstallments.reduce((sum, i) => sum + i.amount, 0)
                )}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              Projected from purchases bought on EMI in earlier months. Counted
              in your spend total but paid via your credit card bill (excluded
              separately to avoid double-counting).
            </p>
            <Table>
              <TableBody>
                {emiInstallments.map((i) => (
                  <TableRow key={i.id} className="text-muted-foreground">
                    <TableCell>
                      {new Date(i.date).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>{i.merchant}</TableCell>
                    <TableCell className="font-medium text-foreground">
                      {formatINR(i.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {i.subcategory
                          ? `${i.category} / ${i.subcategory}`
                          : i.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary" className="text-xs">
                        <CalendarClock className="mr-1 h-3 w-3" />
                        EMI {i.installmentNumber}/{i.tenureMonths}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TransactionRow({
  transaction: t,
  categories,
  knownCounterparties,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  nested = false,
}: {
  transaction: Transaction;
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
  knownCounterparties: string[];
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
  nested?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState(t.merchant);
  const [amount, setAmount] = useState(String(t.amount));
  const [category, setCategory] = useState(t.category);
  const [subcategory, setSubcategory] = useState<string | null>(t.subcategory ?? null);
  const [remarks, setRemarks] = useState(t.remarks ?? "");
  const [isCcPayment, setIsCcPayment] = useState(t.is_cc_payment);
  const [recoverableOpen, setRecoverableOpen] = useState(false);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneDate, setCloneDate] = useState(() => toDateInputValue(t.date));
  const [counterparty, setCounterparty] = useState(t.counterparty ?? "");
  const [recoverableAmt, setRecoverableAmt] = useState(
    t.recoverable_amount != null ? String(t.recoverable_amount) : String(t.amount)
  );
  const [emiOpen, setEmiOpen] = useState(false);
  const [emiTenure, setEmiTenure] = useState(
    t.emi_tenure_months != null ? String(t.emi_tenure_months) : "6"
  );
  const [emiMonthly, setEmiMonthly] = useState(() =>
    t.emi_monthly_amount != null
      ? String(t.emi_monthly_amount)
      : String(defaultMonthlyAmount(t.amount, 6))
  );
  const [emiStart, setEmiStart] = useState(() =>
    toDateInputValue(t.emi_start_date ?? t.date)
  );
  const [isPending, startTransition] = useTransition();

  const isRecoverable = t.recoverable_amount != null;
  const status = t.recovery_status ?? null;
  const isEmiTxn = t.is_emi === true && t.emi_tenure_months != null;

  function handleTenureChange(value: string) {
    setEmiTenure(value);
    const tenure = parseInt(value, 10);
    if (Number.isFinite(tenure) && tenure >= 1) {
      setEmiMonthly(String(defaultMonthlyAmount(t.amount, tenure)));
    }
  }

  function handleSave() {
    startTransition(async () => {
      await updateTransaction(t.id, {
        merchant,
        amount: parseFloat(amount),
        category,
        subcategory,
        remarks: remarks.trim() || null,
        is_cc_payment: isCcPayment,
      });
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(() => deleteTransaction(t.id));
  }

  function handleClone() {
    startTransition(async () => {
      await cloneTransaction(t.id, new Date(cloneDate).toISOString());
      setCloneOpen(false);
    });
  }

  function handleCancel() {
    setMerchant(t.merchant);
    setAmount(String(t.amount));
    setCategory(t.category);
    setSubcategory(t.subcategory ?? null);
    setRemarks(t.remarks ?? "");
    setIsCcPayment(t.is_cc_payment);
    setEditing(false);
  }

  return (
    <TableRow className={t.is_cc_payment ? "opacity-50" : ""}>
      {selectionMode && (
        <TableCell className="w-8">
          {!nested && (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected?.(t.id)}
              aria-label={`Select transaction to ${t.merchant}`}
            />
          )}
        </TableCell>
      )}
      <TableCell className={nested ? "pl-8 text-muted-foreground" : ""}>
        {new Date(t.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            className="h-8 w-40"
          />
        ) : (
          t.merchant
        )}
      </TableCell>
      <TableCell className="font-medium">
        {editing ? (
          <div className="space-y-1">
            <Input
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-8 w-28"
            />
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={isCcPayment}
                onCheckedChange={(checked) => setIsCcPayment(checked === true)}
                className="h-3.5 w-3.5"
              />
              CC Payment
            </label>
          </div>
        ) : (
          <>
            {formatINR(t.amount)}
            {t.is_cc_payment && (
              <Badge variant="secondary" className="ml-2 text-xs">
                CC Payment
              </Badge>
            )}
            {isRecoverable && status !== RECOVERY_STATUS.RECOVERED && (
              <div className="mt-1 text-xs text-muted-foreground">
                Effective:{" "}
                <span className="font-medium text-foreground">
                  {formatINR(txEffectiveSpend(t))}
                </span>
              </div>
            )}
            {isEmiTxn && (
              <div className="mt-1 text-xs text-muted-foreground">
                This month:{" "}
                <span className="font-medium text-foreground">
                  {formatINR(txEffectiveSpend(t))}
                </span>{" "}
                · {t.emi_tenure_months}-mo EMI
              </div>
            )}
          </>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
            <CategorySelect
              value={category}
              onChange={setCategory}
              subcategory={subcategory}
              onSubcategoryChange={setSubcategory}
              categories={categories.map((categoryItem) => ({
                name: categoryItem.name,
                subcategories: categoryItem.subcategories.map((item) => item.name),
              }))}
              className="h-8 w-44"
            />
        ) : (
          <Badge variant="outline">
            {t.subcategory ? `${t.category} / ${t.subcategory}` : t.category}
          </Badge>
        )}
      </TableCell>
      <TableCell>
        {editing ? (
          <Input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Add a note..."
            className="h-8 w-44"
          />
        ) : (
          <span className="text-sm text-muted-foreground">
            {t.remarks || "—"}
          </span>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-col items-start gap-1">
          {t.needs_review ? (
            <Badge variant="destructive">Needs Review</Badge>
          ) : (
            <Badge variant="default">Verified</Badge>
          )}
          {isEmiTxn && (
            <Badge variant="secondary" className="text-xs">
              <CalendarClock className="mr-1 h-3 w-3" />
              EMI · {t.emi_tenure_months} mo
            </Badge>
          )}
          {isRecoverable && (
            <Link
              href="/recoverables"
              className="inline-flex items-center"
              title={`Owed by ${t.counterparty ?? ""}`}
            >
              <Badge
                variant={
                  status === RECOVERY_STATUS.RECOVERED
                    ? "secondary"
                    : status === RECOVERY_STATUS.WRITTEN_OFF
                      ? "outline"
                      : "default"
                }
                className="text-xs"
              >
                {status === RECOVERY_STATUS.RECOVERED
                  ? "Recovered"
                  : status === RECOVERY_STATUS.WRITTEN_OFF
                    ? "Written off"
                    : status === RECOVERY_STATUS.PARTIAL
                      ? "Partial"
                      : "Pending"}
                {t.counterparty ? ` · ${t.counterparty}` : ""}
              </Badge>
            </Link>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={handleCancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditing(true)}
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => {
                  setCloneDate(toDateInputValue(t.date));
                  setCloneOpen(true);
                }}
                title="Clone (duplicate for a recurring expense)"
                disabled={isPending}
              >
                <Copy className="h-4 w-4" />
              </Button>
              {!isRecoverable && !isEmiTxn && !t.is_cc_payment && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setRecoverableOpen(true)}
                  title="Mark as recoverable (lent / reimbursable)"
                  disabled={isPending}
                >
                  <HandCoins className="h-4 w-4" />
                </Button>
              )}
              {!isRecoverable && !t.is_cc_payment && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => {
                    if (isEmiTxn) {
                      startTransition(() => unmarkEmi(t.id));
                    } else {
                      setEmiOpen(true);
                    }
                  }}
                  title={
                    isEmiTxn
                      ? "Remove EMI (revert to a single expense)"
                      : "Convert to EMI (spread over months)"
                  }
                  disabled={isPending}
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              )}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive"
                    disabled={isPending}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the {formatINR(t.amount)} transaction to {t.merchant}. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
        <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clone transaction</DialogTitle>
              <DialogDescription>
                Create a copy of the {formatINR(t.amount)} expense to{" "}
                {t.merchant}. Pick the date for the new transaction — handy for
                recurring expenses.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor={`clone-date-${t.id}`}>New date</Label>
              <Input
                id={`clone-date-${t.id}`}
                type="date"
                value={cloneDate}
                onChange={(e) => setCloneDate(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCloneOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleClone}
                disabled={isPending || cloneDate.trim() === ""}
              >
                Create copy
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={recoverableOpen} onOpenChange={setRecoverableOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark as recoverable</DialogTitle>
              <DialogDescription>
                Track this {formatINR(t.amount)} expense to {t.merchant} as
                money owed to you. It will reduce your spend total as the
                counterparty pays it back.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`counterparty-${t.id}`}>Who owes you?</Label>
                <Input
                  id={`counterparty-${t.id}`}
                  list={`counterparty-list-${t.id}`}
                  value={counterparty}
                  onChange={(e) => setCounterparty(e.target.value)}
                  placeholder="e.g. Ravi, Office, Mom"
                />
                <datalist id={`counterparty-list-${t.id}`}>
                  {knownCounterparties.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`recoverable-${t.id}`}>Amount owed (₹)</Label>
                <Input
                  id={`recoverable-${t.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  max={t.amount}
                  value={recoverableAmt}
                  onChange={(e) => setRecoverableAmt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Defaults to full amount. Lower it if only part is owed
                  (e.g. shared bill).
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setRecoverableOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const cp = counterparty.trim();
                  const amt = parseFloat(recoverableAmt);
                  if (!cp || !Number.isFinite(amt) || amt <= 0) return;
                  startTransition(async () => {
                    await markRecoverable(t.id, {
                      counterparty: cp,
                      recoverable_amount: amt,
                    });
                    setRecoverableOpen(false);
                  });
                }}
                disabled={
                  isPending ||
                  counterparty.trim() === "" ||
                  !Number.isFinite(parseFloat(recoverableAmt)) ||
                  parseFloat(recoverableAmt) <= 0 ||
                  parseFloat(recoverableAmt) > t.amount
                }
              >
                Mark recoverable
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={emiOpen} onOpenChange={setEmiOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convert to EMI</DialogTitle>
              <DialogDescription>
                Spread this {formatINR(t.amount)} purchase from {t.merchant}{" "}
                across monthly installments. Each month recognizes one
                installment instead of the full amount upfront. The actual
                payments ride your credit card bill, which stays excluded.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor={`emi-tenure-${t.id}`}>Tenure (months)</Label>
                <Input
                  id={`emi-tenure-${t.id}`}
                  type="number"
                  min="2"
                  step="1"
                  value={emiTenure}
                  onChange={(e) => handleTenureChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`emi-monthly-${t.id}`}>
                  Monthly installment (₹)
                </Label>
                <Input
                  id={`emi-monthly-${t.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={emiMonthly}
                  onChange={(e) => setEmiMonthly(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Pre-filled as a no-cost even split ({formatINR(t.amount)} ÷
                  tenure). Override it for the actual installment if needed.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`emi-start-${t.id}`}>First installment</Label>
                <Input
                  id={`emi-start-${t.id}`}
                  type="date"
                  value={emiStart}
                  onChange={(e) => setEmiStart(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEmiOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const tenure = parseInt(emiTenure, 10);
                  const monthly = parseFloat(emiMonthly);
                  if (!Number.isFinite(tenure) || tenure < 2) return;
                  startTransition(async () => {
                    await markAsEmi(t.id, {
                      tenureMonths: tenure,
                      monthlyAmount:
                        Number.isFinite(monthly) && monthly > 0
                          ? monthly
                          : undefined,
                      startDate: emiStart
                        ? new Date(emiStart).toISOString()
                        : undefined,
                    });
                    setEmiOpen(false);
                  });
                }}
                disabled={
                  isPending ||
                  !Number.isFinite(parseInt(emiTenure, 10)) ||
                  parseInt(emiTenure, 10) < 2
                }
              >
                Convert to EMI
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
}

function GroupRow({
  groupId,
  members,
  categories,
  knownCounterparties,
  selectionMode,
  selected,
  onToggleSelected,
}: {
  groupId: string;
  members: Transaction[];
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
  knownCounterparties: string[];
  selectionMode: boolean;
  selected: Set<string>;
  onToggleSelected: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  const groupTotal = members
    .filter((m) => !m.is_cc_payment)
    .reduce((sum, m) => sum + txEffectiveSpend(m), 0);

  const earliest = members.reduce((min, m) =>
    new Date(m.date) < new Date(min.date) ? m : min
  );
  const merchants = Array.from(new Set(members.map((m) => m.merchant)));
  const label =
    merchants.length === 1
      ? merchants[0]
      : `${merchants[0]} +${merchants.length - 1} more`;
  const needsReview = members.some((m) => m.needs_review);

  function handleUngroup() {
    startTransition(() => ungroupAll(groupId));
  }

  return (
    <>
      <TableRow className="bg-muted/40">
        {selectionMode && <TableCell className="w-8" />}
        <TableCell>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-left"
            aria-label={expanded ? "Collapse group" : "Expand group"}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {new Date(earliest.date).toLocaleDateString("en-IN", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })}
          </button>
        </TableCell>
        <TableCell className="font-medium">
          {label}
          <Badge variant="secondary" className="ml-2 text-xs">
            <Layers className="mr-1 h-3 w-3" />
            {members.length} payments
          </Badge>
        </TableCell>
        <TableCell className="font-medium">{formatINR(groupTotal)}</TableCell>
        <TableCell>
          <Badge variant="outline">{earliest.category}</Badge>
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          Grouped expense
        </TableCell>
        <TableCell>
          {needsReview ? (
            <Badge variant="destructive">Needs Review</Badge>
          ) : (
            <Badge variant="default">Verified</Badge>
          )}
        </TableCell>
        <TableCell className="text-right">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={handleUngroup}
            disabled={isPending}
            title="Ungroup"
          >
            <Ungroup className="h-4 w-4" />
          </Button>
        </TableCell>
      </TableRow>
      {expanded &&
        members.map((m) => (
          <TransactionRow
            key={m.id}
            transaction={m}
            categories={categories}
            knownCounterparties={knownCounterparties}
            selectionMode={selectionMode}
            selected={selected.has(m.id)}
            onToggleSelected={onToggleSelected}
            nested
          />
        ))}
    </>
  );
}
