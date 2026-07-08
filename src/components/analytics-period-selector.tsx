"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsPeriodSelectorProps {
  mode: "monthly" | "yearly";
  categoryMode: "parent" | "subcategory" | "combined";
  spendMode: "spend" | "tracked" | "all";
  month: number;
  year: number;
  availableYears: number[];
}

export function AnalyticsPeriodSelector({
  mode,
  categoryMode,
  spendMode,
  month,
  year,
  availableYears,
}: AnalyticsPeriodSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const now = new Date();
  const isCurrentMonth =
    month === now.getMonth() && year === now.getFullYear();
  const isCurrentYear = year === now.getFullYear();

  function pushParams(updates: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(updates)) {
      params.set(k, v);
    }
    router.push(`/analytics?${params.toString()}`);
  }

  function setMode(newMode: string) {
    pushParams({ view: newMode });
  }

  function navigateMonth(direction: -1 | 1) {
    let newMonth = month + direction;
    let newYear = year;
    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }
    pushParams({ month: String(newMonth), year: String(newYear) });
  }

  function navigateYear(direction: -1 | 1) {
    pushParams({ year: String(year + direction) });
  }

  const monthLabel = new Date(year, month).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant={mode === "monthly" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("monthly")}
        >
          Monthly
        </Button>
        <Button
          variant={mode === "yearly" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("yearly")}
        >
          Yearly
        </Button>
        <Select
          value={categoryMode}
          onValueChange={(value) => pushParams({ category_mode: value })}
        >
          <SelectTrigger className={cn("w-[170px]")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="parent">Parent Categories</SelectItem>
            <SelectItem value="subcategory">Subcategories</SelectItem>
            <SelectItem value="combined">Combined</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={spendMode}
          onValueChange={(value) => pushParams({ mode: value })}
        >
          <SelectTrigger className={cn("w-[130px]")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="spend">Expenses</SelectItem>
            <SelectItem value="tracked">Tracked</SelectItem>
            <SelectItem value="all">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {mode === "monthly" ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-center text-lg font-semibold">
            {monthLabel}
          </span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateMonth(1)}
            disabled={isCurrentMonth}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateYear(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Select
            value={String(year)}
            onValueChange={(v) => pushParams({ year: v })}
          >
            <SelectTrigger className={cn("w-[120px]")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableYears.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigateYear(1)}
            disabled={isCurrentYear}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
