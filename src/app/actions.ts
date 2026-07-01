"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { DEFAULT_CATEGORIES } from "@/lib/categories";
import type { Period } from "@/lib/insights-period";
import type { InsightOutput } from "@/lib/schemas";
import type { InsightStats } from "@/lib/insights-stats-pure";
import {
  INSIGHTS_MODEL,
  MIN_TRANSACTIONS_FOR_INSIGHTS,
  type InsightResult,
} from "@/lib/insights-config";
import {
  RECOVERY_STATUS,
  computeRecoveryStatus,
  isRecoveryStatus,
  outstandingAmount,
  sumRepayments,
  type RecoveryStatus,
} from "@/lib/recoverable";
import {
  defaultMonthlyAmount,
  emiInstallmentForMonth,
  hasVirtualInstallmentForMonth,
  installmentIndexForMonth,
} from "@/lib/emi";
import {
  OVERAGE_STATUS,
  allocateWaterfall,
  computeOverageStatus,
  grossOverage,
  outstandingOverage,
  sumPayments,
} from "@/lib/overage";
import { effectiveSpend } from "@/lib/recoverable";

export interface CategoryWithSubs {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
}

async function revalidateAppPaths() {
  revalidatePath("/");
  revalidatePath("/analytics");
  revalidatePath("/categories");
  revalidatePath("/recoverables");
  revalidatePath("/carryover");
}

export async function getTransactions(month?: number, year?: number) {
  const now = new Date();
  const m = month ?? now.getMonth();
  const y = year ?? now.getFullYear();

  const startOfMonth = new Date(y, m, 1);
  const endOfMonth = new Date(y, m + 1, 0, 23, 59, 59, 999);

  return prisma.transaction.findMany({
    where: {
      date: { gte: startOfMonth, lte: endOfMonth },
    },
    orderBy: { date: "desc" },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      repayments: { orderBy: { date: "asc" } },
    },
  });
}

export async function getCategories(): Promise<string[]> {
  const rows = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { name: "asc" },
  });
  if (rows.length === 0) {
    return DEFAULT_CATEGORIES.map((c) => c.name);
  }
  return rows.map((r) => r.name);
}

export async function getCategoriesWithSubs(): Promise<CategoryWithSubs[]> {
  const rows = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { name: "asc" },
    include: {
      children: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (rows.length === 0) {
    return DEFAULT_CATEGORIES.map((c) => ({
      id: "",
      name: c.name,
      subcategories: (c.subcategories ?? []).map((s) => ({ id: "", name: s })),
    }));
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    subcategories: r.children.map((c) => ({ id: c.id, name: c.name })),
  }));
}

export async function getCategoryPromptData(): Promise<
  { name: string; subcategories: string[] }[]
> {
  const rows = await prisma.category.findMany({
    where: { parentId: null },
    orderBy: { name: "asc" },
    include: {
      children: {
        orderBy: { name: "asc" },
      },
    },
  });

  if (rows.length === 0) {
    return DEFAULT_CATEGORIES.map((c) => ({
      name: c.name,
      subcategories: c.subcategories ?? [],
    }));
  }

  return rows.map((r) => ({
    name: r.name,
    subcategories: r.children.map((c) => c.name),
  }));
}

export async function getSubcategories(
  categoryName: string
): Promise<string[]> {
  const parent = await prisma.category.findFirst({
    where: { name: categoryName, parentId: null },
    include: { children: { orderBy: { name: "asc" } } },
  });
  return parent?.children.map((c) => c.name) ?? [];
}

export async function createCategory(name: string, parentName?: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  let parentId: string | null = null;
  if (parentName) {
    const parent = await prisma.category.findFirst({
      where: { name: parentName, parentId: null },
    });
    if (!parent) throw new Error(`Parent category "${parentName}" not found`);
    parentId = parent.id;
  }

  const existing = await prisma.category.findFirst({
    where: { name: trimmed, parentId },
  });

  if (existing) {
    revalidatePath("/");
    return trimmed;
  }

  await prisma.category.create({
    data: { name: trimmed, parentId },
  });
  await revalidateAppPaths();
  return trimmed;
}

export async function renameCategory(id: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Category name is required");

  await prisma.category.update({
    where: { id },
    data: { name: trimmed },
  });
  await revalidateAppPaths();
}

export async function deleteCategory(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { children: true },
  });

  if (!category) throw new Error("Category not found");

  const idsToClear = [category.id, ...category.children.map((child) => child.id)];

  await prisma.transaction.updateMany({
    where: {
      OR: [
        { categoryId: { in: idsToClear } },
        { subcategoryId: { in: idsToClear } },
      ],
    },
    data: {
      subcategoryId: null,
      categoryId: null,
      category: "Other",
    },
  });

  await prisma.category.deleteMany({
    where: {
      OR: [{ id }, { parentId: id }],
    },
  });

  await revalidateAppPaths();
}

export async function seedCategories() {
  const existing = await prisma.category.count();
  if (existing === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      const created = await prisma.category.create({
        data: { name: cat.name, parentId: null },
      });
      if (cat.subcategories) {
        await prisma.category.createMany({
          data: cat.subcategories.map((sub) => ({
            name: sub,
            parentId: created.id,
          })),
        });
      }
    }
  }
}

export async function resolveCategoryIds(
  categoryName: string,
  subcategoryName: string | null
): Promise<{ categoryId: string | null; subcategoryId: string | null }> {
  const parent = await prisma.category.findFirst({
    where: { name: categoryName, parentId: null },
  });
  if (!parent) return { categoryId: null, subcategoryId: null };

  let subcategoryId: string | null = null;
  if (subcategoryName) {
    const sub = await prisma.category.findFirst({
      where: { name: subcategoryName, parentId: parent.id },
    });
    subcategoryId = sub?.id ?? null;
  }

  return { categoryId: parent.id, subcategoryId };
}

export async function createTransaction(data: {
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory?: string | null;
  is_cc_payment: boolean;
}) {
  const { categoryId, subcategoryId } = await resolveCategoryIds(
    data.category,
    data.subcategory ?? null
  );

  await prisma.transaction.create({
    data: {
      amount: data.amount,
      merchant: data.merchant,
      date: new Date(data.date),
      category: data.category,
      categoryId,
      subcategoryId,
      is_cc_payment: data.is_cc_payment,
      confidence_score: 1.0,
      needs_review: false,
      source: "manual",
    },
  });
  await revalidateAppPaths();
}

