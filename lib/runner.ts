import { classificationSet } from "@/data/classification";
import { trajectorySet } from "@/data/trajectory";
import { judgeLabelledSet } from "@/data/judgeLabelled";
import { fixtureCalibration, fixtureRun, summariseCalibration } from "@/data/fixtures";
import { OpenRouterError, hasApiKey } from "./openrouter";
import {
  aggregateRows,
  clusterClassificationFailure,
  clusterTrajectoryFailure,
  exactMatch,
  llmJudge,
  trajectory,
} from "./scorers";
import { InvalidOutputError, agentPlan, classify, executePlan } from "./supportbot";
import type {
  CalibrationResult,
  CalibrationRow,
  DatasetId,
  EvalRow,
  RunResult,
} from "./types";

// ---------------------------------------------------------------------------
// Progress (in-memory; single dev process, no DB by design)
// ---------------------------------------------------------------------------

export interface Progress {
  done: number;
  total: number;
  finished: boolean;
}

const progress = new Map<string, Progress>();

export function startProgress(runId: string, total: number) {
  progress.set(runId, { done: 0, total, finished: false });
}
export function tickProgress(runId: string) {
  const p = progress.get(runId);
  if (p) p.done += 1;
}
export function finishProgress(runId: string) {
  const p = progress.get(runId);
  if (p) p.finished = true;
  // Keep it around briefly so a final poll can read it.
  setTimeout(() => progress.delete(runId), 60_000);
}
export function getProgress(runId: string): Progress | null {
  return progress.get(runId) ?? null;
}

// ---------------------------------------------------------------------------
// Concurrency pool
// ---------------------------------------------------------------------------

export const CONCURRENCY = 4;

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Row-level failures we tolerate; anything else aborts the run into Demo mode. */
function isTransportFailure(err: unknown): boolean {
  return err instanceof OpenRouterError;
}

// ---------------------------------------------------------------------------
// Suite runner
// ---------------------------------------------------------------------------

export interface RunSuiteArgs {
  datasetId: DatasetId;
  model: string;
  runId?: string;
}

export async function runSuite({ datasetId, model, runId }: RunSuiteArgs): Promise<RunResult> {
  const total = datasetId === "classification" ? classificationSet.length : trajectorySet.length;
  if (runId) startProgress(runId, total);

  if (!hasApiKey()) {
    if (runId) finishProgress(runId);
    return fixtureRun(datasetId, model, "no OPENROUTER_API_KEY set");
  }

  try {
    const rows =
      datasetId === "classification"
        ? await runClassification(model, runId)
        : await runTrajectory(model, runId);
    return { datasetId, model, rows, aggregate: aggregateRows(rows), demo: false };
  } catch (err) {
    // One bad call takes the whole run to cached fixtures rather than showing a
    // half-empty table on a projector.
    const reason =
      err instanceof OpenRouterError
        ? `API error: ${err.message.slice(0, 120)}`
        : `run failed: ${err instanceof Error ? err.message : String(err)}`;
    return fixtureRun(datasetId, model, reason);
  } finally {
    if (runId) finishProgress(runId);
  }
}

async function runClassification(model: string, runId?: string): Promise<EvalRow[]> {
  return pool(classificationSet, CONCURRENCY, async (c, i) => {
    try {
      const res = await classify(c.input, model);
      const score = exactMatch(res.classification, c.expected);
      if (runId) tickProgress(runId);
      return {
        index: i + 1,
        input: c.input,
        expected: JSON.stringify(c.expected),
        actual: JSON.stringify(res.classification),
        scores: [score],
        pass: score.pass,
        failureReason: score.pass
          ? null
          : clusterClassificationFailure(res.classification, c.expected, c.input),
        latencyMs: res.metrics.latencyMs,
        tokensIn: res.metrics.tokensIn,
        tokensOut: res.metrics.tokensOut,
        costUsd: res.metrics.costUsd,
      } satisfies EvalRow;
    } catch (err) {
      if (isTransportFailure(err)) throw err;
      if (err instanceof InvalidOutputError) {
        if (runId) tickProgress(runId);
        return {
          index: i + 1,
          input: c.input,
          expected: JSON.stringify(c.expected),
          actual: err.rawText.slice(0, 200),
          scores: [{ name: "exact_match", pass: false, reason: "invalid output format" }],
          pass: false,
          failureReason: "invalid output format",
          latencyMs: err.metrics.latencyMs,
          tokensIn: err.metrics.tokensIn,
          tokensOut: err.metrics.tokensOut,
          costUsd: err.metrics.costUsd,
        } satisfies EvalRow;
      }
      throw err;
    }
  });
}

