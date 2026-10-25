import { prisma } from "@/lib/prisma";
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

/**
 * DB-backed, chunked execution of the email pipeline for the /debug page.
 *
 * A run reserves the Gmail message ids up front, then each `/step` request
 * processes emails until its wall-clock budget is spent. That keeps every HTTP
 * request far below Cloudflare's 100s origin timeout, no matter how wide the
 * Gmail window (2d, 7d, …) or how slow the model is.
 */

export const DEFAULT_STEP_BUDGET_MS = 40_000;
export const RUN_RETENTION_DAYS = 7;
/** A request that dies mid-email leaves a claim behind; reclaim after this. */
const STALE_LOCK_MS = 2 * 60_000;
export const MAX_EMAILS_PER_RUN = 500;
const MAX_ATTEMPTS = 3;

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export interface RunState {
  run_id: string;
  status: RunStatus;
  dry_run: boolean;
  query_used: string;
  limit: number;
  total_emails_found: number;
  items_total: number;
  items_completed: number;
  remaining: number;
  processed: number;
  skipped_duplicates: number;
  skipped_junk: number;
  skipped_ignored: number;
  message: string;
  transactions: ProcessedEntry[];
  errors?: ProcessedError[];
  started_at: string;
  finished_at: string | null;
  run_error?: string | null;
}