export async function manuallyAddFromDebug(data: {
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory?: string | null;
  is_cc_payment: boolean;
  email_message_id?: string | null;
}) {
  if (!(data.amount > 0)) throw new Error("Amount must be positive");
  if (!data.merchant.trim()) throw new Error("Merchant is required");

  const emailMessageId = data.email_message_id?.trim() || null;

  if (emailMessageId) {
    const existing = await prisma.transaction.findUnique({
      where: { email_message_id: emailMessageId },
    });
    if (existing) {
      throw new Error(
        `Transaction already exists for this email (id: ${existing.id})`
      );
    }

    await prisma.skippedEmail.deleteMany({
      where: { email_message_id: emailMessageId },
    });
  }

  const { categoryId, subcategoryId } = await resolveCategoryIds(
    data.category,
    data.subcategory ?? null
  );

  await prisma.transaction.create({
    data: {
      amount: data.amount,
      merchant: data.merchant.trim(),
      date: new Date(data.date),
      category: data.category,
      categoryId,
      subcategoryId,
      is_cc_payment: data.is_cc_payment,
      confidence_score: 1.0,
      needs_review: false,
      email_message_id: emailMessageId,
      source: emailMessageId ? "email_recovered" : "manual",
    },
  });
  await revalidateAppPaths();
}

export async function cloneTransaction(id: string, newDate: string) {
  const source = await prisma.transaction.findUnique({ where: { id } });
  if (!source) throw new Error("Transaction not found");

  await prisma.transaction.create({
    data: {
      amount: source.amount,
      merchant: source.merchant,
      date: new Date(newDate),
      category: source.category,
      categoryId: source.categoryId,
      subcategoryId: source.subcategoryId,
      is_cc_payment: source.is_cc_payment,
      remarks: source.remarks,
      confidence_score: 1.0,
      needs_review: false,
      source: "manual",
    },
  });
  await revalidateAppPaths();
}

export async function approveTransaction(id: string) {
  await prisma.transaction.update({
    where: { id },
    data: { needs_review: false },
  });
  await revalidateAppPaths();
}

export async function updateTransaction(
  id: string,
  data: {
    category?: string;
    subcategory?: string | null;
    merchant?: string;
    amount?: number;
    is_cc_payment?: boolean;
    remarks?: string | null;
  }
) {
  const updateData: Record<string, unknown> = {};
  if (data.merchant !== undefined) updateData.merchant = data.merchant;
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.is_cc_payment !== undefined)
    updateData.is_cc_payment = data.is_cc_payment;
  if (data.remarks !== undefined) updateData.remarks = data.remarks;

  if (data.category !== undefined) {
    updateData.category = data.category;
    const { categoryId, subcategoryId } = await resolveCategoryIds(
      data.category,
      data.subcategory ?? null
    );
    updateData.categoryId = categoryId;
    updateData.subcategoryId = subcategoryId;
  } else if (data.subcategory !== undefined) {
    const existing = await prisma.transaction.findUnique({ where: { id } });
    if (existing) {
      const { subcategoryId } = await resolveCategoryIds(
        existing.category,
        data.subcategory
      );
      updateData.subcategoryId = subcategoryId;
    }
  }

  await prisma.transaction.update({
    where: { id },
    data: updateData,
  });
  await revalidateAppPaths();
}

export async function deleteTransaction(id: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { group_id: true },
  });

  await prisma.transaction.delete({ where: { id } });

  if (tx?.group_id) {
    await cleanupGroup(tx.group_id);
  }

  await revalidateAppPaths();
}

async function cleanupGroup(groupId: string) {
  const remaining = await prisma.transaction.findMany({
    where: { group_id: groupId },
    select: { id: true },
  });
  if (remaining.length <= 1) {
    await prisma.transaction.updateMany({
      where: { group_id: groupId },
      data: { group_id: null },
    });
  }
}

export async function groupTransactions(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length < 2) {
    throw new Error("Select at least two transactions to group");
  }

  const txns = await prisma.transaction.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, group_id: true },
  });

  if (txns.length !== uniqueIds.length) {
    throw new Error("Some transactions were not found");
  }

  const existingGroupId = txns.find((t) => t.group_id)?.group_id;
  const groupId = existingGroupId ?? crypto.randomUUID();

  await prisma.transaction.updateMany({
    where: { id: { in: uniqueIds } },
    data: { group_id: groupId },
  });

  await revalidateAppPaths();
  return groupId;
}

export async function ungroupTransaction(id: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id },
    select: { group_id: true },
  });

  await prisma.transaction.update({
    where: { id },
    data: { group_id: null },
  });

  if (tx?.group_id) {
    await cleanupGroup(tx.group_id);
  }

  await revalidateAppPaths();
}

export async function ungroupAll(groupId: string) {
  await prisma.transaction.updateMany({
    where: { group_id: groupId },
    data: { group_id: null },
  });
  await revalidateAppPaths();
}

export async function getSkippedEmails() {
  return prisma.skippedEmail.findMany({
    where: { dismissed: false },
    orderBy: { created_at: "desc" },
  });
}

export async function recoverSkippedEmail(
  id: string,
  data: {
    amount: number;
    merchant: string;
    date: string;
    category: string;
    subcategory?: string | null;
    is_cc_payment: boolean;
  }
) {
  const skipped = await prisma.skippedEmail.findUnique({ where: { id } });
  if (!skipped) throw new Error("Skipped email not found");

  const { categoryId, subcategoryId } = await resolveCategoryIds(
    data.category,
    data.subcategory ?? null
  );

  await prisma.transaction.create({
    data: {
      amount: data.amount,
      merchant: data.merchant,
      date: new Date(data.date),
      category: data.category,
      categoryId,
      subcategoryId,
      is_cc_payment: data.is_cc_payment,
      confidence_score: 1.0,
      needs_review: false,
      email_message_id: skipped.email_message_id,
      source: "email_recovered",
    },
  });

  await prisma.skippedEmail.delete({ where: { id } });
  await revalidateAppPaths();
}

