"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthSwitcher({
  month,
  year,
  basePath = "/",
}: {
  month: number;
  year: number;
  basePath?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const now = new Date();
  const isCurrentMonth =
    month === now.getMonth() && year === now.getFullYear();

  const label = new Date(year, month).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  function navigate(direction: -1 | 1) {
    let newMonth = month + direction;
    let newYear = year;

    if (newMonth < 0) {
      newMonth = 11;
      newYear -= 1;
    } else if (newMonth > 11) {
      newMonth = 0;
      newYear += 1;
    }

    const params = new URLSearchParams(searchParams.toString());
    params.set("month", String(newMonth));
    params.set("year", String(newYear));
    router.push(`${basePath}?${params.toString()}`);
  }

  const shortLabel = new Date(year, month).toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="flex items-center gap-1 sm:gap-2">
      <Button variant="outline" size="icon" className="h-8 w-8 sm:h-9 sm:w-9" onClick={() => navigate(-1)}>
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <h2 className="text-center text-lg font-bold sm:min-w-[180px] sm:text-2xl">
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden sm:inline">{label}</span>
      </h2>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 sm:h-9 sm:w-9"
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
