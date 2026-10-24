import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCategoriesWithSubs } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { DebugRunner } from "@/components/debug-runner";

export default async function DebugPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const categories = await getCategoriesWithSubs();

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
          <h2 className="text-2xl font-bold">Debug Email Pipeline</h2>
          <p className="text-sm text-muted-foreground">
            Re-run the Gmail &rarr; AI extractor and inspect every email, the
            parsed AI output, and why it was (or wasn&apos;t) saved. Runs are
            processed in short chunks and can be resumed if interrupted.
            Defaults to dry-run so nothing is written to the database.
          </p>
        </div>

        <DebugRunner categories={categories} />
      </main>
    </div>
  );
}