export async function dismissSkippedEmail(id: string) {
  await prisma.skippedEmail.update({
    where: { id },
    data: { dismissed: true },
  });
  await revalidateAppPaths();
}

export async function getTransactionsForYear(year: number) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);

  return prisma.transaction.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      repayments: { orderBy: { date: "asc" } },
    },
  });
}

export async function getTransactionsForRange(
  startDate: Date,
  endDate: Date
) {
  return prisma.transaction.findMany({
    where: { date: { gte: startDate, lte: endDate } },
    orderBy: { date: "asc" },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      repayments: { orderBy: { date: "asc" } },
    },
  });
}

export async function getAvailableYears(): Promise<number[]> {
  const rows = await prisma.transaction.findMany({
    select: { date: true },
    orderBy: { date: "asc" },
  });

  const years = new Set<number>();
  for (const r of rows) {
    years.add(r.date.getFullYear());
  }

  if (years.size === 0) {
    years.add(new Date().getFullYear());
  }

  return Array.from(years).sort((a, b) => b - a);
}

export async function getBudgetForMonth(month: number, year: number) {
  return prisma.budget.findFirst({
    where: {
      OR: [
        { start_year: { lt: year } },
        { start_year: year, start_month: { lte: month } },
      ],
    },
    orderBy: [{ start_year: "desc" }, { start_month: "desc" }],
  });
}

export async function setBudget(
  startMonth: number,
  startYear: number,
  amount: number
) {
  if (amount <= 0) throw new Error("Budget amount must be positive");

  await prisma.budget.upsert({
    where: {
      start_month_start_year: { start_month: startMonth, start_year: startYear },
    },
    update: { amount },
    create: { start_month: startMonth, start_year: startYear, amount },
  });
  await revalidateAppPaths();
}

export async function deleteBudget(id: string) {
  await prisma.budget.delete({ where: { id } });
  await revalidateAppPaths();
}

export async function getAllBudgets() {
  return prisma.budget.findMany({
    orderBy: [{ start_year: "desc" }, { start_month: "desc" }],
  });
}

export async function parseExpenseText(text: string) {
  const { google } = await import("@ai-sdk/google");
  const { generateObject } = await import("ai");
  const { batchTransactionSchema } = await import("@/lib/schemas");
  const { buildCategoryPromptText } = await import("@/lib/categories");
  const { resolveTransactionDate } = await import("@/lib/date-extraction");

  const categoryData = await getCategoryPromptData();
  const categoryPromptText = buildCategoryPromptText(categoryData);

  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const prompt = `You are a financial transaction parser for natural language expense text and bank alert emails.
Extract ALL DEBIT (money going out) transactions from the user's text.

IMPORTANT: The text may contain multiple transactions or multiple bank alert emails. Extract each one as a separate transaction in the array.
- The user may paste multiple bank alert emails (from HDFC, IDFC FIRST Bank, etc.) separated by blank lines or headers like "Dear Cardmember"
- Each email typically describes one transaction, but there could be multiple emails
- Also handle natural text with multiple expenses separated by newlines, semicolons, commas, or "and"
- Each distinct expense or email alert should be a separate transaction
- If only one expense is described, return an array with one transaction

Extraction rules for each transaction:
- amount: The amount in INR. Look for "Rs.", "INR", "Rs", or just a number.
- merchant: The merchant/payee name (e.g. "Swiggy", "Zomato", "Amazon").
- date: Transaction date in ISO 8601 format (YYYY-MM-DDT00:00:00Z, always UTC with Z suffix).
  Today's date is ${today} and the current year is ${currentYear}.
  If no date is mentioned, use today's date.
  Support formats like "today", "yesterday", "23 Feb", "23-02-2026", "23/02/2026".
  Indian formats use dd-mm-yyyy or dd-mm-yy (day first).
  For 2-digit years (e.g. "23-02-26"), interpret as dd-mm-yy — so "23-02-26" means 23 Feb 2026.
- category: Must be one of the categories below.
- subcategory: Must be one of the listed subcategories for the chosen category, or null.
- is_cc_payment: true ONLY if explicitly paying off a credit card bill. Regular purchases are false.
- confidence_score (0.0 to 1.0): Lower if amount/merchant/category is unclear or guessed.

Available categories and subcategories:
${categoryPromptText}

User text:
${text}`;

  const { object: result } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: batchTransactionSchema,
    prompt,
  });

  return result.transactions.map((transaction) => {
    const resolvedDate = resolveTransactionDate(transaction.date, text);
    return {
      amount: transaction.amount,
      merchant: transaction.merchant,
      date: resolvedDate.toISOString(),
      category: transaction.category,
      subcategory: transaction.subcategory,
      is_cc_payment: transaction.is_cc_payment,
      confidence_score: transaction.confidence_score,
    };
  });
}

