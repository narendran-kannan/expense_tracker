"use client";

import { useState, useTransition, useEffect } from "react";
import {
  addBulkOveragePayment,
  previewBulkOveragePayment,
  type BulkPaymentPreview,
} from "@/app/actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Layers, ArrowRight } from "lucide-react";

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

interface BulkPaymentDialogProps {
  totalOutstanding: number;
}

export function BulkPaymentDialog({ totalOutstanding }: BulkPaymentDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<BulkPaymentPreview | null>(null);
  const [isPreviewing, startPreview] = useTransition();
  const [isSaving, startSave] = useTransition();

  const parsed = parseFloat(amount);
  const validAmount = !Number.isNaN(parsed) && parsed > 0;

  useEffect(() => {
    if (!open || !validAmount) {
      const clear = setTimeout(() => setPreview(null), 0);
      return () => clearTimeout(clear);
    }
    const handle = setTimeout(() => {
      startPreview(async () => {
        try {
          setPreview(await previewBulkOveragePayment(parsed));
        } catch {
          setPreview(null);
        }
      });
    }, 250);
    return () => clearTimeout(handle);
  }, [open, parsed, validAmount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validAmount) return;

    startSave(async () => {
      try {
        const res = await addBulkOveragePayment({
          amount: parsed,
          date,
          note: note || null,
        });
        if (res.monthsPaid === 0) {
          alert("Nothing outstanding to pay.");
          return;
        }
        let msg = `Applied ${formatINR(res.totalApplied)} across ${res.monthsPaid} ${res.monthsPaid === 1 ? "month" : "months"}.`;
        if (res.leftover > 0) {
          msg += ` ${formatINR(res.leftover)} was not needed (everything is settled).`;
        }
        alert(msg);
        setAmount("");
        setNote("");
        setPreview(null);
        setOpen(false);
      } catch (error) {
        alert(
          `Failed: ${error instanceof Error ? error.message : "Unknown error"}`
        );
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setAmount("");
          setNote("");
          setDate(new Date().toISOString().slice(0, 10));
          setPreview(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={totalOutstanding <= 0}>
          <Layers className="mr-1.5 h-4 w-4" /> Log bulk payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Log bulk payment</DialogTitle>
          <DialogDescription>
            Distributes across outstanding months oldest first, settling each
            before spilling into the next. Total outstanding:{" "}
            {formatINR(totalOutstanding)}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bulk-amount">Amount (INR)</Label>
            <Input
              id="bulk-amount"
              type="number"
              step="1"
              min="0"
              placeholder="e.g. 8000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-date">Date</Label>
            <Input
              id="bulk-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-note">Note (optional)</Label>
            <Textarea
              id="bulk-note"
              placeholder="e.g. Monthly settlement"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>

          {validAmount && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {isPreviewing ? "Calculating split…" : "Payment split preview"}
              </p>
              {preview && preview.items.length > 0 ? (
                <>
                  <div className="space-y-1.5">
                    {preview.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="text-muted-foreground">
                          {MONTHS[item.month]} {item.year}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="font-medium">
                            {formatINR(item.applied)}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span
                            className={
                              item.outstandingAfter <= 0
                                ? "text-emerald-600"
                                : "text-amber-600"
                            }
                          >
                            {item.outstandingAfter <= 0
                              ? "settled"
                              : `${formatINR(item.outstandingAfter)} left`}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {preview.leftover > 0 && (
                    <p className="border-t pt-2 text-xs text-muted-foreground">
                      {formatINR(preview.leftover)} not needed — everything would
                      be settled.
                    </p>
                  )}
                </>
              ) : preview && !isPreviewing ? (
                <p className="text-sm text-muted-foreground">
                  Nothing outstanding to pay.
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="flex-row justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving || !validAmount}>
              {isSaving ? "Applying…" : "Apply payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
