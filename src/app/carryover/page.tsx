import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCarryoverSummary } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { CarryoverMonthCard } from "@/components/carryover-list";
import { BulkPaymentDialog } from "@/components/bulk-payment-dialog";
import { Wallet } from "lucide-react";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function CarryoverPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const summary = await getCarryoverSummary();
  const monthsOwing = summary.months.filter((m) => m.outstanding > 0).length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <NavBar />
            <h1 className="text-lg font-bold sm:text-xl md:hidden">Expense Tracker</h1>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button variant="outline" size="sm" type="submit">
              <span className="hidden sm:inline">Sign Out</span>
              <span className="sm:hidden">Exit</span>
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2 text-2xl font-bold">
              <Wallet className="h-6 w-6" /> Budget Carryover
            </h2>
            <p className="text-sm text-muted-foreground">
              Every month that closed over budget becomes a carry-forward
              balance. Log payments as you pay it down. Amounts are derived live
              from your budget and spend; set a custom amount to override any
              month.
            </p>
          </div>
          <BulkPaymentDialog totalOutstanding={summary.totalOutstanding} />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Outstanding
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">
                {formatINR(summary.totalOutstanding)}
              </p>
              <p className="text-xs text-muted-foreground">
                {monthsOwing} {monthsOwing === 1 ? "month" : "months"} owing
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Overspent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatINR(summary.totalOverage)}</p>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Paid Back
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-600">
                {formatINR(summary.totalPaid)}
              </p>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>
        </div>

        {summary.months.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No over-budget months yet. When a month closes over its budget, it
              will show up here so you can track and pay down the overspend.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {summary.months.map((overage) => (
              <CarryoverMonthCard key={overage.id} overage={overage} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
