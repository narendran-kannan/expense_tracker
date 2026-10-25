"use client";

import { useState, useTransition } from "react";
import {
  deleteIgnoredTransaction,
  restoreIgnoredTransaction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { RotateCcw, Trash2 } from "lucide-react";

export interface IgnoredItem {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  is_cc_payment: boolean;
  match_fingerprint: boolean;
  source: string;
  created_at: string;
  expires_at: string;
  days_left: number;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function IgnoredRow({ item }: { item: IgnoredItem }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function restore() {
    setError(null);
    startTransition(async () => {
      try {
        await restoreIgnoredTransaction(item.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not restore");
      }
    });
  }

  function removeForever() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteIgnoredTransaction(item.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not delete");
      }
    });
  }

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDate(item.created_at)}
      </TableCell>
      <TableCell>
        <div className="font-medium">{item.merchant}</div>
        <div className="text-xs text-muted-foreground">
          {formatDate(item.date)} · {item.category}
          {item.match_fingerprint && (
            <Badge variant="outline" className="ml-2">
              matches repeats
            </Badge>
          )}
        </div>
        {error && (
          <div className="mt-1 text-xs text-destructive">{error}</div>
        )}
      </TableCell>
      <TableCell className="font-medium">
        {formatINR(item.amount)}
      </TableCell>
      <TableCell className="whitespace-nowrap text-xs">
        {item.days_left}d left
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            title="Restore"
            onClick={restore}
            disabled={isPending}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                title="Delete forever"
                disabled={isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete forever?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently removes the {formatINR(item.amount)}{" "}
                  transaction at {item.merchant} and its ignore tombstone. The
                  source email may be imported again on a future run. This
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={removeForever}>
                  Delete forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function IgnoredList({ items }: { items: IgnoredItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Nothing ignored. Deleted transactions will appear here for a while so
        they cannot be re-imported from email.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Deleted</TableHead>
            <TableHead>Transaction</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <IgnoredRow key={item.id} item={item} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
