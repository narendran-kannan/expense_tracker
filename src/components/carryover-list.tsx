"use client";

import { useState, useTransition } from "react";
import {
  addOveragePayment,
  deleteOveragePayment,
  setOverageOverride,
  setOverageOwedTo,
  type CarryoverMonthDTO,
} from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { OVERAGE_STATUS } from "@/lib/overage";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  if (status === OVERAGE_STATUS.SETTLED) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Settled
      </Badge>
    );
  }
  if (status === OVERAGE_STATUS.PARTIAL) {
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
        Partially paid
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
      Outstanding
    </Badge>
  );
}

function AddPaymentDialog({ overage }: { overage: CarryoverMonthDTO }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [isSaving, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) return;

    startTransition(async () => {
      try {
        await addOveragePayment(overage.id, {
          amount: parsed,
          date,
          note: note || null,
        });
        setAmount("");
        setNote("");
        setOpen(false);
      } catch (error) {
        alert(
          `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" disabled={overage.outstanding <= 0}>
          <Plus className="mr-1.5 h-4 w-4" /> Log payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>
            Log payment — {MONTHS[overage.month]} {overage.year}
          </DialogTitle>
          <DialogDescription>
            Record a partial or full payment against this month&apos;s overspend.
            Outstanding: {formatINR(overage.outstanding)}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pay-amount">Amount (INR)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="1"
              min="0"
              placeholder="e.g. 2000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-date">Date</Label>
            <Input
              id="pay-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pay-note">Note (optional)</Label>
            <Textarea
              id="pay-note"
              placeholder="e.g. UPI to dad"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OwedToEditor({ overage }: { overage: CarryoverMonthDTO }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(overage.owed_to ?? "");
  const [isSaving, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      await setOverageOwedTo(overage.id, value || null);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
        {overage.owed_to ? `Owed to: ${overage.owed_to}` : "Add who it's owed to"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Family, Credit card"
        className="h-7 w-40 text-xs"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={save}
        disabled={isSaving}
        aria-label="Save owed to"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Cancel owed to"
        onClick={() => {
          setValue(overage.owed_to ?? "");
          setEditing(false);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function OverrideEditor({ overage }: { overage: CarryoverMonthDTO }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(
    overage.override_amount != null ? String(overage.override_amount) : ""
  );
  const [isSaving, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const parsed = value.trim() === "" ? null : parseFloat(value);
      if (parsed != null && (Number.isNaN(parsed) || parsed < 0)) return;
      await setOverageOverride(overage.id, parsed);
      setEditing(false);
    });
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Pencil className="h-3 w-3" />
        {overage.override_amount != null ? "Edit custom amount" : "Set custom amount"}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="derived"
        className="h-7 w-28 text-xs"
      />
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        onClick={save}
        disabled={isSaving}
        aria-label="Save custom amount"
      >
        <Check className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Cancel custom amount"
        onClick={() => {
          setValue(
            overage.override_amount != null ? String(overage.override_amount) : ""
          );
          setEditing(false);
        }}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function PaymentRow({ payment }: { payment: CarryoverMonthDTO["payments"][number] }) {
  const [isDeleting, startTransition] = useTransition();

  const remove = () => {
    startTransition(async () => {
      await deleteOveragePayment(payment.id);
    });
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-col">
        <span className="font-medium">{formatINR(payment.amount)}</span>
        <span className="text-xs text-muted-foreground">
          {formatDate(payment.date)}
          {payment.note ? ` · ${payment.note}` : ""}
        </span>
      </div>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={remove}
        disabled={isDeleting}
        aria-label="Delete payment"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function CarryoverMonthCard({ overage }: { overage: CarryoverMonthDTO }) {
  const gross = overage.gross_overage;
  const pct = gross > 0 ? Math.min((overage.paid / gross) * 100, 100) : 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">
            {MONTHS[overage.month]} {overage.year}
          </CardTitle>
          <StatusBadge status={overage.status} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Budget: {formatINR(overage.budget_amount)}</span>
          <span>Spent: {formatINR(overage.spent_amount)}</span>
          <OwedToEditor overage={overage} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Overspend</p>
            <p className="text-lg font-bold">{formatINR(gross)}</p>
            {overage.override_amount != null && (
              <p className="text-[10px] uppercase tracking-wide text-amber-600">
                custom
              </p>
            )}
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Paid back</p>
            <p className="text-lg font-bold text-emerald-600">
              {formatINR(overage.paid)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className="text-lg font-bold text-amber-600">
              {formatINR(overage.outstanding)}
            </p>
          </div>
        </div>

        <Progress value={pct} className="h-2" />

        <div className="flex flex-wrap items-center justify-between gap-2">
          <OverrideEditor overage={overage} />
          <AddPaymentDialog overage={overage} />
        </div>

        {overage.payments.length > 0 && (
          <div className="space-y-2 pt-1">
            <p className="text-xs font-medium text-muted-foreground">
              Payment history
            </p>
            {overage.payments.map((p) => (
              <PaymentRow key={p.id} payment={p} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
