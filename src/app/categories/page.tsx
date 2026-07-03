import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getCategoriesWithSubs, getCategoryStats } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { CategoryManager } from "@/components/category-manager";
import { CategoryCleanup } from "@/components/category-cleanup";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default async function CategoriesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [categories, stats] = await Promise.all([
    getCategoriesWithSubs(),
    getCategoryStats(),
  ]);

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
          <h2 className="text-2xl font-bold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            Create, rename, and organize categories and subcategories.
          </p>
        </div>

        <Tabs defaultValue="manage">
          <TabsList>
            <TabsTrigger value="manage">Manage</TabsTrigger>
            <TabsTrigger value="cleanup">Cleanup</TabsTrigger>
          </TabsList>
          <TabsContent value="manage" className="mt-4">
            <CategoryManager categories={categories} />
          </TabsContent>
          <TabsContent value="cleanup" className="mt-4">
            <CategoryCleanup stats={stats} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
