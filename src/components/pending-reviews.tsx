"use client";

import { useState, useTransition } from "react";
import {
  approveTransaction,
  updateTransaction,
  deleteTransaction,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect } from "@/components/category-select";

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
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function ConfidenceBadge({ score }: { score: number }) {
  const variant =
    score >= 0.8 ? "default" : score >= 0.6 ? "secondary" : "destructive";
  return <Badge variant={variant}>{(score * 100).toFixed(0)}%</Badge>;
}

export function PendingReviews({
  transactions,
  categories,
}: {
  transactions: Transaction[];
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
}) {
  const pending = transactions.filter((t) => t.needs_review);

  if (pending.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Pending Reviews</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          All transactions have been reviewed.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Pending Reviews{" "}
          <Badge variant="secondary" className="ml-2">
            {pending.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pending.map((t) => (
              <ReviewRow
                key={t.id}
                transaction={t}
                categories={categories}
              />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ReviewRow({
  transaction: t,
  categories,
}: {
  transaction: Transaction;
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
}) {
  const [editing, setEditing] = useState(false);
  const [category, setCategory] = useState(t.category);
  const [subcategory, setSubcategory] = useState<string | null>(t.subcategory ?? null);
  const [merchant, setMerchant] = useState(t.merchant);
  const [isCcPayment, setIsCcPayment] = useState(t.is_cc_payment);
  const [isPending, startTransition] = useTransition();

  function handleApprove() {
    startTransition(() => approveTransaction(t.id));
  }

  function handleSave() {
    startTransition(async () => {
      await updateTransaction(t.id, {
        category,
        subcategory,
        merchant,
        is_cc_payment: isCcPayment,
      });
      setEditing(false);
    });
  }

  function handleDelete() {
    startTransition(() => deleteTransaction(t.id));
  }

  return (
    <TableRow>
      <TableCell>
        {new Date(t.date).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
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
        {formatINR(t.amount)}
        {editing ? (
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
            <Checkbox
              checked={isCcPayment}
              onCheckedChange={(checked) => setIsCcPayment(checked === true)}
              className="h-3.5 w-3.5"
            />
            CC Payment
          </label>
        ) : (
          t.is_cc_payment && (
            <Badge variant="secondary" className="ml-2 text-xs">
              CC Payment
            </Badge>
          )
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
        <ConfidenceBadge score={t.confidence_score} />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {editing ? (
            <>
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button size="sm" onClick={handleApprove} disabled={isPending}>
                Approve
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isPending}
                  >
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Transaction</AlertDialogTitle>
                    <AlertDialogDescription>
                      This moves the {formatINR(t.amount)} transaction at{" "}
                      {t.merchant} to Ignored. The source email will not be
                      imported again, and you can restore it from Ignored for 30
                      days.
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
      </TableCell>
    </TableRow>
  );
}
