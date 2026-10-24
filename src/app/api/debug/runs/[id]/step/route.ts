import { NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";
import { runStep } from "@/lib/pipeline-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The step loop self-limits to DEBUG_STEP_BUDGET_MS (default 40s). */
export const maxDuration = 60;

/**
 * POST /api/debug/runs/:id/step
 * Processes as many pending emails as fit in the time budget, then returns the
 * updated run state. The client calls this repeatedly until `status` is
 * terminal. Safe to call concurrently — items are claimed with SKIP LOCKED.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const run = await runStep(id);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    return NextResponse.json(run);
  } catch (error) {
    console.error("Pipeline step failed:", error);
    return NextResponse.json(
      {
        error: "Step failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
