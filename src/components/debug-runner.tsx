"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { manuallyAddFromDebug } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CategorySelect } from "@/components/category-select";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  Play,
  Plus,
} from "lucide-react";

type EntryStatus =
  | "saved"
  | "duplicate_skipped"
  | "duplicate_flagged"
  | "junk_skipped"
  | "would_save"
  | "would_skip_junk"
  | "would_flag_duplicate";

interface ParsedTransaction {
  amount: number;
  merchant: string;
  date: string;
  category: string;
  subcategory: string | null;
  is_cc_payment: boolean;
  confidence_score: number;
}

interface ProcessedEntry {
  email_id: string;
  email_url?: string;
  from: string;
  subject: string;
  body_snippet?: string;
  parsed: ParsedTransaction;
  status: EntryStatus;
  reason?: string;
  duplicate_of?: { id: string; date: string; amount: number; merchant: string };
}

interface ProcessedError {
  email_id: string;
  from?: string;
  subject?: string;
  message: string;
}

type RunStatus = "pending" | "running" | "completed" | "failed" | "canceled";

interface RunResult {
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
  message: string;
  transactions: ProcessedEntry[];
  errors?: ProcessedError[];
  started_at: string;
  finished_at: string | null;
  run_error?: string | null;
}

const TERMINAL_STATUSES: RunStatus[] = ["completed", "failed", "canceled"];

function isTerminal(status: RunStatus) {
  return TERMINAL_STATUSES.includes(status);
}

const DEFAULT_QUERY =
  "is:unread newer_than:2d (from:alerts@hdfcbank.net OR from:alerts@hdfcbank.bank.in OR from:nachautoemailer@hdfcbank.bank.in OR from:noreply@idfcfirstbank.com OR from:delivery.idfcfirstbank.com)";

function formatINR(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

const STATUS_LABELS: Record<EntryStatus, string> = {
  saved: "Saved",
  duplicate_skipped: "Already processed",
  duplicate_flagged: "Saved (flagged duplicate)",
  junk_skipped: "Skipped as junk",
  would_save: "Would save",
  would_skip_junk: "Would skip as junk",
  would_flag_duplicate: "Would save (flagged duplicate)",
};

const STATUS_VARIANTS: Record<
  EntryStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  saved: "default",
  duplicate_skipped: "secondary",
  duplicate_flagged: "outline",
  junk_skipped: "destructive",
  would_save: "default",
  would_skip_junk: "destructive",
  would_flag_duplicate: "outline",
};

