"use client";

import { useMemo, useState, useTransition } from "react";
import {
  assignOrphanedTransactions,
  deleteCategory,
  deleteEmptyCategories,
  mergeCategory,
  mergeSubcategory,
  syncLegacyCategoryStrings,
  type CategoryStat,
  type CategoryStats,
} from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { GitMerge, RefreshCw, Trash2 } from "lucide-react";

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

interface CategoryCleanupProps {
  stats: CategoryStats;
}

export function CategoryCleanup({ stats }: CategoryCleanupProps) {
  const [isPending, startTransition] = useTransition();

  const emptyCategories = stats.categories.filter(
    (c) =>
      c.name !== "Other" &&
      c.count === 0 &&
      c.subcategories.every((s) => s.count === 0)
  );
  const orphanTotal = stats.orphaned.reduce((sum, o) => sum + o.count, 0);

  function handleDeleteEmpty() {
    startTransition(async () => {
      await deleteEmptyCategories();
    });
  }

  function handleSyncStrings() {
    startTransition(async () => {
      await syncLegacyCategoryStrings();
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Categories
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.categories.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unused categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">{emptyCategories.length}</p>
            {emptyCategories.length > 0 ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={isPending}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete all empty
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Delete {emptyCategories.length} empty categories?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {emptyCategories.map((c) => c.name).join(", ")} — no
                      transactions reference these. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteEmpty}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Orphaned transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{orphanTotal}</p>
            <p className="text-xs text-muted-foreground">
              have a category name but no linked category
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Stale names
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-2xl font-bold">{stats.staleCount}</p>
            {stats.staleCount > 0 ? (
              <Button size="sm" variant="outline" onClick={handleSyncStrings} disabled={isPending}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Sync names
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">all in sync</p>
            )}
          </CardContent>
        </Card>
      </div>

      {stats.orphaned.length > 0 ? (
        <OrphanSection stats={stats} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Usage by category</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stats.categories.map((category) => (
            <CategoryRow
              key={category.id}
              category={category}
              allCategories={stats.categories}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function OrphanSection({ stats }: { stats: CategoryStats }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Orphaned category names</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stats.orphaned.map((orphan) => (
          <OrphanRow
            key={orphan.category}
            orphan={orphan}
            categories={stats.categories}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function OrphanRow({
  orphan,
  categories,
}: {
  orphan: CategoryStats["orphaned"][number];
  categories: CategoryStat[];
}) {
  const [targetId, setTargetId] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAssign() {
    if (!targetId) return;
    startTransition(async () => {
      await assignOrphanedTransactions(orphan.category, targetId);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{orphan.category}</Badge>
      <span className="text-sm text-muted-foreground">
        {orphan.count} txns · {inr.format(orphan.total)}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <Select value={targetId} onValueChange={setTargetId}>
          <SelectTrigger className="h-8 w-48" aria-label={`Assign ${orphan.category} to`}>
            <SelectValue placeholder="Assign to..." />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleAssign} disabled={!targetId || isPending}>
          Assign
        </Button>
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  allCategories,
}: {
  category: CategoryStat;
  allCategories: CategoryStat[];
}) {
  const [isPending, startTransition] = useTransition();
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [reassignId, setReassignId] = useState("");

  const otherCategories = useMemo(
    () => allCategories.filter((c) => c.id !== category.id),
    [allCategories, category.id]
  );

  const isEmpty =
    category.count === 0 && category.subcategories.every((s) => s.count === 0);

  function handleMerge() {
    if (!mergeTargetId) return;
    startTransition(async () => {
      await mergeCategory(category.id, mergeTargetId);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteCategory(category.id, reassignId || undefined);
    });
  }

  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{category.name}</span>
        <Badge variant={category.count === 0 ? "outline" : "secondary"}>
          {category.count} txns
        </Badge>
        {category.count > 0 ? (
          <span className="text-sm text-muted-foreground">
            {inr.format(category.total)}
          </span>
        ) : null}
        {isEmpty ? <Badge variant="destructive">unused</Badge> : null}

        <div className="ml-auto flex items-center gap-2">
          <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
            <SelectTrigger className="h-8 w-44" aria-label={`Merge ${category.name} into`}>
              <SelectValue placeholder="Merge into..." />
            </SelectTrigger>
            <SelectContent>
              {otherCategories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={!mergeTargetId || isPending}>
                <GitMerge className="mr-2 h-4 w-4" />
                Merge
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Merge &quot;{category.name}&quot; into &quot;
                  {otherCategories.find((c) => c.id === mergeTargetId)?.name}
                  &quot;?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {category.count} transactions and{" "}
                  {category.subcategories.length} subcategories will move, then
                  &quot;{category.name}&quot; will be deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleMerge}>Merge</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete &quot;{category.name}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>
                  {category.count > 0
                    ? `${category.count} transactions reference this category. Choose where they should go:`
                    : "No transactions reference this category."}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {category.count > 0 ? (
                <Select value={reassignId} onValueChange={setReassignId}>
                  <SelectTrigger aria-label="Reassign transactions to">
                    <SelectValue placeholder="Reassign to... (default: Other)" />
                  </SelectTrigger>
                  <SelectContent>
                    {otherCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {category.subcategories.length > 0 ? (
        <div className="mt-3 space-y-2 border-t pt-3">
          {category.subcategories.map((sub) => (
            <SubcategoryRow
              key={sub.id}
              sub={sub}
              parentName={category.name}
              allCategories={allCategories}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SubcategoryRow({
  sub,
  parentName,
  allCategories,
}: {
  sub: CategoryStat["subcategories"][number];
  parentName: string;
  allCategories: CategoryStat[];
}) {
  const [isPending, startTransition] = useTransition();
  const [mergeTargetId, setMergeTargetId] = useState("");

  const otherSubs = useMemo(
    () =>
      allCategories.flatMap((c) =>
        c.subcategories
          .filter((s) => s.id !== sub.id)
          .map((s) => ({ id: s.id, label: `${c.name} › ${s.name}` }))
      ),
    [allCategories, sub.id]
  );

  function handleMerge() {
    if (!mergeTargetId) return;
    startTransition(async () => {
      await mergeSubcategory(sub.id, mergeTargetId);
    });
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteCategory(sub.id);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pl-4">
      <span className="text-sm">{sub.name}</span>
      <Badge variant={sub.count === 0 ? "outline" : "secondary"}>
        {sub.count} txns
      </Badge>
      {sub.count > 0 ? (
        <span className="text-xs text-muted-foreground">{inr.format(sub.total)}</span>
      ) : null}

      <div className="ml-auto flex items-center gap-2">
        <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
          <SelectTrigger
            className="h-7 w-52 text-xs"
            aria-label={`Merge ${parentName} ${sub.name} into`}
          >
            <SelectValue placeholder="Merge into..." />
          </SelectTrigger>
          <SelectContent>
            {otherSubs.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          onClick={handleMerge}
          disabled={!mergeTargetId || isPending}
        >
          <GitMerge className="h-3 w-3" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
              <Trash2 className="h-3 w-3" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Delete subcategory &quot;{sub.name}&quot;?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {sub.count > 0
                  ? `${sub.count} transactions will keep "${parentName}" but lose this subcategory.`
                  : "No transactions reference this subcategory."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
