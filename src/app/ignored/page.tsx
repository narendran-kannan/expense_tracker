import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getIgnoredTransactions } from "@/app/actions";
import { IGNORED_RETENTION_DAYS, ignoredExpiresAt } from "@/lib/ignore";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { IgnoredList } from "@/components/ignored-list";

export default async function IgnoredPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const ignored = await getIgnoredTransactions();
  const items = ignored.map((row) => ({
    ...row,
    date: row.date.toISOString(),
    created_at: row.created_at.toISOString(),
    expires_at: ignoredExpiresAt(row.created_at).toISOString(),
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
          <h1 className="text-xl font-bold">Ignored</h1>
          <p className="text-sm text-muted-foreground">
            Deleting a transaction moves it here instead of erasing it. The
            tombstone stops the overlapping Gmail search from importing the
            email again. Entries are permanently purged after{" "}
            {IGNORED_RETENTION_DAYS} days, or immediately with Delete forever.
          </p>
        </div>

        <IgnoredList items={items} />
      </main>
    </div>
  );
}