export function DebugRunner({
  categories,
}: {
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
}) {
  const [dryRun, setDryRun] = useState(true);
  const [query, setQuery] = useState(DEFAULT_QUERY);
  const [limit, setLimit] = useState(50);
  const [running, setRunning] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [resumable, setResumable] = useState<RunResult | null>(null);
  const cancelRequested = useRef(false);

  // A run keeps its state in Postgres, so a closed tab does not lose progress.
  // Offer to pick up where an interrupted run left off.
  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const res = await fetch("/api/debug/runs?scope=active");
        if (!res.ok) return;
        const data = await res.json();
        if (!ignore && data?.run) setResumable(data.run as RunResult);
      } catch {
        // Resume is best-effort; a failed probe must not block the page.
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  async function readJson(res: Response) {
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        data?.details || data?.error || `Request failed with ${res.status}`
      );
    }
    return data;
  }

  /**
   * Drive the run one short request at a time. Each step processes as many
   * emails as fit in ~40s, so no single request approaches Cloudflare's 100s
   * origin timeout even for a 7d window.
   */
  async function stepLoop(runId: string) {
    let stalledSteps = 0;
    let previousRemaining = -1;

    while (true) {
      if (cancelRequested.current) {
        const res = await fetch(`/api/debug/runs/${runId}/cancel`, {
          method: "POST",
        });
        const canceled = (await readJson(res)) as RunResult;
        setResult(canceled);
        return;
      }

      const res = await fetch(`/api/debug/runs/${runId}/step`, {
        method: "POST",
      });
      const state = (await readJson(res)) as RunResult;
      setResult(state);

      if (isTerminal(state.status)) return;

      if (state.remaining === previousRemaining) {
        stalledSteps++;
        if (stalledSteps >= 3) {
          throw new Error(
            "Run stalled — three consecutive steps made no progress."
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        stalledSteps = 0;
        previousRemaining = state.remaining;
      }
    }
  }

  async function runPipeline(runId?: string) {
    cancelRequested.current = false;
    setCancelling(false);
    setRunning(true);
    setRunError(null);

    try {
      let id = runId;

      if (!id) {
        setResult(null);
        setResumable(null);
        const res = await fetch("/api/debug/runs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dry_run: dryRun,
            query:
              query.trim() && query.trim() !== DEFAULT_QUERY
                ? query.trim()
                : undefined,
            limit,
          }),
        });
        const started = (await readJson(res)) as RunResult;
        id = started.run_id;
        setResult(started);
        if (isTerminal(started.status)) return;
      }

      await stepLoop(id);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setRunning(false);
      setCancelling(false);
    }
  }

  function requestCancel() {
    cancelRequested.current = true;
    setCancelling(true);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Run controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={dryRun}
                onCheckedChange={(checked) => setDryRun(checked === true)}
              />
              <span>Dry run (no DB writes, emails stay unread)</span>
            </label>
            <div className="flex items-center gap-2">
              <Label htmlFor="debug-limit" className="text-sm">
                Limit
              </Label>
              <Input
                id="debug-limit"
                type="number"
                min={1}
                max={500}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10) || 50)}
                className="w-20"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="debug-query" className="text-sm">
              Gmail search query
            </Label>
            <Input
              id="debug-query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={DEFAULT_QUERY}
              className="font-mono text-xs"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Edit to widen the search (e.g. change{" "}
                <code>newer_than:2d</code> to <code>newer_than:7d</code>).
              </span>
              {query !== DEFAULT_QUERY && (
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={() => setQuery(DEFAULT_QUERY)}
                >
                  Reset to default
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => runPipeline()} disabled={running}>
              {running ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              {running ? "Running…" : "Run pipeline"}
            </Button>
            {running && (
              <Button
                variant="outline"
                onClick={requestCancel}
                disabled={cancelling}
              >
                {cancelling ? "Canceling…" : "Cancel"}
              </Button>
            )}
            {!dryRun && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <AlertTriangle className="h-3 w-3" />
                Real run: emails will be marked read and transactions saved.
              </span>
            )}
          </div>

          {result && !isTerminal(result.status) && (
            <div className="space-y-1">
              <div className="h-2 overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      result.items_total > 0
                        ? Math.round(
                            (result.items_completed / result.items_total) * 100
                          )
                        : 0
                    }%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {result.items_completed}/{result.items_total} emails processed
                {result.remaining > 0
                  ? ` · ${result.remaining} remaining`
                  : ""}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {resumable && !running && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <span>
              An earlier run was interrupted at {resumable.items_completed}/
              {resumable.items_total} emails.
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => runPipeline(resumable.run_id)}
              >
                Resume run
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setResumable(null)}
              >
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {runError && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Pipeline failed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-auto text-xs whitespace-pre-wrap text-destructive">
              {runError}
            </pre>
          </CardContent>
        </Card>
      )}

      {result && <ResultsView result={result} categories={categories} />}
    </div>
  );
}