export async function parseImportSheet(
  rows: string[][],
  sheetName: string,
  detectedMonth?: number,
  detectedYear?: number
) {
  const { google } = await import("@ai-sdk/google");
  const { generateObject } = await import("ai");
  const { batchTransactionSchema } = await import("@/lib/schemas");
  const { buildCategoryPromptText } = await import("@/lib/categories");

  const categoryData = await getCategoryPromptData();
  const categoryPromptText = buildCategoryPromptText(categoryData);

  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  const headers = rows[0]?.join(" | ") ?? "";
  const dataRows = rows
    .slice(1)
    .filter((row) => row.some((cell) => cell.trim() !== ""))
    .map((row) => row.join(" | "))
    .join("\n");

  const monthHint =
    detectedMonth !== undefined && detectedYear !== undefined
      ? `The sheet is labeled "${sheetName}" which corresponds to ${new Date(detectedYear, detectedMonth).toLocaleString("en-IN", { month: "long", year: "numeric" })}. If rows don't have explicit dates, use dates within this month.`
      : `The sheet is labeled "${sheetName}". Try to infer the month/year from the sheet name or row data.`;

  const prompt = `You are a financial transaction parser for spreadsheet data imported from Google Sheets.
Extract ALL expense/debit transactions from the tabular data below.

${monthHint}

The data has these columns (pipe-separated):
${headers}

Data rows (pipe-separated):
${dataRows}

Extraction rules for each row:
- amount: The transaction amount in INR. Look for numeric columns (may have "Rs.", "INR", commas, or just numbers). Ignore rows with zero or empty amounts.
- merchant: The merchant/payee/description. Look for text columns describing what the expense was for.
- date: Transaction date in ISO 8601 format (YYYY-MM-DDT00:00:00Z, always UTC with Z suffix).
  Today's date is ${today} and the current year is ${currentYear}.
  Indian formats use dd-mm-yyyy or dd/mm/yyyy or dd-Mon-yyyy (day first).
  If only a day number is present, use the month/year from the sheet name.
  If no date at all, use the 1st of the detected month.
- category: Must be one of the categories below. Infer from the merchant/description.
- subcategory: Must be one of the listed subcategories for the chosen category, or null.
- is_cc_payment: true ONLY if explicitly paying off a credit card bill. Regular purchases are false.
- confidence_score (0.0 to 1.0): Lower if amount/merchant/category is unclear or guessed.

Skip rows that are:
- Headers, totals, subtotals, summaries, or empty rows
- Income/credit transactions (money coming in)
- Rows with no meaningful transaction data

Available categories and subcategories:
${categoryPromptText}`;

  const { object: result } = await generateObject({
    model: google("gemini-2.5-flash"),
    schema: batchTransactionSchema,
    prompt,
  });

  return result.transactions.map((t) => ({
    amount: t.amount,
    merchant: t.merchant,
    date: t.date,
    category: t.category,
    subcategory: t.subcategory,
    is_cc_payment: t.is_cc_payment,
    confidence_score: t.confidence_score,
  }));
}

export async function checkDuplicates(
  transactions: { amount: number; merchant: string; date: string }[]
) {
  const results: boolean[] = [];

  for (const t of transactions) {
    const txDate = new Date(t.date);
    const startOfDay = new Date(txDate);
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(txDate);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const existing = await prisma.transaction.findFirst({
      where: {
        amount: t.amount,
        merchant: { equals: t.merchant, mode: "insensitive" },
        date: { gte: startOfDay, lte: endOfDay },
      },
    });
    results.push(!!existing);
  }

  return results;
}

export async function createTransactionsBatch(
  transactions: {
    amount: number;
    merchant: string;
    date: string;
    category: string;
    subcategory?: string | null;
    is_cc_payment: boolean;
  }[]
) {
  for (const data of transactions) {
    const { categoryId, subcategoryId } = await resolveCategoryIds(
      data.category,
      data.subcategory ?? null
    );

    await prisma.transaction.create({
      data: {
        amount: data.amount,
        merchant: data.merchant,
        date: new Date(data.date),
        category: data.category,
        categoryId,
        subcategoryId,
        is_cc_payment: data.is_cc_payment,
        confidence_score: 1.0,
        needs_review: false,
        source: "import",
      },
    });
  }
  await revalidateAppPaths();
}

export async function getCachedInsight(period: Period): Promise<InsightResult | null> {
  const { periodKey } = await import("@/lib/insights-period");
  const key = periodKey(period);

  const cached = await prisma.insight.findUnique({
    where: { period_type_period_key: { period_type: period.type, period_key: key } },
  });

  if (!cached) return null;

  return {
    status: "ok",
    cached: true,
    stats: cached.stats as unknown as InsightStats,
    insight: {
      summary: cached.summary,
      trends: cached.trends as unknown as string[],
      anomalies: cached.anomalies as unknown as InsightOutput["anomalies"],
      suggestions: cached.suggestions as unknown as string[],
      model: cached.model,
      generatedAt: cached.updated_at.toISOString(),
    },
  };
}

export async function getInsights(
  period: Period,
  force = false
): Promise<InsightResult> {
  const { computeInsightStats } = await import("@/lib/insights-stats");
  const { periodKey, periodLabel, previousPeriodLabel } = await import(
    "@/lib/insights-period"
  );

  const key = periodKey(period);
  const stats = await computeInsightStats(period);

  const cached = await prisma.insight.findUnique({
    where: { period_type_period_key: { period_type: period.type, period_key: key } },
  });

  const latestTxAt = stats.latestTxDate ? new Date(stats.latestTxDate) : null;

  if (
    !force &&
    cached &&
    cached.tx_count_at_generation === stats.txCount &&
    latestTxAt &&
    cached.tx_latest_at_generation.getTime() === latestTxAt.getTime()
  ) {
    return {
      status: "ok",
      cached: true,
      stats,
      insight: {
        summary: cached.summary,
        trends: cached.trends as unknown as string[],
        anomalies: cached.anomalies as unknown as InsightOutput["anomalies"],
        suggestions: cached.suggestions as unknown as string[],
        model: cached.model,
        generatedAt: cached.updated_at.toISOString(),
      },
    };
  }

  if (stats.txCount < MIN_TRANSACTIONS_FOR_INSIGHTS) {
    return {
      status: "not_enough_data",
      cached: false,
      stats,
      insight: null,
      reason: "not_enough_data",
    };
  }

  const { google } = await import("@ai-sdk/google");
  const { generateObject } = await import("ai");
  const { insightOutputSchema, clampInsightOutput, INSIGHT_LIMITS } =
    await import("@/lib/schemas");

  const label = periodLabel(period);
  const prevLabel = previousPeriodLabel(period);

  const prompt = `You are a financial analyst describing one period of personal spending for a single user in India (INR).
You will be given PRE-COMPUTED aggregates as JSON. Do not invent or recompute numbers — only reference figures that appear in the JSON below.

Output length limits (STRICT — return AT MOST this many items, fewer is fine):
- trends: ${INSIGHT_LIMITS.trends} items max
- anomalies: ${INSIGHT_LIMITS.anomalies} items max
- suggestions: ${INSIGHT_LIMITS.suggestions} items max

Rules:
- Be descriptive, not prescriptive. Do NOT give investment or financial advice.
- Reference specific merchants, categories, and INR figures from the data.
- For anomalies, ONLY include merchants that appear in stats.anomalies. Do not invent new anomalies. Explain the z-score in plain language (e.g. "3.1σ above the category mean").
- For suggestions, prefer concrete observations tied to data (e.g. "Swiggy appears 14 times — consider a monthly cap") over generic advice.
- If a category dropped to zero, do not speculate why.
- All amounts are INR. Format like ₹1,234.
- The comparison period is "${prevLabel}". Refer to it by name when relevant.

Period: ${label}
Stats:
${JSON.stringify(stats, null, 2)}`;

  const { object: raw } = await generateObject({
    model: google(INSIGHTS_MODEL),
    schema: insightOutputSchema,
    prompt,
  });

  const object = clampInsightOutput(raw);

  const saved = await prisma.insight.upsert({
    where: { period_type_period_key: { period_type: period.type, period_key: key } },
    update: {
      month: period.type === "month" ? period.month : null,
      year: period.year,
      stats: stats as unknown as object,
      summary: object.summary,
      trends: object.trends,
      anomalies: object.anomalies,
      suggestions: object.suggestions,
      tx_count_at_generation: stats.txCount,
      tx_latest_at_generation: latestTxAt ?? new Date(),
      model: INSIGHTS_MODEL,
    },
    create: {
      period_type: period.type,
      period_key: key,
      month: period.type === "month" ? period.month : null,
      year: period.year,
      stats: stats as unknown as object,
      summary: object.summary,
      trends: object.trends,
      anomalies: object.anomalies,
      suggestions: object.suggestions,
      tx_count_at_generation: stats.txCount,
      tx_latest_at_generation: latestTxAt ?? new Date(),
      model: INSIGHTS_MODEL,
    },
  });

  revalidatePath("/analytics");

  return {
    status: "ok",
    cached: false,
    stats,
    insight: {
      summary: saved.summary,
      trends: saved.trends as unknown as string[],
      anomalies: saved.anomalies as unknown as InsightOutput["anomalies"],
      suggestions: saved.suggestions as unknown as string[],
      model: saved.model,
      generatedAt: saved.updated_at.toISOString(),
    },
  };
}

