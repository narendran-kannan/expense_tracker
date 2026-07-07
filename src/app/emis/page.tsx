import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getEmis } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavBar } from "@/components/nav-bar";
import { EmiCard } from "@/components/emis-list";
import { CalendarClock } from "lucide-react";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function EmisPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const emis = await getEmis();

  const active = emis.filter((e) => !e.complete);
  const monthlyOutflow = active.reduce((s, e) => s + e.monthlyAmount, 0);
  const totalRemaining = active.reduce((s, e) => s + e.remainingAmount, 0);

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
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <CalendarClock className="h-6 w-6" /> EMIs
          </h2>
          <p className="text-sm text-muted-foreground">
            Purchases split into monthly installments. The cost is spread across
            the tenure instead of counting upfront; installments ride your
            credit card bill. Convert a purchase to EMI from the dashboard.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Active EMIs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{active.length}</p>
              <p className="text-xs text-muted-foreground">
                {emis.length - active.length} completed
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Monthly Outflow
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatINR(monthlyOutflow)}</p>
              <p className="text-xs text-muted-foreground">
                Across active EMIs
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Remaining Balance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatINR(totalRemaining)}</p>
              <p className="text-xs text-muted-foreground">Yet to be paid</p>
            </CardContent>
          </Card>
        </div>

        {emis.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              No EMIs yet. Convert a purchase to EMI from the dashboard to spread
              its cost across months and track it here.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {emis.map((emi) => (
              <EmiCard key={emi.id} emi={emi} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
