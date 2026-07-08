"use client";

import { useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line,
  AreaChart,
  Area,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const COLORS = [
  "hsl(221, 83%, 53%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 84%, 60%)",
  "hsl(262, 83%, 58%)",
  "hsl(199, 89%, 48%)",
  "hsl(330, 81%, 60%)",
  "hsl(25, 95%, 53%)",
  "hsl(173, 80%, 40%)",
  "hsl(47, 96%, 53%)",
  "hsl(280, 65%, 60%)",
  "hsl(210, 40%, 50%)",
];

export interface AnalyticsTransaction {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory?: string | null;
  is_cc_payment: boolean;
  /** True when the category is "tracked, not counted" (excluded from spend). */
  excluded?: boolean;
}

export type AnalyticsCategoryMode = "parent" | "subcategory" | "combined";

function getCategoryLabel(
  transaction: AnalyticsTransaction,
  mode: AnalyticsCategoryMode
): string | null {
  if (mode === "parent") {
    return transaction.category;
  }

  if (mode === "subcategory") {
    return transaction.subcategory
      ? `${transaction.category} / ${transaction.subcategory}`
      : null;
  }

  return transaction.subcategory
    ? `${transaction.category} / ${transaction.subcategory}`
    : transaction.category;
}

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompact(value: number) {
  if (value >= 100000) return `${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return String(value);
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-[300px] items-center justify-center text-muted-foreground">
      {message}
    </div>
  );
}

export function MonthlyTrendChart({
  transactions,
  year,
}: {
  transactions: AnalyticsTransaction[];
  year: number;
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const spending = transactions.filter((t) => !t.is_cc_payment);

  const availableCategories = Array.from(
    new Set(spending.map((t) => t.category))
  ).sort((a, b) => a.localeCompare(b));

  const filteredSpending = spending.filter((t) => !excluded.has(t.category));

  const monthlyMap = new Map<number, number>();
  for (const t of filteredSpending) {
    const m = new Date(t.date).getMonth();
    monthlyMap.set(m, (monthlyMap.get(m) || 0) + t.amount);
  }

  const data = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(year, i).toLocaleDateString("en-IN", { month: "short" }),
    amount: monthlyMap.get(i) || 0,
  }));

  const hasData = data.some((d) => d.amount > 0);
  const hasAnySpending = spending.length > 0;
  const hasExclusions = excluded.size > 0;

  function toggleCategory(category: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  }

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Monthly Spending Trend — {year}</CardTitle>
        {hasAnySpending && availableCategories.length > 1 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">
              Categories:
            </span>
            {availableCategories.map((cat) => {
              const isExcluded = excluded.has(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => toggleCategory(cat)}
                  aria-pressed={!isExcluded}
                  className={`rounded-full border px-2 py-0.5 text-xs font-medium transition-colors ${
                    isExcluded
                      ? "border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground line-through hover:bg-muted"
                      : "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  }`}
                >
                  {cat}
                </button>
              );
            })}
            {hasExclusions && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setExcluded(new Set())}
              >
                Reset
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState
            message={
              hasExclusions
                ? "All categories excluded"
                : "No spending data for this year"
            }
          />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value) => [formatINR(Number(value)), "Spent"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Line
                type="monotone"
                dataKey="amount"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(221, 83%, 53%)" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsPieChart({
  transactions,
  mode = "combined",
}: {
  transactions: AnalyticsTransaction[];
  mode?: AnalyticsCategoryMode;
}) {
  const [showAmount, setShowAmount] = useState(false);
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const categoryMap = new Map<string, number>();

  for (const t of spending) {
    const label = getCategoryLabel(t, mode);
    if (!label) continue;
    categoryMap.set(label, (categoryMap.get(label) || 0) + t.amount);
  }

  const data = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Category Breakdown</CardTitle>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <Button
            variant={showAmount ? "ghost" : "secondary"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowAmount(false)}
          >
            %
          </Button>
          <Button
            variant={showAmount ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowAmount(true)}
          >
            ₹
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {data.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="ml-auto font-medium">
                    {showAmount
                      ? formatINR(item.value)
                      : `${((item.value / total) * 100).toFixed(0)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ParentCategoryPieChart({
  transactions,
}: {
  transactions: AnalyticsTransaction[];
}) {
  const [showAmount, setShowAmount] = useState(false);
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const categoryMap = new Map<string, number>();

  for (const transaction of spending) {
    categoryMap.set(
      transaction.category,
      (categoryMap.get(transaction.category) || 0) + transaction.amount
    );
  }

  const data = Array.from(categoryMap.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Parent Category Breakdown</CardTitle>
        <div className="flex gap-1 rounded-lg border p-0.5">
          <Button
            variant={showAmount ? "ghost" : "secondary"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowAmount(false)}
          >
            %
          </Button>
          <Button
            variant={showAmount ? "secondary" : "ghost"}
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => setShowAmount(true)}
          >
            ₹
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatINR(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid w-full grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {data.map((item, i) => (
                <div key={item.name} className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <span className="truncate text-muted-foreground">
                    {item.name}
                  </span>
                  <span className="ml-auto font-medium">
                    {showAmount
                      ? formatINR(item.value)
                      : `${((item.value / total) * 100).toFixed(0)}%`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SubcategoryComparisonChart({
  transactions,
}: {
  transactions: AnalyticsTransaction[];
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment && t.subcategory);
  const subcategoryMap = new Map<string, number>();

  for (const transaction of spending) {
    const label = `${transaction.category} / ${transaction.subcategory}`;
    subcategoryMap.set(label, (subcategoryMap.get(label) || 0) + transaction.amount);
  }

  const data = Array.from(subcategoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Subcategories</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No subcategory data" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis type="number" fontSize={12} tickLine={false} tickFormatter={formatCompact} />
              <YAxis type="category" dataKey="category" fontSize={12} tickLine={false} width={180} />
              <Tooltip formatter={(value) => [formatINR(Number(value)), "Spent"]} />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function AnalyticsDailyBarChart({
  transactions,
}: {
  transactions: AnalyticsTransaction[];
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const dailyMap = new Map<string, number>();

  for (const t of spending) {
    const day = new Date(t.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    dailyMap.set(day, (dailyMap.get(day) || 0) + t.amount);
  }

  const data = Array.from(dailyMap.entries())
    .map(([date, amount]) => ({ date, amount }))
    .reverse();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Spending</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value) => [formatINR(Number(value)), "Spent"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Bar
                dataKey="amount"
                fill="hsl(221, 83%, 53%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function CategoryComparisonChart({
  transactions,
  mode = "combined",
}: {
  transactions: AnalyticsTransaction[];
  mode?: AnalyticsCategoryMode;
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const categoryMap = new Map<string, number>();

  for (const t of spending) {
    const label = getCategoryLabel(t, mode);
    if (!label) continue;
    categoryMap.set(label, (categoryMap.get(label) || 0) + t.amount);
  }

  const data = Array.from(categoryMap.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Category</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(300, data.length * 40)}>
            <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                type="number"
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <YAxis
                type="category"
                dataKey="category"
                fontSize={12}
                tickLine={false}
                width={120}
              />
              <Tooltip
                formatter={(value) => [formatINR(Number(value)), "Spent"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function StackedAreaChart({
  transactions,
  mode = "combined",
}: {
  transactions: AnalyticsTransaction[];
  mode?: AnalyticsCategoryMode;
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment);

  const categories = new Set<string>();
  for (const t of spending) {
    const label = getCategoryLabel(t, mode);
    if (label) categories.add(label);
  }

  const dailyCategory = new Map<string, Map<string, number>>();
  for (const t of spending) {
    const day = new Date(t.date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
    if (!dailyCategory.has(day)) dailyCategory.set(day, new Map());
    const dayMap = dailyCategory.get(day)!;
    const label = getCategoryLabel(t, mode);
    if (!label) continue;
    dayMap.set(label, (dayMap.get(label) || 0) + t.amount);
  }

  const sortedCategories = Array.from(categories);
  const data = Array.from(dailyCategory.entries())
    .map(([date, catMap]) => {
      const entry: Record<string, string | number> = { date };
      for (const cat of sortedCategories) {
        entry[cat] = catMap.get(cat) || 0;
      }
      return entry;
    })
    .reverse();

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Category Spending Over Time</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                fontSize={11}
                tickLine={false}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value) => formatINR(Number(value))}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend />
              {sortedCategories.map((cat, i) => (
                <Area
                  key={cat}
                  type="monotone"
                  dataKey={cat}
                  stackId="1"
                  fill={COLORS[i % COLORS.length]}
                  stroke={COLORS[i % COLORS.length]}
                  fillOpacity={0.6}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function TopMerchantsChart({
  transactions,
  limit = 10,
}: {
  transactions: AnalyticsTransaction[];
  limit?: number;
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const merchantMap = new Map<string, { total: number; count: number }>();

  for (const t of spending) {
    const existing = merchantMap.get(t.merchant) || { total: 0, count: 0 };
    existing.total += t.amount;
    existing.count += 1;
    merchantMap.set(t.merchant, existing);
  }

  const data = Array.from(merchantMap.entries())
    .map(([merchant, { total, count }]) => ({ merchant, total, count }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top Merchants</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <div className="space-y-3">
            {data.map((item, i) => {
              const maxAmount = data[0].total;
              const pct = (item.total / maxAmount) * 100;
              return (
                <div key={item.merchant} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 truncate font-medium">
                      <span className="text-muted-foreground">{i + 1}.</span>
                      {item.merchant}
                    </span>
                    <span className="shrink-0 ml-2">
                      {formatINR(item.total)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({item.count}x)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: COLORS[i % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WeekdayHeatmap({
  transactions,
}: {
  transactions: AnalyticsTransaction[];
}) {
  const spending = transactions.filter((t) => !t.is_cc_payment);
  const weekdayData = Array.from({ length: 7 }, () => ({
    total: 0,
    count: 0,
  }));

  for (const t of spending) {
    const day = new Date(t.date).getDay();
    weekdayData[day].total += t.amount;
    weekdayData[day].count += 1;
  }

  const maxTotal = Math.max(...weekdayData.map((d) => d.total), 1);

  const data = WEEKDAYS.map((name, i) => ({
    day: name,
    total: weekdayData[i].total,
    count: weekdayData[i].count,
    avg: weekdayData[i].count > 0
      ? weekdayData[i].total / weekdayData[i].count
      : 0,
    intensity: weekdayData[i].total / maxTotal,
  }));

  const weekdayTotal = data
    .filter((d) => !["Sun", "Sat"].includes(d.day))
    .reduce((s, d) => s + d.total, 0);
  const weekendTotal = data
    .filter((d) => ["Sun", "Sat"].includes(d.day))
    .reduce((s, d) => s + d.total, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spending by Day of Week</CardTitle>
      </CardHeader>
      <CardContent>
        {spending.length === 0 ? (
          <EmptyState message="No spending data" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-7 gap-2">
              {data.map((item) => {
                const opacity = Math.max(0.1, item.intensity);
                return (
                  <div
                    key={item.day}
                    className="flex flex-col items-center gap-1 rounded-lg p-2 text-center"
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.day}
                    </span>
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-lg text-xs font-bold"
                      style={{
                        backgroundColor: `hsl(221, 83%, 53%)`,
                        opacity,
                        color: opacity > 0.4 ? "white" : "hsl(221, 83%, 53%)",
                      }}
                    >
                      {formatCompact(item.total)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {item.count} txn{item.count !== 1 ? "s" : ""}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-primary" />
                <span className="text-muted-foreground">Weekdays:</span>
                <span className="font-medium">{formatINR(weekdayTotal)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-destructive" />
                <span className="text-muted-foreground">Weekends:</span>
                <span className="font-medium">{formatINR(weekendTotal)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function YearOverYearChart({
  currentTransactions,
  previousTransactions,
  currentYear,
  previousYear,
}: {
  currentTransactions: AnalyticsTransaction[];
  previousTransactions: AnalyticsTransaction[];
  currentYear: number;
  previousYear: number;
}) {
  function buildMonthly(txns: AnalyticsTransaction[]) {
    const spending = txns.filter((t) => !t.is_cc_payment);
    const map = new Map<number, number>();
    for (const t of spending) {
      const m = new Date(t.date).getMonth();
      map.set(m, (map.get(m) || 0) + t.amount);
    }
    return map;
  }

  const currentMap = buildMonthly(currentTransactions);
  const previousMap = buildMonthly(previousTransactions);

  const data = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2000, i).toLocaleDateString("en-IN", { month: "short" }),
    [String(currentYear)]: currentMap.get(i) || 0,
    [String(previousYear)]: previousMap.get(i) || 0,
  }));

  const hasData =
    data.some((d) => (d[String(currentYear)] as number) > 0) ||
    data.some((d) => (d[String(previousYear)] as number) > 0);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>
          Year-over-Year Comparison — {previousYear} vs {currentYear}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState message="No data available for comparison" />
        ) : (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value, name) => [formatINR(Number(value)), name]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend />
              <Bar
                dataKey={String(previousYear)}
                fill="hsl(210, 40%, 70%)"
                radius={[4, 4, 0, 0]}
              />
               <Bar
                dataKey={String(currentYear)}
                fill="hsl(221, 83%, 53%)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

interface BudgetVsActualChartProps {
  budget: number;
  spent: number;
  month: number;
  year: number;
}

export function BudgetVsActualChart({
  budget,
  spent,
  month,
  year,
}: BudgetVsActualChartProps) {
  const remaining = Math.max(budget - spent, 0);
  const over = Math.max(spent - budget, 0);
  const percentage = Math.round((spent / budget) * 100);

  const monthName = new Date(year, month).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const data = over > 0
    ? [
        { name: "Budget", value: budget, fill: "hsl(221, 83%, 53%)" },
        { name: "Over Budget", value: over, fill: "hsl(0, 84%, 60%)" },
      ]
    : [
        { name: "Spent", value: spent, fill: "hsl(221, 83%, 53%)" },
        { name: "Remaining", value: remaining, fill: "hsl(142, 71%, 45%)" },
      ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Budget vs Actual — {monthName}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-8">
          <div className="h-[200px] w-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {data.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatINR(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Budget</p>
              <p className="text-xl font-bold">{formatINR(budget)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Spent</p>
              <p className="text-xl font-bold">{formatINR(spent)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {over > 0 ? "Over Budget" : "Remaining"}
              </p>
              <p
                className={`text-xl font-bold ${over > 0 ? "text-red-500" : "text-emerald-600"}`}
              >
                {over > 0 ? formatINR(over) : formatINR(remaining)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {percentage}% of budget used
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Combined ("Both") mode trend: monthly counted spend vs tracked (excluded-
 * category) outflow as two distinct lines. Never merged into one total — the
 * split is the whole point.
 */
export function SpendVsTrackedChart({
  transactions,
  year,
}: {
  transactions: AnalyticsTransaction[];
  year: number;
}) {
  const rows = transactions.filter((t) => !t.is_cc_payment);

  const spendMap = new Map<number, number>();
  const trackedMap = new Map<number, number>();
  for (const t of rows) {
    const m = new Date(t.date).getMonth();
    const target = t.excluded ? trackedMap : spendMap;
    target.set(m, (target.get(m) || 0) + t.amount);
  }

  const data = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(year, i).toLocaleDateString("en-IN", { month: "short" }),
    spend: spendMap.get(i) || 0,
    tracked: trackedMap.get(i) || 0,
  }));

  const hasData = data.some((d) => d.spend > 0 || d.tracked > 0);

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Expenses vs Tracked — {year}</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState message="No data for this year" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatINR(Number(value)),
                  name === "spend" ? "Expenses" : "Tracked",
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Legend
                formatter={(value) =>
                  value === "spend" ? "Expenses" : "Tracked (set aside)"
                }
              />
              <Line
                type="monotone"
                dataKey="spend"
                stroke="hsl(221, 83%, 53%)"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(221, 83%, 53%)" }}
              />
              <Line
                type="monotone"
                dataKey="tracked"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2}
                dot={{ r: 3, fill: "hsl(142, 71%, 45%)" }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Running total of tracked (excluded-category) contributions over a year —
 * "watch it grow". Shows money set aside, not portfolio value: the app only
 * sees debits, so market gains are invisible by design.
 */
export function CumulativeContributionChart({
  transactions,
  year,
}: {
  transactions: AnalyticsTransaction[];
  year: number;
}) {
  const rows = transactions.filter((t) => !t.is_cc_payment);

  const monthlyMap = new Map<number, number>();
  for (const t of rows) {
    const m = new Date(t.date).getMonth();
    monthlyMap.set(m, (monthlyMap.get(m) || 0) + t.amount);
  }

  const now = new Date();
  const lastMonth =
    year === now.getFullYear() ? now.getMonth() : year < now.getFullYear() ? 11 : -1;

  const cumulativeByMonth = Array.from({ length: 12 }).reduce<number[]>(
    (acc, _, i) => {
      acc.push((i > 0 ? acc[i - 1] : 0) + (monthlyMap.get(i) || 0));
      return acc;
    },
    []
  );

  const data = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(year, i).toLocaleDateString("en-IN", { month: "short" }),
    cumulative: i <= lastMonth ? cumulativeByMonth[i] : null,
    monthly: monthlyMap.get(i) || 0,
  }));

  const hasData = cumulativeByMonth[11] > 0;

  return (
    <Card className="col-span-full">
      <CardHeader>
        <CardTitle>Cumulative Contributions — {year}</CardTitle>
        <p className="text-sm text-muted-foreground">
          Running total of money set aside (contributions, not market value)
        </p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <EmptyState message="No tracked contributions this year" />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" fontSize={12} tickLine={false} />
              <YAxis
                fontSize={12}
                tickLine={false}
                tickFormatter={formatCompact}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatINR(Number(value)),
                  name === "cumulative" ? "Total set aside" : "This month",
                ]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid hsl(var(--border))",
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulative"
                stroke="hsl(142, 71%, 45%)"
                strokeWidth={2}
                fill="hsl(142, 71%, 45%)"
                fillOpacity={0.15}
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
