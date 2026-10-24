import { google as googleapis, type gmail_v1 } from "googleapis";
import { generateObject } from "ai";
import { extractionModel } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { buildCategoryPromptText, DEFAULT_CATEGORIES } from "@/lib/categories";
import { emailBodySnippet, buildEmailText } from "@/lib/email";
import { transactionSchema } from "@/lib/schemas";
import { resolveTransactionDate } from "@/lib/date-extraction";

/**
 * Shared Gmail → AI → DB pipeline used by the cron route and the chunked
 * /debug runner. Everything below is per-email work so that an HTTP request
 * can process a bounded number of emails and return before the Cloudflare
 * 100s origin timeout.
 */

// We use newer_than:2d (not 1d) as a safety buffer.
// Cron runs at 11:30 PM IST - if an email arrives at 11:35 PM the previous night,
// a 1d window would miss it by the next run. 2d ensures overlap, and the
// email_message_id unique constraint prevents any duplicates from being saved.
export const BANK_EMAIL_QUERY = [
  "is:unread",
  "newer_than:2d",
  "(",
  "from:alerts@hdfcbank.net",
  "OR from:alerts@hdfcbank.bank.in",
  "OR from:nachautoemailer@hdfcbank.bank.in",
  "OR from:noreply@idfcfirstbank.com",
  "OR from:delivery.idfcfirstbank.com",
  ")",
].join(" ");

export function buildAIPrompt(categoryPromptText: string): string {
  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);
  return `You are a financial transaction parser for Indian bank alert emails.
Your job is to extract DEBIT (money going out) transactions — any transaction where money leaves the account.

CRITICAL — set confidence_score to 0.0 and skip ONLY if the email is one of these:
- A CREDIT/refund alert (money coming IN, e.g. "credited to your account", "received", "refund processed")
- A marketing/promotional email
- An OTP or verification code
- A monthly statement or summary
- A balance update without a specific debit transaction

IMPORTANT — the following ARE valid debits and must NOT be skipped:
- Transfers to investment/trading platforms, mutual funds, SIPs, brokerages
- Insurance premium payments
- Loan EMI payments
- Transfers to savings accounts, fixed deposits, PPF, NPS
- UPI/NEFT/IMPS/RTGS transfers to any recipient
- Bill payments, subscriptions, recharges
- ATM withdrawals
If money left the account, it is a debit — extract it regardless of the purpose.

How to distinguish DEBIT vs CREDIT:
- DEBIT keywords: "debited", "spent", "paid", "purchased", "charged", "withdrawn", "debit alert", "transferred"
- CREDIT keywords: "credited", "received", "refund", "cashback credited", "credit alert"
- If the email says "credited to your account" — this is a CREDIT, set confidence_score to 0.0

Extraction rules:
- amount: The debited amount in INR. Look for "Rs.", "INR", "Rs" followed by a number.
- merchant: The merchant/payee name.
  - HDFC: usually after "at" or "to" (e.g. "at SWIGGY" or "to JOHN DOE")
  - HDFC NACH auto-debit: the merchant name appears after "towards" (e.g. "towards MERCHANT NAME with UMRN")
  - IDFC FIRST Bank: usually after "spent at" or "paid to"
- date: Transaction date in ISO 8601 format (YYYY-MM-DDT00:00:00Z, always UTC with Z suffix). Parse from email body, or fall back to today (${today}).
  Today's date is ${today} and the current year is ${currentYear}. Do NOT default to past years like 2024 — use the year stated in the email.
  Indian bank emails typically use dd-mm-yyyy or dd-mm-yy date formats (day first, then month, then year).
  For 2-digit years (e.g. "23-02-26"), interpret as dd-mm-yy NOT yy-mm-dd — so "23-02-26" means 23 Feb 2026.
  Always pick the most recent valid date (not a future date). Never assume yyyy-mm-dd or mm-dd-yy.
- category: Must be one of the categories below.
- subcategory: Must be one of the listed subcategories for the chosen category, or null if that category has no subcategories.
- is_cc_payment: true ONLY if paying off a credit card bill (e.g. "CC bill payment"). Regular purchases made with a credit card are false.
- confidence_score (0.0 to 1.0): Lower if merchant name is unclear/truncated, amount is ambiguous, or you had to guess the category.

Available categories and subcategories:
${categoryPromptText}

Email content:
`;
}

export async function getCategoryPromptText(): Promise<string> {
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
    return buildCategoryPromptText(
      DEFAULT_CATEGORIES.map((category) => ({
        name: category.name,
        subcategories: category.subcategories ?? [],
      }))
    );
  }

  return buildCategoryPromptText(
    rows.map((row) => ({
      name: row.name,
      subcategories: row.children.map((child) => child.name),
    }))
  );
}

