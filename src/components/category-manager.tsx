"use client";

import { useState, useTransition } from "react";
import {
  createCategory,
  deleteCategory,
  renameCategory,
  setCategoryExcludedFromSpend,
  type CategoryWithSubs,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Trash2 } from "lucide-react";

interface CategoryManagerProps {
  categories: CategoryWithSubs[];
}

export function CategoryManager({ categories }: CategoryManagerProps) {
  const [newCategory, setNewCategory] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleCreateCategory() {
    const trimmed = newCategory.trim();
    if (!trimmed) return;

    startTransition(async () => {
      await createCategory(trimmed);
      setNewCategory("");
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Category</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="e.g. Savings & Investments"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateCategory();
              }
            }}
          />
          <Button onClick={handleCreateCategory} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Add Category
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {categories.map((category) => (
          <CategoryCard key={category.id || category.name} category={category} />
        ))}
      </div>
    </div>
  );
}

function CategoryCard({ category }: { category: CategoryWithSubs }) {
  const [editingCategory, setEditingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState(category.name);
  const [newSubcategory, setNewSubcategory] = useState("");
  const [editingSubId, setEditingSubId] = useState<string | null>(null);
  const [editingSubName, setEditingSubName] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleRenameCategory() {
    if (!category.id) return;
    startTransition(async () => {
      await renameCategory(category.id, categoryName);
      setEditingCategory(false);
    });
  }

  function handleDeleteCategory() {
    if (!category.id) return;
    startTransition(async () => {
      await deleteCategory(category.id);
    });
  }

  function handleCreateSubcategory() {
    const trimmed = newSubcategory.trim();
    if (!trimmed) return;

    startTransition(async () => {
      await createCategory(trimmed, category.name);
      setNewSubcategory("");
    });
  }

  function handleRenameSubcategory(subcategoryId: string) {
    startTransition(async () => {
      await renameCategory(subcategoryId, editingSubName);
      setEditingSubId(null);
      setEditingSubName("");
    });
  }

  function handleDeleteSubcategory(subcategoryId: string) {
    startTransition(async () => {
      await deleteCategory(subcategoryId);
    });
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            {editingCategory ? (
              <div className="flex gap-2">
                <Input
                  value={categoryName}
                  onChange={(e) => setCategoryName(e.target.value)}
                />
                <Button size="sm" onClick={handleRenameCategory} disabled={isPending}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingCategory(false);
                    setCategoryName(category.name);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <CardTitle className="text-lg">
                {category.name}
                {category.excludedFromSpend && (
                  <Badge variant="secondary" className="ml-2 align-middle">
                    Tracked
                  </Badge>
                )}
              </CardTitle>
            )}
            <p className="text-sm text-muted-foreground">
              {category.subcategories.length} subcategories
            </p>
          </div>
          {category.id ? (
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setEditingCategory(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={handleDeleteCategory}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {category.id ? (
          <div className="flex items-center justify-between gap-2 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor={`excluded-${category.id}`} className="text-sm">
                Don&apos;t count as expense
              </Label>
              <p className="text-xs text-muted-foreground">
                Track transactions but exclude them from spend totals, budget
                and analytics.
              </p>
            </div>
            <Switch
              id={`excluded-${category.id}`}
              checked={category.excludedFromSpend}
              disabled={isPending}
              onCheckedChange={(checked) =>
                startTransition(async () => {
                  await setCategoryExcludedFromSpend(category.id, checked);
                })
              }
            />
          </div>
        ) : null}
        <div className="flex gap-2">
          <Input
            value={newSubcategory}
            onChange={(e) => setNewSubcategory(e.target.value)}
            placeholder={`Add subcategory to ${category.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleCreateSubcategory();
              }
            }}
          />
          <Button onClick={handleCreateSubcategory} disabled={isPending}>
            Add
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {category.subcategories.length === 0 ? (
            <span className="text-sm text-muted-foreground">No subcategories yet.</span>
          ) : (
            category.subcategories.map((subcategory) =>
              editingSubId === subcategory.id ? (
                <div key={subcategory.id} className="flex items-center gap-2 rounded-md border p-2">
                  <Input
                    value={editingSubName}
                    onChange={(e) => setEditingSubName(e.target.value)}
                    className="h-8 w-36"
                  />
                  <Button
                    size="sm"
                    onClick={() => handleRenameSubcategory(subcategory.id)}
                    disabled={isPending}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div
                  key={subcategory.id}
                  className="flex items-center gap-1 rounded-full border px-2 py-1"
                >
                  <Badge variant="outline">{subcategory.name}</Badge>
                  {subcategory.id ? (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => {
                          setEditingSubId(subcategory.id);
                          setEditingSubName(subcategory.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-destructive"
                        onClick={() => handleDeleteSubcategory(subcategory.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  ) : null}
                </div>
              )
            )
          )}
        </div>
      </CardContent>
    </Card>
  );
}
