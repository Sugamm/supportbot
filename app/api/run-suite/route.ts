import { NextResponse } from "next/server";
import { getProgress, runSuite } from "@/lib/runner";
import type { DatasetId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Polled by the client for the progress bar while a suite is running. */
export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  return NextResponse.json({ progress: getProgress(runId) });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const datasetId = (body.datasetId === "trajectory" ? "trajectory" : "classification") as DatasetId;
  const model = String(body.model || "openai/gpt-4o-mini");
  const runId = body.runId ? String(body.runId) : undefined;

  const result = await runSuite({ datasetId, model, runId });
  return NextResponse.json(result);
}