export function createGmailClient(): gmail_v1.Gmail {
  const oauth2Client = new googleapis.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    "https://developers.google.com/oauthplayground"
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.GMAIL_REFRESH_TOKEN,
  });

  return googleapis.gmail({ version: "v1", auth: oauth2Client });
}

export function resolveSearchQuery(override?: string | null): string {
  return (
    override?.trim() || process.env.GMAIL_SEARCH_QUERY || BANK_EMAIL_QUERY
  );
}

/** Gmail caps a single page at 500; page through until `limit` ids are collected. */
export async function listEmailIds(
  gmail: gmail_v1.Gmail,
  searchQuery: string,
  limit: number
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < limit) {
    const page = await gmail.users.messages.list({
      userId: "me",
      q: searchQuery,
      maxResults: Math.min(limit - ids.length, 500),
      pageToken,
    });

    for (const message of page.data.messages ?? []) {
      if (message.id) ids.push(message.id);
    }

    pageToken = page.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }

  return ids.slice(0, limit);
}

export function gmailWebUrl(messageId: string): string {
  return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

export type EntryStatus =
  | "saved"
  | "duplicate_skipped"
  | "duplicate_flagged"
  | "junk_skipped"
  | "would_save"
  | "would_skip_junk"
  | "would_flag_duplicate";

export interface ProcessedEntry {
  email_id: string;
  email_url?: string;
  from: string;
  subject: string;
  body_snippet?: string;
  parsed: {
    amount: number;
    merchant: string;
    date: string;
    category: string;
    subcategory: string | null;
    is_cc_payment: boolean;
    confidence_score: number;
  };
  status: EntryStatus;
  reason?: string;
  duplicate_of?: { id: string; date: string; amount: number; merchant: string };
}

export interface ProcessedError {
  email_id: string;
  from?: string;
  subject?: string;
  message: string;
}

export type ProcessOneOutcome =
  | { kind: "duplicate_skipped"; entry?: ProcessedEntry }
  | { kind: "junk"; entry: ProcessedEntry }
  | { kind: "processed"; entry: ProcessedEntry }
  | { kind: "error"; error: ProcessedError };

export interface ProcessOneOptions {
  gmail: gmail_v1.Gmail;
  messageId: string;
  categoryPromptText: string;
  dryRun: boolean;
  /** The cron endpoint only reports already-processed emails when verbose. */
  includeAlreadyProcessed?: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

function duplicateEntry(
  messageId: string,
  alreadyProcessed: {
    id: string;
    amount: number;
    merchant: string;
    date: Date;
    category: string;
    is_cc_payment: boolean;
    confidence_score: number;
  } | null,
  alreadySkipped: {
    sender: string;
    subject: string;
    body_snippet: string;
  } | null
): ProcessedEntry {
  return {
    email_id: messageId,
    email_url: gmailWebUrl(messageId),
    from: alreadySkipped?.sender || "",
    subject: alreadySkipped?.subject || "",
    body_snippet: alreadySkipped?.body_snippet,
    parsed: alreadyProcessed
      ? {
          amount: alreadyProcessed.amount,
          merchant: alreadyProcessed.merchant,
          date: alreadyProcessed.date.toISOString(),
          category: alreadyProcessed.category,
          subcategory: null,
          is_cc_payment: alreadyProcessed.is_cc_payment,
          confidence_score: alreadyProcessed.confidence_score,
        }
      : {
          amount: 0,
          merchant: "",
          date: "",
          category: "",
          subcategory: null,
          is_cc_payment: false,
          confidence_score: 0,
        },
    status: "duplicate_skipped",
    reason: alreadyProcessed
      ? `Already saved as transaction ${alreadyProcessed.id}`
      : "Already in skipped_emails table",
    duplicate_of: alreadyProcessed
      ? {
          id: alreadyProcessed.id,
          date: alreadyProcessed.date.toISOString(),
          amount: alreadyProcessed.amount,
          merchant: alreadyProcessed.merchant,
        }
      : undefined,
  };
}

async function findDuplicate(amount: number, merchant: string, date: Date) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  return prisma.transaction.findFirst({
    where: {
      amount,
      merchant,
      date: { gte: dayStart, lte: dayEnd },
    },
  });
}

/**
 * Process a single Gmail message end to end. Safe to retry: writes are
 * idempotent on `email_message_id`, so a timed-out request that is re-claimed
 * will not create a second transaction.
 */
export async function processOneEmail({
  gmail,
  messageId,
  categoryPromptText,
  dryRun,
  includeAlreadyProcessed = false,
}: ProcessOneOptions): Promise<ProcessOneOutcome> {
  try {
    const [alreadyProcessed, alreadySkipped] = await Promise.all([
      prisma.transaction.findUnique({
        where: { email_message_id: messageId },
      }),
      prisma.skippedEmail.findUnique({
        where: { email_message_id: messageId },
      }),
    ]);

    if (alreadyProcessed || alreadySkipped) {
      return {
        kind: "duplicate_skipped",
        entry: includeAlreadyProcessed
          ? duplicateEntry(messageId, alreadyProcessed, alreadySkipped)
          : undefined,
      };
    }

    const email = await gmail.users.messages.get({
      userId: "me",
      id: messageId,
      format: "full",
    });

    const headers = email.data.payload?.headers || [];
    const subject = headers.find((h) => h.name === "Subject")?.value || "";
    const from = headers.find((h) => h.name === "From")?.value || "";

    const parts = email.data.payload?.parts || [];
    let body =
      email.data.payload?.body?.data ||
      parts.find((p) => p.mimeType === "text/plain")?.body?.data ||
      parts.find((p) => p.mimeType === "text/html")?.body?.data ||
      "";

    if (body) {
      body = Buffer.from(body, "base64").toString("utf-8");
    }

    const emailText = buildEmailText(from, subject, body);

    const { object: transaction } = await generateObject({
      model: extractionModel(),
      schema: transactionSchema,
      prompt: buildAIPrompt(categoryPromptText) + emailText,
    });

    const snippet = emailBodySnippet(body);
    const aiReason = `AI classified as non-debit (merchant: ${transaction.merchant || "N/A"})`;

    if (transaction.confidence_score === 0) {
      if (!dryRun) {
        await prisma.skippedEmail.upsert({
          where: { email_message_id: messageId },
          update: {},
          create: {
            email_message_id: messageId,
            subject,
            sender: from,
            body_snippet: snippet,
            ai_reason: aiReason,
          },
        });
        await gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: { removeLabelIds: ["UNREAD"] },
        });
      }
      return {
        kind: "junk",
        entry: {
          email_id: messageId,
          email_url: gmailWebUrl(messageId),
          from,
          subject,
          body_snippet: snippet,
          parsed: { ...transaction, date: transaction.date },
          status: dryRun ? "would_skip_junk" : "junk_skipped",
          reason: aiReason,
        },
      };
    }

    const txDate = resolveTransactionDate(transaction.date, body);
    const duplicate = await findDuplicate(
      transaction.amount,
      transaction.merchant,
      txDate
    );

    let needsReview = transaction.confidence_score < 0.8;
    let status: EntryStatus = dryRun ? "would_save" : "saved";

    if (duplicate) {
      needsReview = true;
      status = dryRun ? "would_flag_duplicate" : "duplicate_flagged";
    }

    const parentCategory = await prisma.category.findFirst({
      where: { name: transaction.category, parentId: null },
      include: { children: true },
    });

    const matchedSubcategory = transaction.subcategory
      ? parentCategory?.children.find(
          (child) => child.name === transaction.subcategory
        ) ?? null
      : null;

    if (!dryRun) {
      try {
        await prisma.transaction.create({
          data: {
            amount: transaction.amount,
            merchant: transaction.merchant,
            date: txDate,
            category: transaction.category,
            categoryId: parentCategory?.id ?? null,
            subcategoryId: matchedSubcategory?.id ?? null,
            is_cc_payment: transaction.is_cc_payment,
            confidence_score: transaction.confidence_score,
            needs_review: needsReview,
            email_message_id: messageId,
            source: "email",
          },
        });
      } catch (err) {
        // Another worker (or a retried request) already saved this email.
        if (!isUniqueViolation(err)) throw err;
        const existing = await prisma.transaction.findUnique({
          where: { email_message_id: messageId },
        });
        return {
          kind: "duplicate_skipped",
          entry: duplicateEntry(messageId, existing, null),
        };
      }

      await gmail.users.messages.modify({
        userId: "me",
        id: messageId,
        requestBody: { removeLabelIds: ["UNREAD"] },
      });
    }

    const reasonParts: string[] = [];
    if (needsReview) {
      reasonParts.push(
        `confidence_score=${transaction.confidence_score.toFixed(2)} below 0.8 threshold`
      );
    }
    if (duplicate) {
      reasonParts.push(
        `Possible duplicate of transaction ${duplicate.id} (${duplicate.merchant}, ₹${duplicate.amount})`
      );
    }

    return {
      kind: "processed",
      entry: {
        email_id: messageId,
        email_url: gmailWebUrl(messageId),
        from,
        subject,
        body_snippet: snippet,
        parsed: { ...transaction, date: transaction.date },
        status,
        reason: reasonParts.length > 0 ? reasonParts.join("; ") : undefined,
        duplicate_of: duplicate
          ? {
              id: duplicate.id,
              date: duplicate.date.toISOString(),
              amount: duplicate.amount,
              merchant: duplicate.merchant,
            }
          : undefined,
      },
    };
  } catch (err) {
    return {
      kind: "error",
      error: {
        email_id: messageId,
        message: err instanceof Error ? err.message : "Unknown error",
      },
    };
  }
}