async function runTrajectory(model: string, runId?: string): Promise<EvalRow[]> {
  return pool(trajectorySet, CONCURRENCY, async (c, i) => {
    try {
      const res = await agentPlan(c.input, model);
      const toolResults = await executePlan(res.plan);
      const called = toolResults.map((t) => t.tool);
      const score = trajectory(called, c.expectedTools);
      const subs = score.substitutions.map((s) => `${s.called} ~ ${s.expected}`).join(", ");
      if (runId) tickProgress(runId);
      return {
        index: i + 1,
        input: c.input,
        expected: c.expectedTools.length ? c.expectedTools.join(" -> ") : "(no tools)",
        actual: called.length ? called.join(" -> ") : "(no tools)",
        scores: [{ name: score.name, pass: score.pass, reason: score.reason }],
        tier: subs || null,
        pass: score.pass,
        failureReason: score.pass
          ? null
          : clusterTrajectoryFailure(called, c.expectedTools, score.reason),
        latencyMs: res.metrics.latencyMs,
        tokensIn: res.metrics.tokensIn,
        tokensOut: res.metrics.tokensOut,
        costUsd: res.metrics.costUsd,
      } satisfies EvalRow;
    } catch (err) {
      if (isTransportFailure(err)) throw err;
      if (err instanceof InvalidOutputError) {
        if (runId) tickProgress(runId);
        return {
          index: i + 1,
          input: c.input,
          expected: c.expectedTools.length ? c.expectedTools.join(" -> ") : "(no tools)",
          actual: err.rawText.slice(0, 200),
          scores: [{ name: "trajectory", pass: false, reason: "invalid output format" }],
          pass: false,
          failureReason: "invalid output format",
          latencyMs: err.metrics.latencyMs,
          tokensIn: err.metrics.tokensIn,
          tokensOut: err.metrics.tokensOut,
          costUsd: err.metrics.costUsd,
        } satisfies EvalRow;
      }
      throw err;
    }
  });
}

// ---------------------------------------------------------------------------
// Judge calibration
// ---------------------------------------------------------------------------

export interface CalibrateArgs {
  models: string[];
  mode: "single" | "jury";
  runId?: string;
}

export async function runCalibration({
  models,
  mode,
  runId,
}: CalibrateArgs): Promise<CalibrationResult> {
  if (runId) startProgress(runId, judgeLabelledSet.length);

  if (!hasApiKey()) {
    if (runId) finishProgress(runId);
    return fixtureCalibration(mode, models, "no OPENROUTER_API_KEY set");
  }

  const active = mode === "jury" ? models.slice(0, 3) : models.slice(0, 1);

  try {
    const rows = await pool(judgeLabelledSet, CONCURRENCY, async (c, i): Promise<CalibrationRow> => {
      const verdicts = await Promise.all(
        active.map((m) => llmJudge(c.input, c.botOutput, m)),
      );
      const votes = verdicts.map((v, k) => ({
        model: active[k],
        label: (v.score === 1 ? "pass" : "fail") as "pass" | "fail",
        reason: v.reason,
      }));
      const passes = votes.filter((v) => v.label === "pass").length;
      const judgeLabel: "pass" | "fail" =
        mode === "jury" ? (passes > votes.length / 2 ? "pass" : "fail") : votes[0].label;

      if (runId) tickProgress(runId);
      return {
        index: i + 1,
        input: c.input,
        botOutput: c.botOutput,
        humanLabel: c.humanLabel,
        judgeLabel,
        agree: judgeLabel === c.humanLabel,
        reason:
          mode === "jury"
            ? `majority ${passes}/${votes.length} -> ${judgeLabel}`
            : votes[0].reason,
        votes: mode === "jury" ? votes : undefined,
        latencyMs: Math.max(...verdicts.map((v) => v.latencyMs)),
        costUsd: verdicts.reduce((a, v) => a + v.costUsd, 0),
      };
    });

    return summariseCalibration(rows, mode, active, false);
  } catch (err) {
    const reason =
      err instanceof OpenRouterError
        ? `API error: ${err.message.slice(0, 120)}`
        : `run failed: ${err instanceof Error ? err.message : String(err)}`;
    return fixtureCalibration(mode, models, reason);
  } finally {
    if (runId) finishProgress(runId);
  }
}