// ---------- Recoverable transactions ----------

export interface SerializedRepayment {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  note: string | null;
  created_at: string;
}

export interface RecoverableTransactionDTO {
  id: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string | null;
  counterparty: string;
  recoverable_amount: number;
  recovery_status: RecoveryStatus;
  repayments: SerializedRepayment[];
  outstanding: number;
  repaid: number;
}

export interface CounterpartyGroup {
  counterparty: string;
  outstanding: number;
  total_lent: number;
  total_repaid: number;
  transactions: RecoverableTransactionDTO[];
}

async function recomputeRecoveryStatus(transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { repayments: true },
  });
  if (!tx || tx.recoverable_amount == null) return;
  const current = isRecoveryStatus(tx.recovery_status)
    ? tx.recovery_status
    : null;
  const repaid = sumRepayments(tx.repayments);
  const next = computeRecoveryStatus(tx.recoverable_amount, repaid, current);
  if (next !== tx.recovery_status) {
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { recovery_status: next },
    });
  }
}

export async function markRecoverable(
  transactionId: string,
  data: { counterparty: string; recoverable_amount?: number }
) {
  const counterparty = data.counterparty.trim();
  if (!counterparty) throw new Error("Counterparty is required");

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });
  if (!tx) throw new Error("Transaction not found");

  const recoverable =
    data.recoverable_amount !== undefined
      ? data.recoverable_amount
      : tx.amount;
  if (recoverable <= 0) throw new Error("Recoverable amount must be positive");
  if (recoverable > tx.amount) {
    throw new Error("Recoverable amount cannot exceed transaction amount");
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      counterparty,
      recoverable_amount: recoverable,
      recovery_status: RECOVERY_STATUS.PENDING,
    },
  });
  await recomputeRecoveryStatus(transactionId);
  await revalidateAppPaths();
}

export async function unmarkRecoverable(transactionId: string) {
  await prisma.repayment.deleteMany({
    where: { transaction_id: transactionId },
  });
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      counterparty: null,
      recoverable_amount: null,
      recovery_status: null,
    },
  });
  await revalidateAppPaths();
}

export async function addRepayment(
  transactionId: string,
  data: { amount: number; date: string; note?: string | null }
) {
  if (data.amount <= 0) throw new Error("Repayment amount must be positive");

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });
  if (!tx) throw new Error("Transaction not found");
  if (tx.recoverable_amount == null) {
    throw new Error("Transaction is not marked as recoverable");
  }

  await prisma.repayment.create({
    data: {
      transaction_id: transactionId,
      amount: data.amount,
      date: new Date(data.date),
      note: data.note?.trim() || null,
    },
  });
  await recomputeRecoveryStatus(transactionId);
  await revalidateAppPaths();
}

export async function updateRepayment(
  repaymentId: string,
  data: { amount?: number; date?: string; note?: string | null }
) {
  if (data.amount !== undefined && data.amount <= 0) {
    throw new Error("Repayment amount must be positive");
  }

  const repayment = await prisma.repayment.findUnique({
    where: { id: repaymentId },
  });
  if (!repayment) throw new Error("Repayment not found");

  const updateData: Record<string, unknown> = {};
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.date !== undefined) updateData.date = new Date(data.date);
  if (data.note !== undefined) updateData.note = data.note?.trim() || null;

  await prisma.repayment.update({
    where: { id: repaymentId },
    data: updateData,
  });
  await recomputeRecoveryStatus(repayment.transaction_id);
  await revalidateAppPaths();
}

export async function deleteRepayment(repaymentId: string) {
  const repayment = await prisma.repayment.findUnique({
    where: { id: repaymentId },
  });
  if (!repayment) throw new Error("Repayment not found");

  await prisma.repayment.delete({ where: { id: repaymentId } });
  await recomputeRecoveryStatus(repayment.transaction_id);
  await revalidateAppPaths();
}

export async function writeOffRecoverable(transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });
  if (!tx) throw new Error("Transaction not found");
  if (tx.recoverable_amount == null) {
    throw new Error("Transaction is not marked as recoverable");
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { recovery_status: RECOVERY_STATUS.WRITTEN_OFF },
  });
  await revalidateAppPaths();
}

