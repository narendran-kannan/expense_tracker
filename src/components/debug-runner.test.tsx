import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DebugRunner } from "@/components/debug-runner";

vi.mock("@/app/actions", () => ({
  manuallyAddFromDebug: vi.fn(),
  createCategory: vi.fn(),
}));

const categories = [
  { name: "Food", subcategories: [{ id: "1", name: "Restaurants" }] },
  { name: "Other", subcategories: [] },
];

const ENTRY = {
  email_id: "msg-1",
  email_url: "https://mail.google.com/mail/u/0/#inbox/msg-1",
  from: "alerts@hdfcbank.net",
  subject: "Alert: Debit",
  body_snippet: "Rs. 250 spent at SWIGGY",
  parsed: {
    amount: 250,
    merchant: "Swiggy",
    date: "2026-04-10T00:00:00.000Z",
    category: "Food",
    subcategory: "Restaurants",
    is_cc_payment: false,
    confidence_score: 0.92,
  },
  status: "would_save",
};

function runState(overrides: Record<string, unknown> = {}) {
  return {
    run_id: "run-1",
    status: "running",
    dry_run: true,
    query_used: "is:unread newer_than:2d",
    limit: 50,
    total_emails_found: 1,
    items_total: 1,
    items_completed: 0,
    remaining: 1,
    processed: 0,
    skipped_duplicates: 0,
    skipped_junk: 0,
    message: "Processing 0/1 emails…",
    transactions: [],
    started_at: "2026-10-24T10:00:00.000Z",
    finished_at: null,
    ...overrides,
  };
}

const STARTED = runState();
const COMPLETED = runState({
  status: "completed",
  items_completed: 1,
  remaining: 0,
  processed: 1,
  message: "[DRY RUN] Would process 1 emails",
  transactions: [ENTRY],
  finished_at: "2026-10-24T10:00:10.000Z",
});

interface RouteMap {
  active?: unknown;
  create?: unknown;
  createStatus?: number;
  step?: unknown;
  stepStatus?: number;
  createErrorBody?: unknown;
}

function mockFetch(routes: RouteMap) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("scope=active")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ run: routes.active ?? null }),
      };
    }

    if (/\/api\/debug\/runs\/[^/]+\/step/.test(url)) {
      return {
        ok: (routes.stepStatus ?? 200) < 400,
        status: routes.stepStatus ?? 200,
        json: async () => routes.step ?? COMPLETED,
      };
    }

    if (/\/api\/debug\/runs$/.test(url)) {
      const status = routes.createStatus ?? 201;
      return {
        ok: status < 400,
        status,
        json: async () =>
          status < 400
            ? routes.create ?? STARTED
            : routes.createErrorBody ?? {
                error: "Failed",
                details: "Gmail auth failed",
              },
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function runPipeline() {
  const user = userEvent.setup();
  render(<DebugRunner categories={categories} />);
  await user.click(screen.getByRole("button", { name: /run pipeline/i }));
  return user;
}

describe("DebugRunner", () => {
  it("starts a run with dry_run/limit/query, then polls step until terminal", async () => {
    const fetchMock = mockFetch({ create: STARTED, step: COMPLETED });
    vi.stubGlobal("fetch", fetchMock);

    await runPipeline();

    expect(
      await screen.findByText(/would process 1 emails/i)
    ).toBeInTheDocument();

    const calls = fetchMock.mock.calls as unknown as Array<
      [string, RequestInit?]
    >;
    const createCall = calls.find(
      ([url, init]) =>
        /\/api\/debug\/runs$/.test(url) && init?.method === "POST"
    );
    expect(createCall).toBeDefined();
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({
      dry_run: true,
      limit: 50,
      query: undefined,
    });

    const stepCalls = calls.filter(([url]) =>
      /\/api\/debug\/runs\/[^/]+\/step/.test(url)
    );
    expect(stepCalls).toHaveLength(1);
  });

  it("sends a custom Gmail query when the user edits it", async () => {
    const fetchMock = mockFetch({ create: STARTED, step: COMPLETED });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<DebugRunner categories={categories} />);

    const queryInput = screen.getByLabelText(/gmail search query/i);
    await user.clear(queryInput);
    await user.type(queryInput, "from:custom@bank.com newer_than:30d");
    await user.click(screen.getByRole("button", { name: /run pipeline/i }));

    await waitFor(() => {
      expect(
        (fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>).find(
          ([url, init]) =>
            /\/api\/debug\/runs$/.test(url) && init?.method === "POST"
        )
      ).toBeDefined();
    });

    const createCall = (
      fetchMock.mock.calls as unknown as Array<[string, RequestInit?]>
    ).find(
      ([url, init]) =>
        /\/api\/debug\/runs$/.test(url) && init?.method === "POST"
    );
    expect(JSON.parse(String(createCall?.[1]?.body)).query).toBe(
      "from:custom@bank.com newer_than:30d"
    );
  });

  it("renders summary stats and entries from the final run state", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ create: STARTED, step: COMPLETED })
    );

    await runPipeline();

    expect(await screen.findByText("Swiggy")).toBeInTheDocument();
    expect(screen.getByText(/would save/i)).toBeInTheDocument();
    expect(screen.getByText(/emails found/i)).toBeInTheDocument();
  });

  it("shows a prominent warning when Gmail returns 0 emails", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        create: runState({
          status: "completed",
          total_emails_found: 0,
          items_total: 0,
          items_completed: 0,
          remaining: 0,
          message: "No new bank alert emails found",
        }),
      })
    );

    await runPipeline();

    expect(await screen.findByText(/gmail returned/i)).toBeInTheDocument();
  });

  it("displays pipeline error when the run cannot be created", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ createStatus: 500 })
    );

    await runPipeline();

    expect(await screen.findByText(/pipeline failed/i)).toBeInTheDocument();
    expect(screen.getByText(/gmail auth failed/i)).toBeInTheDocument();
  });

  it("offers to resume an interrupted run without starting a new one", async () => {
    const fetchMock = mockFetch({
      active: runState({ items_completed: 1, items_total: 3, remaining: 2 }),
      step: COMPLETED,
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    render(<DebugRunner categories={categories} />);

    expect(
      await screen.findByText(/earlier run was interrupted/i)
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /resume run/i }));

    await waitFor(() => {
      const calls = fetchMock.mock.calls as unknown as Array<
        [string, RequestInit?]
      >;
      expect(
        calls.some(([url]) => /\/api\/debug\/runs\/run-1\/step/.test(url))
      ).toBe(true);
      expect(
        calls.some(
          ([url, init]) =>
            /\/api\/debug\/runs$/.test(url) && init?.method === "POST"
        )
      ).toBe(false);
    });
  });
});
