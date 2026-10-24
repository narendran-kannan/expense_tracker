import { NextRequest, NextResponse } from "next/server";
import { hasSessionCookie } from "@/lib/session-cookie";
import { cancelRun } from "@/lib/pipeline-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/debug/runs/:id/cancel — stops the run, keeping finished results. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!hasSessionCookie(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const run = await cancelRun(id);
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(run);
}
