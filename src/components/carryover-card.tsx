import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wallet, ArrowRight } from "lucide-react";

interface CarryoverCardProps {
  totalOutstanding: number;
  monthsOwing: number;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function CarryoverCard({
  totalOutstanding,
  monthsOwing,
}: CarryoverCardProps) {
  const settled = totalOutstanding <= 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Wallet className="h-4 w-4" /> Carryover Owed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-baseline justify-between">
          <p className="text-2xl font-bold">{formatINR(totalOutstanding)}</p>
          <p
            className={
              settled
                ? "text-sm font-medium text-emerald-600"
                : "text-sm font-medium text-amber-600"
            }
          >
            {settled
              ? "All settled"
              : `${monthsOwing} ${monthsOwing === 1 ? "month" : "months"} over`}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Accumulated overspend across all over-budget months, minus what
          you&apos;ve paid back.
        </p>
        <Link
          href="/carryover"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage carryover
          <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