export async function reopenRecoverable(transactionId: string) {
  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
    include: { repayments: true },
  });
  if (!tx) throw new Error("Transaction not found");
  if (tx.recoverable_amount == null) {
    throw new Error("Transaction is not marked as recoverable");
  }

  const repaid = sumRepayments(tx.repayments);
  const next = computeRecoveryStatus(tx.recoverable_amount, repaid, null);
  await prisma.transaction.update({
    where: { id: transactionId },
    data: { recovery_status: next },
  });
  await revalidateAppPaths();
}

export async function getRecoverables(): Promise<CounterpartyGroup[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      recoverable_amount: { not: null },
      counterparty: { not: null },
    },
    orderBy: { date: "desc" },
    include: {
      subcategoryRef: true,
      repayments: { orderBy: { date: "asc" } },
    },
  });

  const groups = new Map<string, CounterpartyGroup>();

  for (const tx of rows) {
    const counterparty = tx.counterparty ?? "Unknown";
    const status = isRecoveryStatus(tx.recovery_status)
      ? tx.recovery_status
      : RECOVERY_STATUS.PENDING;
    const recoverableAmount = tx.recoverable_amount ?? 0;
    const repaid = sumRepayments(tx.repayments);
    const outstanding = outstandingAmount({
      amount: tx.amount,
      recoverable_amount: recoverableAmount,
      recovery_status: status,
      repayments: tx.repayments,
    });

    const dto: RecoverableTransactionDTO = {
      id: tx.id,
      amount: tx.amount,
      merchant: tx.merchant,
      date: tx.date.toISOString(),
      category: tx.category,
      subcategory: tx.subcategoryRef?.name ?? null,
      counterparty,
      recoverable_amount: recoverableAmount,
      recovery_status: status,
      repayments: tx.repayments.map((r) => ({
        id: r.id,
        transaction_id: r.transaction_id,
        amount: r.amount,
        date: r.date.toISOString(),
        note: r.note,
        created_at: r.created_at.toISOString(),
      })),
      outstanding,
      repaid,
    };

    const group =
      groups.get(counterparty) ??
      ({
        counterparty,
        outstanding: 0,
        total_lent: 0,
        total_repaid: 0,
        transactions: [],
      } satisfies CounterpartyGroup);

    group.transactions.push(dto);
    group.outstanding += outstanding;
    group.total_lent += recoverableAmount;
    group.total_repaid += repaid;
    groups.set(counterparty, group);
  }

  return [...groups.values()].sort((a, b) => b.outstanding - a.outstanding);
}

export async function getTotalOutstanding(): Promise<{
  total: number;
  counterpartyCount: number;
}> {
  const rows = await prisma.transaction.findMany({
    where: {
      recoverable_amount: { not: null },
      recovery_status: { in: [RECOVERY_STATUS.PENDING, RECOVERY_STATUS.PARTIAL] },
    },
    select: {
      amount: true,
      recoverable_amount: true,
      recovery_status: true,
      counterparty: true,
      repayments: { select: { amount: true } },
    },
  });

  let total = 0;
  const counterparties = new Set<string>();
  for (const tx of rows) {
    total += outstandingAmount({
      amount: tx.amount,
      recoverable_amount: tx.recoverable_amount,
      recovery_status: tx.recovery_status,
      repayments: tx.repayments,
    });
    if (tx.counterparty) counterparties.add(tx.counterparty);
  }

  return { total, counterpartyCount: counterparties.size };
}

// ---------- EMI transactions ----------

export async function markAsEmi(
  transactionId: string,
  data: {
    tenureMonths: number;
    monthlyAmount?: number;
    startDate?: string;
  }
) {
  const tenure = Math.trunc(data.tenureMonths);
  if (!Number.isFinite(tenure) || tenure < 2) {
    throw new Error("EMI tenure must be at least 2 months");
  }

  const tx = await prisma.transaction.findUnique({
    where: { id: transactionId },
  });
  if (!tx) throw new Error("Transaction not found");
  if (tx.is_cc_payment) {
    throw new Error("Credit card payments cannot be converted to EMI");
  }

  const monthly =
    data.monthlyAmount !== undefined && data.monthlyAmount > 0
      ? data.monthlyAmount
      : defaultMonthlyAmount(tx.amount, tenure);

  const startDate = data.startDate ? new Date(data.startDate) : tx.date;

  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      is_emi: true,
      emi_tenure_months: tenure,
      emi_monthly_amount: monthly,
      emi_start_date: startDate,
      // EMI and recoverable are mutually exclusive.
      recoverable_amount: null,
      counterparty: null,
      recovery_status: null,
    },
  });

  await prisma.repayment.deleteMany({
    where: { transaction_id: transactionId },
  });

  await revalidateAppPaths();
}

export async function unmarkEmi(transactionId: string) {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      is_emi: false,
      emi_tenure_months: null,
      emi_monthly_amount: null,
      emi_start_date: null,
    },
  });
  await revalidateAppPaths();
}

export interface EmiInstallmentDTO {
  id: string;
  sourceId: string;
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string | null;
  installmentNumber: number;
  tenureMonths: number;
  isEmiInstallment: true;
}

/**
 * Virtual EMI installment line items for a month. These are NOT stored rows —
 * they are projections of EMI purchases that started in an earlier month and
 * whose tenure window covers (month, year). The purchase's own start month is
 * represented by the real transaction row, so it is excluded here.
 */
/**
 * Transactions for [startDate, endDate] with EMI purchases spread into per-month
 * installments (clipped to the range). Includes EMIs that started before the
 * range but whose window overlaps it. Shapes the result like the include-based
 * queries so analytics `serialize`/`computeStats` work unchanged.
 */
export async function getSpreadTransactionsForRange(
  startDate: Date,
  endDate: Date
) {
  const { expandTransactionsForRange } = await import("@/lib/emi");

  const rows = await prisma.transaction.findMany({
    where: {
      OR: [
        { date: { gte: startDate, lte: endDate } },
        { is_emi: true, emi_start_date: { lt: startDate } },
      ],
    },
    orderBy: { date: "asc" },
    include: {
      categoryRef: true,
      subcategoryRef: true,
      repayments: { orderBy: { date: "asc" } },
    },
  });

  return expandTransactionsForRange(rows, startDate, endDate);
}

