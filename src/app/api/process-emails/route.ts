import { NextRequest, NextResponse } from "next/server";
import {
  createGmailClient,
  getCategoryPromptText,
  listEmailIds,
  processOneEmail,
  resolveSearchQuery,
  type ProcessedEntry,
  type ProcessedError,
} from "@/lib/pipeline";
import { purgeExpiredIgnores } from "@/lib/ignore";

export const runtime = "nodejs";

/**
 * Cron entry point: runs the whole 2d window in one request.
 *
 * Long windows (e.g. `newer_than:7d`) can exceed Cloudflare's 100s origin
 * timeout here — that is what the chunked /api/debug/runs endpoints exist for.
 * This route stays single-shot because the nightly window is small.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const dryRun = searchParams.get("dry_run") === "true";
  const verbose = searchParams.get("verbose") === "true";
  const limit = parseInt(searchParams.get("limit") || "50", 10);
  const queryOverride = searchParams.get("query")?.trim() || null;

  // In dev, allow calling without CRON_SECRET for local testing.
  // In prod, also allow authenticated session users (debug page) — they bypass CRON_SECRET.
  const isDev = process.env.NODE_ENV !== "production";
  const authHeader = request.headers.get("authorization");
  const hasSessionCookie =
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token");
  const isAuthorized =
    isDev ||
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    !!hasSessionCookie;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (queryOverride && !hasSessionCookie && !isDev) {
    return NextResponse.json(
      { error: "Query override requires an authenticated session" },
      { status: 403 }
    );
  }

  try {
    // Retention cleanup is maintenance, not part of the Gmail run: do it first
    // so a Gmail/AI failure cannot leave tombstones alive past their window.
    let purgedIgnores = 0;
    if (!dryRun) {
      try {
        purgedIgnores = await purgeExpiredIgnores();
      } catch (cleanupError) {
        console.error("Ignored transaction cleanup error:", cleanupError);
      }
    }

    const categoryPromptText = await getCategoryPromptText();
    const gmail = createGmailClient();
    const searchQuery = resolveSearchQuery(queryOverride);
    const messageIds = await listEmailIds(gmail, searchQuery, Math.min(limit, 50));

    if (messageIds.length === 0) {
      return NextResponse.json({
        message: "No new bank alert emails found",
        processed: 0,
        dry_run: dryRun,
        ignored_purged: purgedIgnores,
        total_emails_found: 0,
        query_used: searchQuery,
        transactions: [],
        errors: undefined,
      });
    }

    let processed = 0;
    let skippedDuplicates = 0;
    let skippedJunk = 0;
    let skippedIgnored = 0;
    const entries: ProcessedEntry[] = [];
    const errors: ProcessedError[] = [];

    for (const messageId of messageIds) {
      const outcome = await processOneEmail({
        gmail,
        messageId,
        categoryPromptText,
        dryRun,
        includeAlreadyProcessed: verbose,
      });

      switch (outcome.kind) {
        case "duplicate_skipped":
          skippedDuplicates++;
          if (outcome.entry) entries.push(outcome.entry);
          break;
        case "ignored":
          skippedIgnored++;
          entries.push(outcome.entry);
          break;
        case "junk":
          skippedJunk++;
          entries.push(outcome.entry);
          break;
        case "processed":
          processed++;
          entries.push(outcome.entry);
          break;
        case "error":
          errors.push(outcome.error);
          break;
      }
    }

    return NextResponse.json({
      message: dryRun
        ? `[DRY RUN] Would process ${processed} emails`
        : `Processed ${processed} emails`,
      dry_run: dryRun,
      processed,
      skipped_duplicates: skippedDuplicates,
      skipped_junk: skippedJunk,
      skipped_ignored: skippedIgnored,
      ignored_purged: purgedIgnores,
      total_emails_found: messageIds.length,
      transactions: entries,
      errors: errors.length > 0 ? errors : undefined,
      query_used: searchQuery,
    });
  } catch (error) {
    console.error("Email processing error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process emails", details: message },
      { status: 500 }
    );
  }
}