function ResultsView({
  result,
  categories,
}: {
  result: RunResult;
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">{result.message}</p>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Stat label="Emails found" value={result.total_emails_found} />
            <Stat label="Processed" value={result.processed} />
            <Stat
              label="Skipped (dup)"
              value={result.skipped_duplicates}
            />
            <Stat label="Skipped (junk)" value={result.skipped_junk} />
          </div>
          {result.status === "completed" && result.total_emails_found === 0 && (
            <div className="rounded border border-amber-500/40 bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Gmail returned <strong>0 emails</strong> for this query. If
              you&apos;re missing an expense, this is the most likely cause —
              widen the date range or check that the sender is in the query.
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Query used
            </summary>
            <pre className="mt-1 overflow-auto rounded bg-muted p-2 font-mono whitespace-pre-wrap">
              {result.query_used}
            </pre>
          </details>
        </CardContent>
      </Card>

      {result.errors && result.errors.length > 0 && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Errors ({result.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {result.errors.map((err) => (
              <div
                key={err.email_id}
                className="rounded border border-destructive/30 bg-destructive/5 p-3 text-xs"
              >
                <div className="font-mono text-muted-foreground">
                  email_id: {err.email_id}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{err.message}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Emails ({result.transactions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {result.transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No per-email details to show.
            </p>
          ) : (
            result.transactions.map((entry) => (
              <EntryCard
                key={entry.email_id}
                entry={entry}
                categories={categories}
              />
            ))
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border bg-muted/30 p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function EntryCard({
  entry,
  categories,
}: {
  entry: ProcessedEntry;
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);

  const canAdd =
    entry.status === "would_skip_junk" ||
    entry.status === "would_save" ||
    entry.status === "would_flag_duplicate" ||
    entry.status === "junk_skipped";

  return (
    <div className="rounded border" data-testid="debug-entry">
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/30"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
        )}
        <div className="flex-1 space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANTS[entry.status]}>
              {STATUS_LABELS[entry.status]}
            </Badge>
            {entry.parsed.amount > 0 && (
              <span className="text-sm font-medium">
                {formatINR(entry.parsed.amount)}
              </span>
            )}
            {entry.parsed.merchant && (
              <span className="text-sm">{entry.parsed.merchant}</span>
            )}
            <span className="text-xs text-muted-foreground">
              conf {entry.parsed.confidence_score.toFixed(2)}
            </span>
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {entry.subject || "(no subject)"} — {entry.from || "(unknown sender)"}
          </div>
          {entry.reason && (
            <div className="text-xs text-amber-700 dark:text-amber-300">
              {entry.reason}
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="space-y-3 border-t bg-muted/10 p-3 text-sm">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="From" value={entry.from || "—"} />
            <Field label="Subject" value={entry.subject || "—"} />
            <Field label="Email ID" value={entry.email_id} mono />
            {entry.email_url && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground">
                  Gmail link
                </div>
                <a
                  href={entry.email_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary underline"
                >
                  Open in Gmail
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              AI output
            </div>
            <pre className="overflow-auto rounded bg-background p-2 text-xs font-mono whitespace-pre-wrap">
              {JSON.stringify(entry.parsed, null, 2)}
            </pre>
          </div>

          {entry.duplicate_of && (
            <div className="rounded border border-amber-500/40 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
              Matched existing transaction <code>{entry.duplicate_of.id}</code>:{" "}
              {formatINR(entry.duplicate_of.amount)} at{" "}
              {entry.duplicate_of.merchant} on{" "}
              {new Date(entry.duplicate_of.date).toLocaleDateString("en-IN")}
            </div>
          )}

          {entry.body_snippet && (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                Email body (snippet sent to AI)
              </div>
              <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-xs whitespace-pre-wrap">
                {entry.body_snippet}
              </pre>
            </div>
          )}

          {canAdd && !adding && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setAdding(true)}
            >
              <Plus className="mr-1 h-3 w-3" />
              Add as expense
            </Button>
          )}

          {adding && (
            <ManualAddForm
              entry={entry}
              categories={categories}
              onCancel={() => setAdding(false)}
              onSaved={() => {
                setAdding(false);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div
        className={`text-xs break-all ${mono ? "font-mono" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function ManualAddForm({
  entry,
  categories,
  onCancel,
  onSaved,
}: {
  entry: ProcessedEntry;
  categories: { name: string; subcategories: { id: string; name: string }[] }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(
    entry.parsed.amount > 0 ? String(entry.parsed.amount) : ""
  );
  const [merchant, setMerchant] = useState(entry.parsed.merchant || "");
  const initialDate = (() => {
    try {
      const d = entry.parsed.date ? new Date(entry.parsed.date) : new Date();
      if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
      return d.toISOString().slice(0, 10);
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  })();
  const [date, setDate] = useState(initialDate);
  const [category, setCategory] = useState(entry.parsed.category || "Other");
  const [subcategory, setSubcategory] = useState<string | null>(
    entry.parsed.subcategory
  );
  const [isCcPayment, setIsCcPayment] = useState(entry.parsed.is_cc_payment);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsedAmount = parseFloat(amount);
    if (!parsedAmount || parsedAmount <= 0) {
      setError("Amount must be a positive number");
      return;
    }
    if (!merchant.trim()) {
      setError("Merchant is required");
      return;
    }
    startTransition(async () => {
      try {
        await manuallyAddFromDebug({
          amount: parsedAmount,
          merchant: merchant.trim(),
          date,
          category,
          subcategory,
          is_cc_payment: isCcPayment,
          email_message_id: entry.email_id,
        });
        setSavedOk(true);
        setTimeout(onSaved, 800);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      }
    });
  }

  if (savedOk) {
    return (
      <div className="rounded border border-green-500/40 bg-green-50 p-3 text-xs text-green-900 dark:bg-green-950/40 dark:text-green-200">
        Saved as expense.
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded border bg-background p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`amount-${entry.email_id}`} className="text-xs">
            Amount (INR)
          </Label>
          <Input
            id={`amount-${entry.email_id}`}
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`date-${entry.email_id}`} className="text-xs">
            Date
          </Label>
          <Input
            id={`date-${entry.email_id}`}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`merchant-${entry.email_id}`} className="text-xs">
          Merchant
        </Label>
        <Input
          id={`merchant-${entry.email_id}`}
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Category</Label>
        <CategorySelect
          value={category}
          onChange={setCategory}
          subcategory={subcategory}
          onSubcategoryChange={setSubcategory}
          categories={categories.map((c) => ({
            name: c.name,
            subcategories: c.subcategories.map((s) => s.name),
          }))}
          className="h-9 w-full"
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={isCcPayment}
          onCheckedChange={(checked) => setIsCcPayment(checked === true)}
        />
        <span>Credit card bill payment (excluded from spend totals)</span>
      </label>
      {error && (
        <div className="rounded border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Saving…" : "Save expense"}
        </Button>
      </div>
    </form>
  );
}