export async function getEmiInstallmentsForMonth(
  month: number,
  year: number
): Promise<EmiInstallmentDTO[]> {
  const startOfMonth = new Date(year, month, 1);

  const candidates = await prisma.transaction.findMany({
    where: {
      is_emi: true,
      emi_start_date: { lt: startOfMonth },
    },
    include: { subcategoryRef: true },
  });

  const installments: EmiInstallmentDTO[] = [];
  for (const tx of candidates) {
    const input = {
      amount: tx.amount,
      is_emi: tx.is_emi,
      emi_tenure_months: tx.emi_tenure_months,
      emi_monthly_amount: tx.emi_monthly_amount,
      emi_start_date: tx.emi_start_date,
      date: tx.date,
    };
    if (!hasVirtualInstallmentForMonth(input, month, year)) continue;

    const index = installmentIndexForMonth(input, month, year);
    const amount = emiInstallmentForMonth(input, month, year);
    if (amount <= 0) continue;

    installments.push({
      id: `emi-${tx.id}-${index}`,
      sourceId: tx.id,
      amount,
      merchant: tx.merchant,
      date: new Date(year, month, Math.min(tx.date.getDate(), 28)).toISOString(),
      category: tx.category,
      subcategory: tx.subcategoryRef?.name ?? null,
      installmentNumber: index + 1,
      tenureMonths: tx.emi_tenure_months as number,
      isEmiInstallment: true,
    });
  }

  return installments;
}

export async function getKnownCounterparties(): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { counterparty: { not: null } },
    select: { counterparty: true },
    distinct: ["counterparty"],
    orderBy: { counterparty: "asc" },
  });
  return rows
    .map((r) => r.counterparty)
    .filter((c): c is string => c !== null);
}

// ---------- Budget overage / carryover ----------

/**
 * Effective spend for a single month, matching the dashboard's computation:
 * real (non-CC) transactions via `effectiveSpend` (recoverable-aware) plus
 * virtual EMI installments whose window covers the month. Each rupee counts once.
 */
export async function getEffectiveSpendForMonth(
  month: number,
  year: number
): Promise<number> {
  const [transactions, emiInstallments] = await Promise.all([
    getTransactions(month, year),
    getEmiInstallmentsForMonth(month, year),
  ]);

  const txnSpend = transactions
    .filter((t) => !t.is_cc_payment)
    .reduce((sum, t) => sum + effectiveSpend(t), 0);

  const emiSpend = emiInstallments.reduce((sum, i) => sum + i.amount, 0);

  return txnSpend + emiSpend;
}

/**
 * Lazily create a BudgetOverage row for every CLOSED month that ran over budget
 * and does not already have one. Idempotent: never touches existing rows (so
 * manual overrides, owed_to labels, and payments are preserved), and never
 * creates rows for the current/future month or for months with no budget.
 */
export async function syncClosedOverages(): Promise<void> {
  const budgets = await prisma.budget.findMany({
    orderBy: [{ start_year: "asc" }, { start_month: "asc" }],
  });
  if (budgets.length === 0) return;

  const existing = await prisma.budgetOverage.findMany({
    select: { month: true, year: true },
  });
  const have = new Set(existing.map((o) => `${o.year}-${o.month}`));

  const now = new Date();
  const earliest = budgets[0];
  let cursor = new Date(earliest.start_year, earliest.start_month, 1);
  const stop = new Date(now.getFullYear(), now.getMonth(), 1); // exclusive: current month

  const toCreate: { month: number; year: number }[] = [];
  while (cursor < stop) {
    const month = cursor.getMonth();
    const year = cursor.getFullYear();
    if (!have.has(`${year}-${month}`)) {
      const budget = await getBudgetForMonth(month, year);
      if (budget) {
        const spent = await getEffectiveSpendForMonth(month, year);
        if (spent > budget.amount) {
          toCreate.push({ month, year });
        }
      }
    }
    cursor = new Date(year, month + 1, 1);
  }

  if (toCreate.length > 0) {
    await prisma.budgetOverage.createMany({
      data: toCreate.map((c) => ({
        month: c.month,
        year: c.year,
        status: OVERAGE_STATUS.OUTSTANDING,
      })),
      skipDuplicates: true,
    });
  }
}

export interface CarryoverMonthDTO {
  id: string;
  month: number;
  year: number;
  budget_amount: number;
  spent_amount: number;
  gross_overage: number;
  override_amount: number | null;
  owed_to: string | null;
  outstanding: number;
  paid: number;
  status: string;
  payments: {
    id: string;
    amount: number;
    date: string;
    note: string | null;
    created_at: string;
  }[];
}

export interface CarryoverSummary {
  totalOutstanding: number;
  totalOverage: number;
  totalPaid: number;
  months: CarryoverMonthDTO[];
}

/**
 * Full carryover picture: every recorded over-budget month with its live-derived
 * overage (or manual override), payments, outstanding balance, and status.
 * Runs `syncClosedOverages` first so newly-closed months appear automatically.
 */
export async function getCarryoverSummary(): Promise<CarryoverSummary> {
  await syncClosedOverages();

  const rows = await prisma.budgetOverage.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { payments: { orderBy: { date: "asc" } } },
  });

  const months: CarryoverMonthDTO[] = [];
  for (const row of rows) {
    const budget = await getBudgetForMonth(row.month, row.year);
    const budgetAmount = budget?.amount ?? 0;
    const spent = await getEffectiveSpendForMonth(row.month, row.year);

    const gross = grossOverage({
      override_amount: row.override_amount,
      budget_amount: budgetAmount,
      spent_amount: spent,
    });
    const paid = sumPayments(row.payments);
    const outstanding = outstandingOverage({
      override_amount: row.override_amount,
      budget_amount: budgetAmount,
      spent_amount: spent,
      payments: row.payments,
    });

    months.push({
      id: row.id,
      month: row.month,
      year: row.year,
      budget_amount: budgetAmount,
      spent_amount: spent,
      gross_overage: gross,
      override_amount: row.override_amount,
      owed_to: row.owed_to,
      outstanding,
      paid,
      status: computeOverageStatus(gross, paid),
      payments: row.payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        date: p.date.toISOString(),
        note: p.note,
        created_at: p.created_at.toISOString(),
      })),
    });
  }

  const totalOutstanding = months.reduce((s, m) => s + m.outstanding, 0);
  const totalOverage = months.reduce((s, m) => s + m.gross_overage, 0);
  const totalPaid = months.reduce((s, m) => s + m.paid, 0);

  return { totalOutstanding, totalOverage, totalPaid, months };
}

