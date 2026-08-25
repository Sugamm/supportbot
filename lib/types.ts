// Shared types for SupportBot + the eval harness.

export type Role = "system" | "user" | "assistant";

export interface ChatMessage {
  role: Role;
  content: string;
}

/** Everything a single model call costs us, surfaced in the UI rather than hidden. */
export interface CallMetrics {
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  model: string;
  /** true when the numbers came from lib/pricing.ts instead of OpenRouter's usage block. */
  costEstimated: boolean;
}

export interface ModelCallResult extends CallMetrics {
  text: string;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Tracing
// ---------------------------------------------------------------------------

export type SpanKind = "root" | "llm" | "tool" | "judge";

export interface Span {
  id: string;
  parentId: string | null;
  name: string;
  kind: SpanKind;
  startMs: number;
  endMs: number;
  latencyMs: number;
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  costUsd?: number;
  /** Small key/value detail shown under the span title. */
  attrs?: Record<string, string | number | boolean | null>;
  error?: string;
  children: Span[];
}

// ---------------------------------------------------------------------------
// SupportBot capabilities
// ---------------------------------------------------------------------------

export const CATEGORIES = [
  "billing",
  "technical",
  "churn_risk",
  "praise",
  "sales",
  "out_of_scope",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Classification {
  category: Category;
  severity: number;
}

export interface ToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentPlan {
  reasoning: string;
  tool_calls: ToolCall[];
  final_answer: string;
}

export interface ToolResult {
  tool: string;
  args: Record<string, unknown>;
  ok: boolean;
  result: unknown;
  latencyMs: number;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export interface ScoreResult {
  name: string;
  pass: boolean;
  /** Short, human-readable. Empty string when the row passed. */
  reason: string;
}

export interface EvalRow {
  index: number;
  input: string;
  expected: string;
  actual: string;
  scores: ScoreResult[];
  pass: boolean;
  /** Normalised cluster name used by the "group by failure reason" view. */
  failureReason: string | null;
  /** Set when the tiering list accepted a substituted tool name, e.g. "search_orders ~ lookup_order". */
  tier?: string | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface FailureCluster {
  reason: string;
  count: number;
  rowIndexes: number[];
}

export interface RunAggregate {
  total: number;
  passed: number;
  scorePct: number;
  totalCostUsd: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  clusters: FailureCluster[];
}

export interface RunResult {
  datasetId: DatasetId;
  model: string;
  rows: EvalRow[];
  aggregate: RunAggregate;
  /** true when the rows came from data/fixtures.ts instead of a live call. */
  demo: boolean;
  demoReason?: string;
}

export type DatasetId = "classification" | "trajectory";

// ---------------------------------------------------------------------------
// Judge calibration
// ---------------------------------------------------------------------------

export interface JudgeVerdict {
  score: 0 | 1;
  reason: string;
}

export interface CalibrationRow {
  index: number;
  input: string;
  botOutput: string;
  humanLabel: "pass" | "fail";
  judgeLabel: "pass" | "fail";
  agree: boolean;
  reason: string;
  /** Per-model votes, only populated in jury mode. */
  votes?: { model: string; label: "pass" | "fail"; reason: string }[];
  latencyMs: number;
  costUsd: number;
}

export interface CalibrationResult {
  mode: "single" | "jury";
  models: string[];
  rows: CalibrationRow[];
  agreementPct: number;
  agreeCount: number;
  total: number;
  /** Confusion counts against the human label. */
  confusion: { truePass: number; falsePass: number; trueFail: number; falseFail: number };
  totalCostUsd: number;
  demo: boolean;
  demoReason?: string;
}

// ---------------------------------------------------------------------------
// Playground / run-bot
// ---------------------------------------------------------------------------

export interface RunBotResponse {
  message: string;
  classification: Classification | null;
  classifyError: string | null;
  plan: AgentPlan | null;
  planError: string | null;
  toolResults: ToolResult[];
  answer: string;
  /** Populated by the "run same prompt twice" button. */
  answerB?: string;
  trace: Span;
  totals: { latencyMs: number; costUsd: number; tokensIn: number; tokensOut: number };
  demo: boolean;
  demoReason?: string;
}
