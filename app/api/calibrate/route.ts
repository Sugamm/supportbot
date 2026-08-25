import { NextResponse } from "next/server";
import { getProgress, runCalibration } from "@/lib/runner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  return NextResponse.json({ progress: getProgress(runId) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const mode = body.mode === "jury" ? "jury" : "single";
  const models: string[] = Array.isArray(body.models) && body.models.length
    ? body.models.map((m: unknown) => String(m))
    : ["anthropic/claude-3.5-sonnet"];
  const runId = body.runId ? String(body.runId) : undefined;

  const result = await runCalibration({ models, mode, runId });
  return NextResponse.json(result);
}