async function syncOverageStatus(overageId: string): Promise<void> {
  const row = await prisma.budgetOverage.findUnique({
    where: { id: overageId },
    include: { payments: { select: { amount: true } } },
  });
  if (!row) return;

  const budget = await getBudgetForMonth(row.month, row.year);
  const spent = await getEffectiveSpendForMonth(row.month, row.year);
  const gross = grossOverage({
    override_amount: row.override_amount,
    budget_amount: budget?.amount ?? 0,
    spent_amount: spent,
  });
  const paid = sumPayments(row.payments);

  await prisma.budgetOverage.update({
    where: { id: overageId },
    data: { status: computeOverageStatus(gross, paid) },
  });
}

export async function addOveragePayment(
  overageId: string,
  data: { amount: number; date: string; note?: string | null }
): Promise<void> {
  if (data.amount <= 0) throw new Error("Payment amount must be positive");

  const row = await prisma.budgetOverage.findUnique({
    where: { id: overageId },
  });
  if (!row) throw new Error("Overage not found");

  await prisma.overagePayment.create({
    data: {
      overage_id: overageId,
      amount: data.amount,
      date: new Date(data.date),
      note: data.note?.trim() || null,
    },
  });
  await syncOverageStatus(overageId);
  await revalidateAppPaths();
}

export interface BulkPaymentPreviewItem {
  id: string;
  month: number;
  year: number;
  outstandingBefore: number;
  applied: number;
  outstandingAfter: number;
}

export interface BulkPaymentPreview {
  items: BulkPaymentPreviewItem[];
  totalApplied: number;
  leftover: number;
  totalOutstanding: number;
}

/**
 * Ordered (oldest month first) outstanding balances for every recorded overage,
 * used to drive the waterfall allocation. Excludes months with nothing owed.
 */
async function getOrderedOutstanding(): Promise<
  { id: string; month: number; year: number; outstanding: number }[]
> {
  const summary = await getCarryoverSummary();
  return summary.months
    .filter((m) => m.outstanding > 0)
    .map((m) => ({
      id: m.id,
      month: m.month,
      year: m.year,
      outstanding: m.outstanding,
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);
}

/**
 * Preview how a lump-sum payment would waterfall across outstanding months
 * (oldest first) without persisting anything.
 */
export async function previewBulkOveragePayment(
  amount: number
): Promise<BulkPaymentPreview> {
  const targets = await getOrderedOutstanding();
  const totalOutstanding = targets.reduce((s, t) => s + t.outstanding, 0);

  const result = allocateWaterfall(amount, targets);
  const appliedById = new Map(result.allocations.map((a) => [a.id, a.applied]));

  const items: BulkPaymentPreviewItem[] = targets
    .map((t) => {
      const applied = appliedById.get(t.id) ?? 0;
      return {
        id: t.id,
        month: t.month,
        year: t.year,
        outstandingBefore: t.outstanding,
        applied,
        outstandingAfter: Math.round((t.outstanding - applied) * 100) / 100,
      };
    })
    .filter((i) => i.applied > 0);

  return {
    items,
    totalApplied: result.totalApplied,
    leftover: result.leftover,
    totalOutstanding,
  };
}

/**
 * Log a single lump-sum payment that is distributed across outstanding months,
 * oldest first, spilling into the next month as each is settled. Creates one
 * OveragePayment record per month that receives a share (so per-month history
 * stays auditable), all sharing the same note. Any amount beyond total
 * outstanding is not allocated and returned as `leftover`.
 */
export async function addBulkOveragePayment(data: {
  amount: number;
  date: string;
  note?: string | null;
}): Promise<{ totalApplied: number; leftover: number; monthsPaid: number }> {
  if (data.amount <= 0) throw new Error("Payment amount must be positive");

  const targets = await getOrderedOutstanding();
  const result = allocateWaterfall(data.amount, targets);

  if (result.allocations.length === 0) {
    return { totalApplied: 0, leftover: result.leftover, monthsPaid: 0 };
  }

  const note = data.note?.trim() || null;
  const bulkNote = note
    ? `${note} (bulk ${result.totalApplied})`
    : `Bulk payment ${result.totalApplied}`;
  const date = new Date(data.date);

  await prisma.overagePayment.createMany({
    data: result.allocations.map((a) => ({
      overage_id: a.id,
      amount: a.applied,
      date,
      note: bulkNote,
    })),
  });

  for (const allocation of result.allocations) {
    await syncOverageStatus(allocation.id);
  }
  await revalidateAppPaths();

  return {
    totalApplied: result.totalApplied,
    leftover: result.leftover,
    monthsPaid: result.allocations.length,
  };
}

export async function deleteOveragePayment(paymentId: string): Promise<void> {
  const payment = await prisma.overagePayment.findUnique({
    where: { id: paymentId },
  });
  if (!payment) throw new Error("Payment not found");

  await prisma.overagePayment.delete({ where: { id: paymentId } });
  await syncOverageStatus(payment.overage_id);
  await revalidateAppPaths();
}

export async function setOverageOverride(
  overageId: string,
  amount: number | null
): Promise<void> {
  if (amount != null && amount < 0) {
    throw new Error("Override amount cannot be negative");
  }

  await prisma.budgetOverage.update({
    where: { id: overageId },
    data: { override_amount: amount },
  });
  await syncOverageStatus(overageId);
  await revalidateAppPaths();
}

export async function setOverageOwedTo(
  overageId: string,
  owedTo: string | null
): Promise<void> {
  await prisma.budgetOverage.update({
    where: { id: overageId },
    data: { owed_to: owedTo?.trim() || null },
  });
  await revalidateAppPaths();
}
