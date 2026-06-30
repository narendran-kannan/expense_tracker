import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getSpreadTransactionsForRange,
  getAvailableYears,
  getBudgetForMonth,
  getCachedInsight,
} from "@/app/actions";
import { effectiveSpend } from "@/lib/recoverable";
import { InsightsCard } from "@/components/insights-card";
import type { Period } from "@/lib/insights-period";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { NavBar } from "@/components/nav-bar";
import { AnalyticsPeriodSelector } from "@/components/analytics-period-selector";
import { AnalyticsStats } from "@/components/analytics-stats";
import {
  MonthlyTrendChart,
  AnalyticsPieChart,
  ParentCategoryPieChart,
  AnalyticsDailyBarChart,
  CategoryComparisonChart,
  SubcategoryComparisonChart,
  StackedAreaChart,
  TopMerchantsChart,
  WeekdayHeatmap,
  YearOverYearChart,
  BudgetVsActualChart,
} from "@/components/analytics-charts";

interface StatsTransaction {
  amount: number;
  is_cc_payment: boolean;
  recoverable_amount: number | null;
  recovery_status: string | null;
  repayments?: { amount: number }[];
}

function computeStats(transactions: StatsTransaction[]) {
  const spending = transactions
    .filter((t) => !t.is_cc_payment)
    .map((t) => effectiveSpend(t))
    .filter((amt) => amt > 0);
  const totalSpend = spending.reduce((s, amt) => s + amt, 0);
  const totalTransactions = spending.length;
  const avgTransaction =
    totalTransactions > 0 ? totalSpend / totalTransactions : 0;
  const maxSingleSpend =
    spending.length > 0 ? Math.max(...spending) : 0;
  return { totalSpend, totalTransactions, avgTransaction, maxSingleSpend };
}

