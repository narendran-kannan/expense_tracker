import { NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";
import {
  createRun,
  getActiveRunState,
  getLatestRunState,
  clampLimit,
} from "@/lib/pipeline-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/**
 * POST /api/debug/runs
 * Body: { dry_run?: boolean, query?: string, limit?: number }
 *
 * Reserves the run (Gmail search + one row per email) and returns immediately.
 * The client then drives `POST /api/debug/runs/:id/step` in a loop.
 */
export async function POST(request: NextRequest) {
  if (!hasSessionCookie(request)) return unauthorized();

  let body: { dry_run?: unknown; query?: unknown; limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // Empty body is fine: defaults apply.
  }

  const dryRun = body.dry_run !== false;
  const query =
    typeof body.query === "string" && body.query.trim()
      ? body.query.trim()
      : null;
  const limit = clampLimit(
    typeof body.limit === "number" ? body.limit : Number(body.limit)
  );

  try {
    const run = await createRun({ dryRun, query, limit: limit });
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    console.error("Failed to create pipeline run:", error);
    return NextResponse.json(
      {
        error: "Failed to start run",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/debug/runs?scope=active|latest
 * Used by the debug page on mount to offer resuming an interrupted run.
 */
export async function GET(request: NextRequest) {
  if (!hasSessionCookie(request)) return unauthorized();

  const scope = request.nextUrl.searchParams.get("scope") ?? "active";

  try {
    const run =
      scope === "latest" ? await getLatestRunState() : await getActiveRunState();
    return NextResponse.json({ run });
  } catch (error) {
    console.error("Failed to read pipeline run:", error);
    return NextResponse.json(
      {
        error: "Failed to read run",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
