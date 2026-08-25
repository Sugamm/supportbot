import { z } from "zod";
import { callModel, extractJson } from "./openrouter";
import type {
  Classification,
  EvalRow,
  FailureCluster,
  JudgeVerdict,
  RunAggregate,
  ScoreResult,
  Span,
} from "./types";
import { Tracer } from "./trace";

// ---------------------------------------------------------------------------
// 1. Exact match (classification)
// ---------------------------------------------------------------------------

/**
 * Compares the parsed JSON exactly: category AND severity must both match.
 *
 * Teaching case (shown in the Evals tab copy): an answer that is semantically
 * right but in the wrong shape -- {"category":"Billing","severity":"4"} or
 * "this looks like a billing issue" -- still FAILS. Exact match does not
 * negotiate. That strictness is the feature, and its cost is false failures.
 */
export function exactMatch(output: Classification | null, expected: Classification): ScoreResult {
  if (!output) {
    return { name: "exact_match", pass: false, reason: "invalid output format" };
  }
  const categoryOk = output.category === expected.category;
  const severityOk = output.severity === expected.severity;

  if (categoryOk && severityOk) return { name: "exact_match", pass: true, reason: "" };

  if (!categoryOk && !severityOk) {
    return {
      name: "exact_match",
      pass: false,
      reason: `category ${output.category} != ${expected.category}, severity ${output.severity} != ${expected.severity}`,
    };
  }
  if (!categoryOk) {
    return {
      name: "exact_match",
      pass: false,
      reason: `category ${output.category} != ${expected.category}`,
    };
  }
  return {
    name: "exact_match",
    pass: false,
    reason: `severity ${output.severity} != ${expected.severity}`,
  };
}

/**
 * Normalises a raw failure into a named cluster for the error-analysis view.
 * This is the "read three failures, name the bucket" step, made repeatable.
 */
export function clusterClassificationFailure(
  output: Classification | null,
  expected: Classification,
  input: string,
): string {
  if (!output) return "invalid output format";

  const categoryOk = output.category === expected.category;
  const severityOk = output.severity === expected.severity;

  if (!categoryOk) {
    const mentionsCompetitor = /competitor|switch|evaluating|cancel|leaving|churn/i.test(input);
    if (expected.category === "churn_risk" && mentionsCompetitor) {
      return "churn_risk read as another category";
    }
    if (expected.category === "out_of_scope") {
      return "out-of-scope request treated as answerable";
    }
    return `wrong category (expected ${expected.category})`;
  }

  if (!severityOk) {
    const angry = /useless|garbage|terrible|stupid|damn|hate|awful|ridiculous/i.test(input);
    if (output.severity > expected.severity && angry) {
      return "severity inflated by angry tone";
    }
    return output.severity > expected.severity ? "severity over-rated" : "severity under-rated";
  }

  return "unclassified failure";
}

// ---------------------------------------------------------------------------
// 2. LLM judge
// ---------------------------------------------------------------------------

/** Rubric is verbatim from the spec -- the judge is only as good as this text. */
export const JUDGE_RUBRIC = `Pass (1) only if the reply is (a) polite and non-defensive, (b) addresses the actual issue, (c) does not promise a refund unless the order is eligible, and (d) does not invent account data. If you cannot determine this from the text, return score 0 with reason "insufficient info" — do not guess.`;

export const JUDGE_SYSTEM_PROMPT = `You are grading a customer support reply.

${JUDGE_RUBRIC}

Return JSON only: {"score": 0 or 1, "reason": "one short sentence"}`;

const VerdictSchema = z.object({
  score: z.union([z.literal(0), z.literal(1)]),
  reason: z.string().default(""),
});

export interface JudgeResult extends JudgeVerdict {
  latencyMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export async function llmJudge(
  input: string,
  output: string,
  model: string,
  tracer?: Tracer,
): Promise<JudgeResult> {
  const run = async (span?: Span): Promise<JudgeResult> => {
    const res = await callModel({
      model,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        {
          role: "user",
          content: `CUSTOMER MESSAGE:\n${input}\n\nSUPPORTBOT REPLY:\n${output}`,
        },
      ],
      temperature: 0,
      responseFormatJSON: true,
      maxTokens: 150,
    });
    if (span) {
      span.model = res.model;
      span.tokensIn = res.tokensIn;
      span.tokensOut = res.tokensOut;
      span.costUsd = res.costUsd;
    }

    let parsed: JudgeVerdict;
    try {
      const j = VerdictSchema.safeParse(JSON.parse(extractJson(res.text)));
      // A judge that cannot answer in the required shape is not a pass. It is
      // a 0 with the rubric's own escape hatch.
      parsed = j.success
        ? { score: j.data.score, reason: j.data.reason || "no reason given" }
        : { score: 0, reason: "insufficient info" };
    } catch {
      parsed = { score: 0, reason: "insufficient info" };
    }

    if (span) span.attrs = { ...(span.attrs ?? {}), score: parsed.score, reason: parsed.reason };

    return {
      ...parsed,
      latencyMs: res.latencyMs,
      costUsd: res.costUsd,
      tokensIn: res.tokensIn,
      tokensOut: res.tokensOut,
      model: res.model,
    };
  };