function serialize(
  transactions: {
    id: string;
    amount: number;
    merchant: string;
    date: Date;
    category: string;
    subcategoryRef?: { name: string } | null;
    is_cc_payment: boolean;
    confidence_score: number;
    needs_review: boolean;
    email_message_id: string | null;
    remarks: string | null;
    source: string;
    created_at: Date;
    updated_at: Date;
    recoverable_amount: number | null;
    recovery_status: string | null;
    repayments: { amount: number }[];
  }[]
) {
  return transactions.map((t) => ({
    id: t.id,
    amount: effectiveSpend(t),
    merchant: t.merchant,
    date: t.date.toISOString(),
    category: t.category,
    subcategory: t.subcategoryRef?.name ?? null,
    is_cc_payment: t.is_cc_payment,
  }));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    category_mode?: string;
    month?: string;
    year?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const params = await searchParams;
  const now = new Date();
  const mode = params.view === "yearly" ? "yearly" : "monthly";
  const categoryMode =
    params.category_mode === "parent" ||
    params.category_mode === "subcategory" ||
    params.category_mode === "combined"
      ? params.category_mode
      : "combined";
  const month =
    params.month !== undefined ? parseInt(params.month, 10) : now.getMonth();
  const year =
    params.year !== undefined ? parseInt(params.year, 10) : now.getFullYear();

  const availableYears = await getAvailableYears();

  if (mode === "monthly") {
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear -= 1;
    }

    const monthlyPeriod: Period = { type: "month", year, month };
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const prevMonthStart = new Date(prevYear, prevMonth, 1);
    const prevMonthEnd = new Date(prevYear, prevMonth + 1, 0, 23, 59, 59, 999);
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
    const prevYearStart = new Date(year - 1, 0, 1);
    const prevYearEnd = new Date(year - 1, 11, 31, 23, 59, 59, 999);

    const [currentTxns, prevTxns, yearTxns, prevYearTxns, budget, cachedInsight] = await Promise.all([
      getSpreadTransactionsForRange(monthStart, monthEnd),
      getSpreadTransactionsForRange(prevMonthStart, prevMonthEnd),
      getSpreadTransactionsForRange(yearStart, yearEnd),
      getSpreadTransactionsForRange(prevYearStart, prevYearEnd),
      getBudgetForMonth(month, year),
      getCachedInsight(monthlyPeriod),
    ]);

    const current = serialize(currentTxns);
    const yearSerialized = serialize(yearTxns);
    const prevYearSerialized = serialize(prevYearTxns);

    const stats = computeStats(currentTxns);
    const prevStats = computeStats(prevTxns);

    const prevLabel = new Date(prevYear, prevMonth).toLocaleDateString(
      "en-IN",
      { month: "short", year: "numeric" }
    );

    const periodLabel = new Date(year, month).toLocaleDateString("en-IN", {
      month: "long",
      year: "numeric",
    });

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
          <div className="space-y-1">
            <h2 className="text-2xl font-bold">Analytics</h2>
            <p className="text-sm text-muted-foreground">
              Detailed spending insights and trends
            </p>
          </div>

          <AnalyticsPeriodSelector
            mode={mode}
            categoryMode={categoryMode}
            month={month}
            year={year}
            availableYears={availableYears}
          />

          <AnalyticsStats
            totalSpend={stats.totalSpend}
            totalTransactions={stats.totalTransactions}
            avgTransaction={stats.avgTransaction}
            maxSingleSpend={stats.maxSingleSpend}
            prevTotalSpend={prevStats.totalSpend}
            prevTotalTransactions={prevStats.totalTransactions}
            prevAvgTransaction={prevStats.avgTransaction}
            prevMaxSingleSpend={prevStats.maxSingleSpend}
            periodLabel={periodLabel}
            prevPeriodLabel={prevLabel}
          />

          <InsightsCard period={monthlyPeriod} initial={cachedInsight} />

          <Separator />

          <MonthlyTrendChart transactions={yearSerialized} year={year} />

          {budget && (
            <BudgetVsActualChart
              budget={budget.amount}
              spent={computeStats(currentTxns).totalSpend}
              month={month}
              year={year}
            />
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {categoryMode === "combined" ? (
              <ParentCategoryPieChart transactions={current} />
            ) : null}
            <AnalyticsPieChart transactions={current} mode={categoryMode} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopMerchantsChart transactions={current} />
            {categoryMode === "subcategory" || categoryMode === "combined" ? (
              <SubcategoryComparisonChart transactions={current} />
            ) : (
              <CategoryComparisonChart transactions={current} mode={categoryMode} />
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <AnalyticsDailyBarChart transactions={current} />
            <WeekdayHeatmap transactions={current} />
          </div>

          <CategoryComparisonChart transactions={current} mode={categoryMode} />

          <StackedAreaChart transactions={current} mode={categoryMode} />

          <YearOverYearChart
            currentTransactions={yearSerialized}
            previousTransactions={prevYearSerialized}
            currentYear={year}
            previousYear={year - 1}
          />
        </main>
      </div>
    );
  }

  const [yearTxns, prevYearTxns] = await Promise.all([
    getSpreadTransactionsForRange(
      new Date(year, 0, 1),
      new Date(year, 11, 31, 23, 59, 59, 999)
    ),
    getSpreadTransactionsForRange(
      new Date(year - 1, 0, 1),
      new Date(year - 1, 11, 31, 23, 59, 59, 999)
    ),
  ]);

  const yearSerialized = serialize(yearTxns);
  const prevYearSerialized = serialize(prevYearTxns);

  const stats = computeStats(yearTxns);
  const prevStats = computeStats(prevYearTxns);

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
        <div className="space-y-1">
          <h2 className="text-2xl font-bold">Analytics</h2>
          <p className="text-sm text-muted-foreground">
            Detailed spending insights and trends
          </p>
        </div>

          <AnalyticsPeriodSelector
            mode={mode}
            categoryMode={categoryMode}
            month={month}
            year={year}
            availableYears={availableYears}
        />

        <AnalyticsStats
          totalSpend={stats.totalSpend}
          totalTransactions={stats.totalTransactions}
          avgTransaction={stats.avgTransaction}
          maxSingleSpend={stats.maxSingleSpend}
          prevTotalSpend={prevStats.totalSpend}
          prevTotalTransactions={prevStats.totalTransactions}
          prevAvgTransaction={prevStats.avgTransaction}
          prevMaxSingleSpend={prevStats.maxSingleSpend}
          periodLabel={String(year)}
          prevPeriodLabel={String(year - 1)}
        />

        <Separator />

        <MonthlyTrendChart transactions={yearSerialized} year={year} />

          <div className="grid gap-6 lg:grid-cols-2">
            {categoryMode === "combined" ? (
              <ParentCategoryPieChart transactions={yearSerialized} />
            ) : null}
            <AnalyticsPieChart transactions={yearSerialized} mode={categoryMode} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <TopMerchantsChart transactions={yearSerialized} />
            {categoryMode === "subcategory" || categoryMode === "combined" ? (
              <SubcategoryComparisonChart transactions={yearSerialized} />
            ) : (
              <CategoryComparisonChart
                transactions={yearSerialized}
                mode={categoryMode}
              />
            )}
          </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AnalyticsDailyBarChart transactions={yearSerialized} />
          <WeekdayHeatmap transactions={yearSerialized} />
        </div>

        <CategoryComparisonChart transactions={yearSerialized} mode={categoryMode} />

        <StackedAreaChart transactions={yearSerialized} mode={categoryMode} />

        <YearOverYearChart
          currentTransactions={yearSerialized}
          previousTransactions={prevYearSerialized}
          currentYear={year}
          previousYear={year - 1}
        />
      </main>
    </div>
  );
}
