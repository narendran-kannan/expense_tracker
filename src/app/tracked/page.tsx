import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  getTransactions,
  getCategoriesWithSubs,
  getKnownCounterparties,
  getEmiInstallmentsForMonth,
  getExcludedCategoryNames,
} from "@/app/actions";
import { effectiveSpend } from "@/lib/recoverable";
import { isTrackedNotCounted } from "@/lib/spend";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { MonthSwitcher } from "@/components/month-switcher";
import { TransactionTable } from "@/components/transaction-table";
import Link from "next/link";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function TrackedPage({
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

  const [transactions, categories, knownCounterparties, emiInstallments, excluded] =
    await Promise.all([
      getTransactions(month, year),
      getCategoriesWithSubs(),
      getKnownCounterparties(),
      getEmiInstallmentsForMonth(month, year),
      getExcludedCategoryNames(),
    ] as const);

  const excludedNames = Array.from(excluded).sort();

  const tracked = transactions.filter((t) =>
    isTrackedNotCounted(t, excluded)
  );
  const trackedEmiInstallments = emiInstallments.filter((i) =>
    isTrackedNotCounted({ ...i, is_cc_payment: false }, excluded)
  );

  const total =
    tracked.reduce((sum, t) => sum + effectiveSpend(t), 0) +
    trackedEmiInstallments.reduce((sum, i) => sum + i.amount, 0);

  const byCategory = new Map<string, number>();
  for (const t of tracked) {
    byCategory.set(
      t.category,
      (byCategory.get(t.category) ?? 0) + effectiveSpend(t)
    );
  }
  for (const i of trackedEmiInstallments) {
    byCategory.set(i.category, (byCategory.get(i.category) ?? 0) + i.amount);
  }
  const categoryTotals = Array.from(byCategory.entries()).sort(
    (a, b) => b[1] - a[1]
  );

  const serialized = tracked.map((t) => ({
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-6">
            <NavBar />
            <h1 className="text-lg font-bold sm:text-xl md:hidden">
              Expense Tracker
            </h1>
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
          <MonthSwitcher month={month} year={year} basePath="/tracked" />
          <p className="text-sm text-muted-foreground">
            Tracked, not counted — money set aside, not spent.
            {excludedNames.length > 0 && (
              <> Categories: {excludedNames.join(", ")}.</>
            )}{" "}
            <Link href="/categories" className="underline underline-offset-2">
              Manage
            </Link>
          </p>
        </div>

        {excludedNames.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No categories are marked as &quot;Don&apos;t count as
              expense&quot; yet. Flag one on the{" "}
              <Link href="/categories" className="underline underline-offset-2">
                Categories
              </Link>{" "}
              page (e.g. Savings &amp; Investments) to see it here.
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Set Aside This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold">{formatINR(total)}</p>
                  <p className="text-xs text-muted-foreground">
                    Not counted in spend totals
                  </p>
                </CardContent>
              </Card>

              {categoryTotals.slice(0, 3).map(([name, amount]) => (
                <Card key={name}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      {name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{formatINR(amount)}</p>
                    <p className="text-xs text-muted-foreground">This month</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <TransactionTable
              transactions={serialized}
              categories={categories}
              knownCounterparties={knownCounterparties}
              emiInstallments={trackedEmiInstallments}
            />
          </>
        )}
      </main>
    </div>
  );
}