export function stepBudgetMs(): number {
  const configured = Number(process.env.DEBUG_STEP_BUDGET_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_STEP_BUDGET_MS;
}

export function clampLimit(value: number | undefined): number {
  const parsed = Math.trunc(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(Math.max(parsed, 1), MAX_EMAILS_PER_RUN);
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "canceled";
}

function toJson(value: unknown): object {
  return JSON.parse(JSON.stringify(value)) as object;
}

type RunWithItems = {
  id: string;
  status: string;
  dry_run: boolean;
  query: string;
  limit: number;
  total_found: number;
  error: string | null;
  started_at: Date;
  finished_at: Date | null;
  items: Array<{
    status: string;
    result: unknown;
    error: string | null;
  }>;
};

function summarize(run: RunWithItems): RunState {
  const transactions: ProcessedEntry[] = [];
  const errors: ProcessedError[] = [];
  let processed = 0;
  let skippedDuplicates = 0;
  let skippedJunk = 0;
  let skippedIgnored = 0;
  let itemsCompleted = 0;

  for (const item of run.items) {
    const entry = item.result as ProcessedEntry | null;
    if (entry && item.status === "done") {
      switch (entry.status) {
        case "duplicate_skipped":
          skippedDuplicates++;
          break;
        case "ignored_skipped":
          skippedIgnored++;
          break;
        case "junk_skipped":
        case "would_skip_junk":
          skippedJunk++;
          break;
        default:
          processed++;
      }
      transactions.push(entry);
    }
    if (item.status === "error") {
      itemsCompleted++;
      errors.push(
        (item.result as ProcessedError | null) ?? {
          email_id: "unknown",
          message: item.error ?? "Unknown error",
        }
      );
    } else if (item.status === "done") {
      itemsCompleted++;
    }
  }

  const remaining = run.items.filter(
    (item) => item.status === "pending" || item.status === "processing"
  ).length;
  const status = run.status as RunStatus;

  let message: string;
  switch (status) {
    case "pending":
      message = `Reserved ${run.total_found} emails — starting…`;
      break;
    case "running":
      message = `Processing ${itemsCompleted}/${run.items.length} emails…`;
      break;
    case "canceled":
      message = `Canceled after ${itemsCompleted} of ${run.items.length} emails`;
      break;
    case "failed":
      message = `Run failed: ${run.error ?? "Unknown error"}`;
      break;
    default:
      if (run.total_found === 0) {
        message = "No new bank alert emails found";
      } else {
        message = run.dry_run
          ? `[DRY RUN] Would process ${processed} emails`
          : `Processed ${processed} emails`;
      }
  }

  return {
    run_id: run.id,
    status,
    dry_run: run.dry_run,
    query_used: run.query,
    limit: run.limit,
    total_emails_found: run.total_found,
    items_total: run.items.length,
    items_completed: itemsCompleted,
    remaining,
    processed,
    skipped_duplicates: skippedDuplicates,
    skipped_junk: skippedJunk,
    skipped_ignored: skippedIgnored,
    message,
    transactions,
    errors: errors.length > 0 ? errors : undefined,
    started_at: run.started_at.toISOString(),
    finished_at: run.finished_at?.toISOString() ?? null,
    run_error: run.error,
  };
}

export async function getRunState(runId: string): Promise<RunState | null> {
  const run = await prisma.pipelineRun.findUnique({
    where: { id: runId },
    include: { items: { orderBy: { created_at: "asc" } } },
  });
  return run ? summarize(run) : null;
}

/** Latest run that is still pending/running, for "resume" on page load. */
export async function getActiveRunState(): Promise<RunState | null> {
  const run = await prisma.pipelineRun.findFirst({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { started_at: "desc" },
    include: { items: { orderBy: { created_at: "asc" } } },
  });
  return run ? summarize(run) : null;
}

/** Latest run regardless of status (used to show the previous result). */
export async function getLatestRunState(): Promise<RunState | null> {
  const run = await prisma.pipelineRun.findFirst({
    orderBy: { started_at: "desc" },
    include: { items: { orderBy: { created_at: "asc" } } },
  });
  return run ? summarize(run) : null;
}

async function pruneOldRuns(): Promise<void> {
  const cutoff = new Date(
    Date.now() - RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  await prisma.pipelineRun.deleteMany({
    where: {
      started_at: { lt: cutoff },
      status: { in: ["completed", "failed", "canceled"] },
    },
  });
}

/**
 * A single user drives one run at a time. Starting a new run cancels any
 * still-active one so two drivers never work through the same Gmail window.
 */
async function cancelActiveRuns(): Promise<void> {
  const active = await prisma.pipelineRun.findMany({
    where: { status: { in: ["pending", "running"] } },
    select: { id: true },
  });
  if (active.length === 0) return;

  const ids = active.map((run) => run.id);
  await prisma.pipelineItem.updateMany({
    where: {
      run_id: { in: ids },
      status: { in: ["pending", "processing"] },
    },
    data: { status: "canceled", locked_at: null },
  });
  await prisma.pipelineRun.updateMany({
    where: { id: { in: ids } },
    data: { status: "canceled", finished_at: new Date() },
  });
}

/**
 * Reserve a run: one Gmail search, one row per message id. Fast — no AI calls.
 */
export async function createRun({
  dryRun,
  query,
  limit,
}: {
  dryRun: boolean;
  query?: string | null;
  limit?: number;
}): Promise<RunState> {
  const searchQuery = resolveSearchQuery(query);
  const runLimit = clampLimit(limit);

  const gmail = createGmailClient();
  const messageIds = await listEmailIds(gmail, searchQuery, runLimit);

  await pruneOldRuns();
  await purgeExpiredIgnores();
  await cancelActiveRuns();

  const run = await prisma.pipelineRun.create({
    data: {
      status: messageIds.length === 0 ? "completed" : "pending",
      dry_run: dryRun,
      query: searchQuery,
      limit: runLimit,
      total_found: messageIds.length,
      driver: "debug",
      finished_at: messageIds.length === 0 ? new Date() : null,
      items: {
        create: messageIds.map((emailMessageId) => ({
          email_message_id: emailMessageId,
        })),
      },
    },
    include: { items: { orderBy: { created_at: "asc" } } },
  });

  return summarize(run);
}

/**
 * Atomically claim the oldest pending item for this run. SKIP LOCKED means two
 * concurrent step requests (two tabs, or a retried request) never race.
 */
async function claimNextItem(
  runId: string
): Promise<{ id: string; email_message_id: string } | null> {
  const rows = await prisma.$queryRaw<
    Array<{ id: string; email_message_id: string }>
  >`
    UPDATE "PipelineItem"
    SET status = 'processing', locked_at = now(), attempts = attempts + 1
    WHERE id = (
      SELECT id FROM "PipelineItem"
      WHERE run_id = ${runId}
        AND status = 'pending'
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id, email_message_id
  `;
  return rows[0] ?? null;
}

async function reclaimStaleLocks(runId: string): Promise<void> {
  await prisma.pipelineItem.updateMany({
    where: {
      run_id: runId,
      status: "processing",
      locked_at: { lt: new Date(Date.now() - STALE_LOCK_MS) },
    },
    data: { status: "pending", locked_at: null },
  });
}

/**
 * Process emails for this run until the time budget is exhausted, then return
 * the current state. Idempotent: calling it again simply resumes.
 */
export async function runStep(runId: string): Promise<RunState | null> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) return null;
  if (isTerminal(run.status)) return getRunState(runId);

  await prisma.pipelineRun.update({
    where: { id: runId },
    data: { status: "running", error: null },
  });

  try {
    assertModelsConfigured();
    await reclaimStaleLocks(runId);

    const categoryPromptText = await getCategoryPromptText();
    const gmail = createGmailClient();
    const deadline = Date.now() + stepBudgetMs();

    while (Date.now() < deadline) {
      const claimed = await claimNextItem(runId);
      if (!claimed) break;

      const outcome = await processOneEmail({
        gmail,
        messageId: claimed.email_message_id,
        categoryPromptText,
        dryRun: run.dry_run,
        includeAlreadyProcessed: true,
      });

      if (outcome.kind === "error") {
        await prisma.pipelineItem.update({
          where: { id: claimed.id },
          data: {
            status: "error",
            error: outcome.error.message,
            result: toJson(outcome.error),
            locked_at: null,
          },
        });
      } else {
        await prisma.pipelineItem.update({
          where: { id: claimed.id },
          data: {
            status: "done",
            error: null,
            result: outcome.entry ? toJson(outcome.entry) : undefined,
            locked_at: null,
          },
        });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "failed", error: message, finished_at: new Date() },
    });
    return getRunState(runId);
  }

  // Items that keep failing to even start (e.g. repeated crashes) must not
  // block the run from completing.
  await prisma.pipelineItem.updateMany({
    where: { run_id: runId, status: "pending", attempts: { gte: MAX_ATTEMPTS } },
    data: {
      status: "error",
      error: "Exceeded retry limit without completing",
      locked_at: null,
    },
  });

  const remaining = await prisma.pipelineItem.count({
    where: { run_id: runId, status: { in: ["pending", "processing"] } },
  });

  if (remaining === 0) {
    // A concurrent cancel may have set a terminal status while this step was
    // still finishing its last email — never overwrite that.
    const current = await prisma.pipelineRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (current && !isTerminal(current.status)) {
      await prisma.pipelineRun.update({
        where: { id: runId },
        data: { status: "completed", finished_at: new Date() },
      });
    }
  }

  return getRunState(runId);
}

export async function cancelRun(runId: string): Promise<RunState | null> {
  const run = await prisma.pipelineRun.findUnique({ where: { id: runId } });
  if (!run) return null;

  if (!isTerminal(run.status)) {
    await prisma.pipelineItem.updateMany({
      where: { run_id: runId, status: { in: ["pending", "processing"] } },
      data: { status: "canceled", locked_at: null },
    });
    await prisma.pipelineRun.update({
      where: { id: runId },
      data: { status: "canceled", finished_at: new Date() },
    });
  }

  return getRunState(runId);
}

function assertModelsConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Add it to .env (see .env.example)."
    );
  }
}