  return tracer ? tracer.span(`judge.${model}`, "judge", run, { rubric: "supportbot v1" }) : run();
}

// ---------------------------------------------------------------------------
// 3. Trajectory (ordered tool list) + tiering
// ---------------------------------------------------------------------------

/**
 * Fenced unpredictability: we do not care WHICH tool name the model reached
 * for, as long as it is in the same tier. `search_orders` does the same job as
 * `lookup_order`, so a substitution passes and is labelled as such in the UI.
 */
export const equivalent: Record<string, string[]> = {
  lookup_order: ["search_orders", "get_order", "order_lookup"],
  escalate_to_human: ["transfer_to_agent", "handoff_to_human"],
};

export function isEquivalent(called: string, expected: string): boolean {
  if (called === expected) return true;
  return (equivalent[expected] ?? []).includes(called);
}

export interface TrajectoryResult extends ScoreResult {
  /** Substitutions accepted via the tiering list, for the UI badge. */
  substitutions: { expected: string; called: string }[];
}

export function trajectory(calledTools: string[], expectedTools: string[]): TrajectoryResult {
  const substitutions: { expected: string; called: string }[] = [];

  if (calledTools.length !== expectedTools.length) {
    const fmt = (a: string[]) => (a.length ? a.join(" -> ") : "(none)");
    return {
      name: "trajectory",
      pass: false,
      reason:
        calledTools.length > expectedTools.length
          ? `extra tool calls: got ${fmt(calledTools)}, expected ${fmt(expectedTools)}`
          : `missing tool calls: got ${fmt(calledTools)}, expected ${fmt(expectedTools)}`,
      substitutions,
    };
  }

  for (let i = 0; i < expectedTools.length; i += 1) {
    const called = calledTools[i];
    const want = expectedTools[i];
    if (called === want) continue;
    if (isEquivalent(called, want)) {
      substitutions.push({ expected: want, called });
      continue;
    }
    return {
      name: "trajectory",
      pass: false,
      reason: `step ${i + 1}: called ${called}, expected ${want}`,
      substitutions,
    };
  }

  return {
    name: "trajectory",
    pass: true,
    reason: "",
    substitutions,
  };
}

/** Cluster names for trajectory failures. */
export function clusterTrajectoryFailure(
  calledTools: string[],
  expectedTools: string[],
  reason: string,
): string {
  if (reason === "invalid output format") return "invalid output format";
  if (expectedTools.length === 0 && calledTools.length > 0) {
    return "acted on an out-of-scope request";
  }
  if (calledTools.includes("issue_refund") && !expectedTools.includes("issue_refund")) {
    return "refunded an ineligible order";
  }
  if (calledTools.length === 0 && expectedTools.length > 0) return "did nothing when action needed";
  if (calledTools.length > expectedTools.length) return "extra tool calls";
  if (calledTools.length < expectedTools.length) return "missing tool calls";
  return "wrong tool for the job";
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)];
}

/** Score %, cost, mean/p95 latency, and the failure-cluster map. */
export function aggregateRows(rows: EvalRow[]): RunAggregate {
  const total = rows.length;
  const passed = rows.filter((r) => r.pass).length;
  const latencies = rows.map((r) => r.latencyMs).sort((a, b) => a - b);
  const totalCostUsd = rows.reduce((acc, r) => acc + r.costUsd, 0);
  const meanLatencyMs = total ? Math.round(latencies.reduce((a, b) => a + b, 0) / total) : 0;

  const byReason = new Map<string, number[]>();
  for (const row of rows) {
    if (row.pass || !row.failureReason) continue;
    const list = byReason.get(row.failureReason) ?? [];
    list.push(row.index);
    byReason.set(row.failureReason, list);
  }
  const clusters: FailureCluster[] = [...byReason.entries()]
    .map(([reason, rowIndexes]) => ({ reason, count: rowIndexes.length, rowIndexes }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  return {
    total,
    passed,
    scorePct: total ? Math.round((passed / total) * 1000) / 10 : 0,
    totalCostUsd,
    meanLatencyMs,
    p95LatencyMs: percentile(latencies, 95),
    clusters,
  };
}
