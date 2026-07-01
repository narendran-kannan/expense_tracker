import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getTransactions,
  getCategoriesWithSubs,
  getSkippedEmails,
  getBudgetForMonth,
  getTotalOutstanding,
  getKnownCounterparties,
  getEmiInstallmentsForMonth,
  getCarryoverSummary,
} from "./actions";
import { effectiveSpend } from "@/lib/recoverable";
import { OutstandingCard } from "@/components/outstanding-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryPieChart, DailyBarChart } from "@/components/charts";
import { PendingReviews } from "@/components/pending-reviews";
import { TransactionTable } from "@/components/transaction-table";
import { SkippedEmails } from "@/components/skipped-emails";
import { SeedButton } from "@/components/seed-button";
import { MonthSwitcher } from "@/components/month-switcher";
import { AddExpenseDialog } from "@/components/add-expense-dialog";
import { SetBudgetDialog } from "@/components/set-budget-dialog";
import { BudgetCard } from "@/components/budget-card";
import { CarryoverCard } from "@/components/carryover-card";
import { NavBar } from "@/components/nav-bar";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; year?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const month =
    params.month !== undefined ? parseInt(params.month, 10) : now.getMonth();
  const year =
    params.year !== undefined ? parseInt(params.year, 10) : now.getFullYear();

  const [
    transactions,
    categories,
    skippedEmails,
    budget,
    outstanding,
    knownCounterparties,
    emiInstallments,
    carryover,
  ] = await Promise.all([
    getTransactions(month, year),
    getCategoriesWithSubs(),
    getSkippedEmails(),
    getBudgetForMonth(month, year),
    getTotalOutstanding(),
    getKnownCounterparties(),
    getEmiInstallmentsForMonth(month, year),
    getCarryoverSummary(),
  ] as const);

  const carryoverMonthsOwing = carryover.months.filter(
    (m) => m.outstanding > 0
  ).length;

  const spendingTxns = transactions
    .filter((t) => !t.is_cc_payment)
    .map((t) => ({ t, effective: effectiveSpend(t) }))
    .filter((entry) => entry.effective > 0);

  const emiInstallmentTotal = emiInstallments.reduce(
    (sum, i) => sum + i.amount,
    0
  );

  const totalSpend =
    spendingTxns.reduce((sum, entry) => sum + entry.effective, 0) +
    emiInstallmentTotal;

  const totalTransactions = spendingTxns.length + emiInstallments.length;
  const pendingReviews = transactions.filter((t) => t.needs_review).length;
  const avgTransaction =
    totalTransactions > 0 ? totalSpend / totalTransactions : 0;

  const serialized = transactions.map((t) => ({
    ...t,
    date: t.date.toISOString(),
    emi_start_date: t.emi_start_date ? t.emi_start_date.toISOString() : null,
    subcategory: t.subcategoryRef?.name ?? null,
    repayments: t.repayments.map((r) => ({
      id: r.id,
      transaction_id: r.transaction_id,
      amount: r.amount,
      date: r.date.toISOString(),
      note: r.note,
      created_at: r.created_at.toISOString(),
    })),
  }));

  // For charts, use the effective spend amount so recoverables/EMIs don't
  // inflate category/day totals. Fully-recovered transactions are filtered out.
  // Virtual EMI installments are appended so future/past months reflect
  // committed EMI spend.
  const chartData = [
    ...transactions
      .map((t) => ({
        id: t.id,
        amount: effectiveSpend(t),
        merchant: t.merchant,
        date: t.date.toISOString(),
        category: t.category,
        subcategory: t.subcategoryRef?.name ?? null,
        is_cc_payment: t.is_cc_payment,
        confidence_score: t.confidence_score,
        needs_review: t.needs_review,
      }))
      .filter((t) => t.amount > 0 || t.is_cc_payment),
    ...emiInstallments.map((i) => ({
      id: i.id,
      amount: i.amount,
      merchant: i.merchant,
      date: i.date,
      category: i.category,
      subcategory: i.subcategory,
      is_cc_payment: false,
      confidence_score: 1,
      needs_review: false,
    })),
  ];

  const serializedSkipped = skippedEmails.map((s) => ({
    ...s,
    created_at: s.created_at.toISOString(),
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <NavBar />
              <h1 className="text-lg font-bold sm:text-xl md:hidden">Expense Tracker</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <SetBudgetDialog
              month={month}
              year={year}
              currentBudget={
                budget
                  ? {
                      id: budget.id,
                      amount: budget.amount,
                      start_month: budget.start_month,
                      start_year: budget.start_year,
                    }
                  : null
              }
            />
            <AddExpenseDialog />
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
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <MonthSwitcher month={month} year={year} />
            <p className="text-sm text-muted-foreground">
              Monthly spending overview
            </p>
          </div>
          {process.env.NODE_ENV !== "production" && <SeedButton />}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Monthly Spend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatINR(totalSpend)}</p>
              <p className="text-xs text-muted-foreground">
                Excludes credit card payments
              </p>
            </CardContent>
          </Card>

          {budget && (
            <BudgetCard budget={budget.amount} spent={totalSpend} />
          )}

          {carryover.totalOutstanding > 0 && (
            <CarryoverCard
              totalOutstanding={carryover.totalOutstanding}
              monthsOwing={carryoverMonthsOwing}
            />
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Transactions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalTransactions}</p>
              <p className="text-xs text-muted-foreground">This month</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Transaction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatINR(avgTransaction)}</p>
              <p className="text-xs text-muted-foreground">Per transaction</p>
            </CardContent>
          </Card>

          {!budget && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Pending Reviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{pendingReviews}</p>
                <p className="text-xs text-muted-foreground">
                  Need your attention
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {outstanding.total > 0 && (
          <OutstandingCard
            total={outstanding.total}
            counterpartyCount={outstanding.counterpartyCount}
          />
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <CategoryPieChart transactions={chartData} />
          <DailyBarChart transactions={chartData} />
        </div>

        <Separator />

        <Tabs defaultValue="all">
          <TabsList className="w-full">
            <TabsTrigger value="reviews">
              <span className="sm:hidden">Reviews</span>
              <span className="hidden sm:inline">Pending Reviews</span>
            </TabsTrigger>
            <TabsTrigger value="all">
              <span className="sm:hidden">All</span>
              <span className="hidden sm:inline">All Transactions</span>
            </TabsTrigger>
            <TabsTrigger value="skipped">
              <span className="sm:hidden">Skipped</span>
              <span className="hidden sm:inline">Skipped Emails</span>
              {serializedSkipped.length > 0 && (
                <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs">
                  {serializedSkipped.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="reviews" className="mt-4">
            <PendingReviews
              transactions={serialized}
              categories={categories}
            />
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <TransactionTable
              transactions={serialized}
              categories={categories}
              knownCounterparties={knownCounterparties}
              emiInstallments={emiInstallments}
            />
          </TabsContent>
          <TabsContent value="skipped" className="mt-4">
            <SkippedEmails
              skippedEmails={serializedSkipped}
              categories={categories}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
