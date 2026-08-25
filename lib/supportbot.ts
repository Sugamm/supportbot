// SupportBot: the system under test.
//
// Three capabilities, each one OpenRouter call returning strict JSON (except
// `answer`, which is free text). Nothing here is "correct" by design -- the
// classify prompt is deliberately under-specified so real failure clusters
// show up in the Evals tab.

import { z } from "zod";
import { callModel, extractJson } from "./openrouter";
import { CATEGORIES } from "./types";
import type { AgentPlan, Classification, Span, ToolResult } from "./types";
import { Tracer } from "./trace";

// ---------------------------------------------------------------------------
// (a) Classify
// ---------------------------------------------------------------------------

/**
 * SHIPPED PROMPT (deliberately imperfect).
 *
 * What is wrong with it, on purpose:
 *   - severity is defined by how the message *sounds*, with nothing separating
 *     emotional tone from business impact, so profanity inflates severity;
 *   - churn_risk is defined too narrowly ("has already decided to cancel"), so
 *     a customer who is merely shopping competitors lands in the topical
 *     category instead;
 *   - "out of scope" is never defined against account data we cannot read.
 *
 * These are the kinds of mistakes a real prompt author makes on a first pass,
 * and they are what produce the failure clusters the presenter reads out in the
 * error-analysis demo. No answer is hardcoded: fix the prompt and the score moves.
 */
export const CLASSIFY_SYSTEM_PROMPT = `You are SupportBot's triage classifier.

Read the customer message and return JSON:
{"category": "billing" | "technical" | "churn_risk" | "praise" | "sales" | "out_of_scope", "severity": 1-5}

Categories:
- billing: anything about payments, invoices, charges or refunds
- technical: anything about bugs, crashes, outages or quality problems
- churn_risk: the customer has decided to cancel
- praise: positive feedback
- sales: questions about plans or pricing
- out_of_scope: not about our product

Pick the one category that best describes the subject of the message.
Set severity from 1 (not urgent) to 5 (extremely urgent) based on how bad the message sounds.
For out_of_scope, severity is 1.

Return only the JSON object.`;

/**
 * IMPROVED PROMPT -- swap this in live during the demo.
 *
 * In `classify()` below, change:
 *     const system = CLASSIFY_SYSTEM_PROMPT;
 * to:
 *     const system = CLASSIFY_SYSTEM_PROMPT_V2;
 * then re-run the classification suite in the Evals tab. The two failure
 * clusters ("severity inflated by tone" and "churn_risk read as billing")
 * should collapse and the score should climb.
 */
export const CLASSIFY_SYSTEM_PROMPT_V2 = `You are SupportBot's triage classifier.

Read the customer message and return JSON:
{"category": "billing" | "technical" | "churn_risk" | "praise" | "sales" | "out_of_scope", "severity": 1-5}

CATEGORY RULES (apply in this order):
1. out_of_scope - the message is not about our product, OR it asks for account
   data we cannot look up (balances, personal records). Severity is always 1.
2. churn_risk - the customer mentions cancelling, leaving, or evaluating
   competitors. This outranks the surface topic: a billing complaint that also
   mentions switching vendors is churn_risk, not billing.
3. praise - positive feedback with no open problem.
4. sales - pre-purchase questions about plans, pricing, or features.
5. billing - payments, invoices, charges, refunds.
6. technical - bugs, crashes, outages, things not working.

SEVERITY RULES:
Severity measures BUSINESS IMPACT, not emotional tone. Rudeness, profanity, and
anger do NOT raise severity. A furious customer with a routine broken feature is
severity 3. Judge only: how much money or work is at risk, and how many people.
  1 = no action needed (praise, out of scope)
  2 = a question, nothing is broken
  3 = something is broken but there is a workaround
  4 = money or real work has already been lost
  5 = the customer is leaving right now, or the product is fully unusable

Return only the JSON object.`;

const ClassificationSchema = z.object({
  category: z.enum(CATEGORIES),
  severity: z.number().int().min(1).max(5),
});

export interface ClassifyResult {
  classification: Classification;
  metrics: { latencyMs: number; tokensIn: number; tokensOut: number; costUsd: number };
  rawText: string;
}

export async function classify(
  message: string,
  model: string,
  tracer?: Tracer,
): Promise<ClassifyResult> {
  // Presenter: switch to CLASSIFY_SYSTEM_PROMPT_V2 here to fix the clusters.
  // Measured on this dataset: gpt-4o-mini 66.7% -> 83.3%, llama-3.1-8b 41.7% -> 66.7%.
  const system = CLASSIFY_SYSTEM_PROMPT;

  const run = async (span?: Span): Promise<ClassifyResult> => {
    const res = await callModel({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: message },
      ],
      temperature: 0,
      responseFormatJSON: true,
      maxTokens: 120,
    });
    if (span) {
      span.model = res.model;
      span.tokensIn = res.tokensIn;
      span.tokensOut = res.tokensOut;
      span.costUsd = res.costUsd;
      span.attrs = {
        ...(span.attrs ?? {}),
        output: res.text.slice(0, 160),
        cost: res.costEstimated ? "estimated" : "reported",
      };
    }

    const parsed = ClassificationSchema.safeParse(safeJsonParse(res.text));
    if (!parsed.success) {
      throw new InvalidOutputError(res.text, {
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      });
    }
    // The model is told severity 1 for out_of_scope; we do not silently repair
    // it if it disagrees, because that failure is worth seeing.
    return {
      classification: parsed.data,
      metrics: {
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      },
      rawText: res.text,
    };
  };

  return tracer ? tracer.span("llm.classify", "llm", run, { capability: "classify" }) : run();
}

/** Raised when strict JSON parsing fails -> the row fails with "invalid output format". */
export class InvalidOutputError extends Error {
  readonly rawText: string;
  readonly metrics: { latencyMs: number; tokensIn: number; tokensOut: number; costUsd: number };
  constructor(rawText: string, metrics: InvalidOutputError["metrics"]) {
    super("invalid output format");
    this.name = "InvalidOutputError";
    this.rawText = rawText;
    this.metrics = metrics;
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(extractJson(text));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Tools (executed locally against a fixture -- instant, but still timed)
// ---------------------------------------------------------------------------

export interface Order {
  id: string;
  status: string;
  total: string;
  placed: string;
  refundEligible: boolean;
  note: string;
}

export const ORDERS: Record<string, Order> = {
  "4471": {
    id: "4471",
    status: "delivered",
    total: "$89.00",
    placed: "2026-08-11",
    refundEligible: true,
    note: "within 30-day window",
  },
  "5589": {
    id: "5589",
    status: "in_transit",
    total: "$142.50",
    placed: "2026-08-21",
    refundEligible: false,
    note: "still in transit, not yet delivered",
  },
  // The teaching case: this order exists, so a correct agent looks it up and
  // THEN refuses, instead of refunding or claiming the order is missing.
  "9999": {
    id: "9999",
    status: "delivered",
    total: "$1,240.00",
    placed: "2025-11-02",
    refundEligible: false,
    note: "outside the 30-day refund window; enterprise annual order",
  },
};

export const TOOL_SPECS = [
  {
    name: "lookup_order",
    description: "Look up an order by id. Returns status, total, and refund eligibility.",
    args: `{ "id": string }`,
  },
  {
    name: "issue_refund",
    description: "Refund an order. Only valid if lookup_order says refundEligible is true.",
    args: `{ "id": string }`,
  },
  {
    name: "escalate_to_human",
    description: "Hand the conversation to a human agent.",
    args: `{ "reason": string }`,
  },
] as const;

export function executeTool(tool: string, args: Record<string, unknown>): ToolResult {
  const t0 = performance.now();
  let ok = true;
  let result: unknown;

  switch (tool) {
    case "lookup_order":
    // A tiering-list equivalent: some models reach for this name instead.
    case "search_orders": {
      const id = String(args.id ?? args.order_id ?? "").trim();
      const order = ORDERS[id];
      result = order ?? { error: `order ${id || "(missing id)"} not found` };
      ok = Boolean(order);
      break;
    }
    case "issue_refund": {
      const id = String(args.id ?? args.order_id ?? "").trim();
      const order = ORDERS[id];
      if (!order) {
        ok = false;
        result = { error: `order ${id || "(missing id)"} not found` };
      } else if (!order.refundEligible) {
        ok = false;
        result = { refunded: false, error: `order ${id} is not refund-eligible: ${order.note}` };
      } else {
        result = { refunded: true, id, amount: order.total };
      }
      break;
    }
    case "escalate_to_human": {
      result = { escalated: true, ticket: `HUM-${Math.floor(1000 + Math.random() * 9000)}` };
      break;
    }
    default: {
      ok = false;
      result = { error: `unknown tool "${tool}"` };
    }
  }

  return { tool, args, ok, result, latencyMs: Math.round((performance.now() - t0) * 100) / 100 };
}

// ---------------------------------------------------------------------------
// (b) Agent / tool plan
// ---------------------------------------------------------------------------

// The plan is produced in a single call, so the agent needs its policy context
// up front -- otherwise it cannot know that 9999 is outside the refund window
// until after the lookup, and it will conservatively stop at lookup_order every
// time. Giving it the catalogue is what makes the 4471-vs-9999 contrast real.
const ORDER_CONTEXT = Object.values(ORDERS)
  .map(
    (o) =>
      `- order ${o.id}: placed ${o.placed}, ${o.status}, ${o.total}, refund-eligible: ${
        o.refundEligible ? "YES" : `NO (${o.note})`
      }`,
  )
  .join("\n");

export const AGENT_SYSTEM_PROMPT = `You are SupportBot's action agent.

Available tools:
${TOOL_SPECS.map((t) => `- ${t.name}${t.args} : ${t.description}`).join("\n")}

Known orders:
${ORDER_CONTEXT}

Rules:
- Only call a tool if the customer is actually asking for that action.
- Verify before you answer: if the customer names a specific order id, ALWAYS
  call lookup_order for that id first, even if you already believe you know the
  answer. Never talk about an order you have not looked up.
- Call issue_refund only after lookup_order, and only if that order is
  refund-eligible. If it is not eligible, call no refund tool at all and explain
  why in final_answer.
- If the request is not about our product or our orders, call NO tools and
  politely decline in final_answer.
- If the customer asks for a human, or asks to cancel their subscription, call
  escalate_to_human.

Return JSON only:
{"reasoning": string, "tool_calls": [{"tool": string, "args": object}], "final_answer": string}`;

const AgentPlanSchema = z.object({
  reasoning: z.string(),
  tool_calls: z
    .array(
      z.object({
        tool: z.string(),
        args: z.record(z.unknown()).default({}),
      }),
    )
    .default([]),
  final_answer: z.string(),
});

export interface AgentPlanResult {
  plan: AgentPlan;
  metrics: { latencyMs: number; tokensIn: number; tokensOut: number; costUsd: number };
  rawText: string;
  /** Returned so the caller can nest the tool spans underneath this call. */
  span?: Span;
}

export async function agentPlan(
  message: string,
  model: string,
  tracer?: Tracer,
): Promise<AgentPlanResult> {
  const run = async (span?: Span): Promise<AgentPlanResult> => {
    const res = await callModel({
      model,
      messages: [
        { role: "system", content: AGENT_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature: 0,
      responseFormatJSON: true,
      maxTokens: 500,
    });
    if (span) {
      span.model = res.model;
      span.tokensIn = res.tokensIn;
      span.tokensOut = res.tokensOut;
      span.costUsd = res.costUsd;
      span.attrs = { ...(span.attrs ?? {}), cost: res.costEstimated ? "estimated" : "reported" };
    }
    const parsed = AgentPlanSchema.safeParse(safeJsonParse(res.text));
    if (!parsed.success) {
      throw new InvalidOutputError(res.text, {
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      });
    }
    return {
      plan: parsed.data as AgentPlan,
      metrics: {
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      },
      rawText: res.text,
      span,
    };
  };

  return tracer ? tracer.span("llm.agent_plan", "llm", run, { capability: "agent" }) : run();
}

/**
 * Models sometimes fill an empty plan with a placeholder entry rather than an
 * empty array. Dropping those is parsing, not grading -- the model expressed
 * "no tool", so we record no tool.
 */
const NO_OP_TOOLS = new Set(["", "no_tool", "none", "null", "n/a", "na", "no_op", "noop"]);

export function planTools(plan: AgentPlan): { tool: string; args: Record<string, unknown> }[] {
  return (plan.tool_calls ?? []).filter(
    (c) => !NO_OP_TOOLS.has(String(c.tool ?? "").trim().toLowerCase()),
  );
}

/** Runs each planned tool locally, one timed span per call. */
export async function executePlan(plan: AgentPlan, tracer?: Tracer): Promise<ToolResult[]> {
  const out: ToolResult[] = [];
  for (const call of planTools(plan)) {
    if (tracer) {
      const r = await tracer.span(
        `tool.${call.tool}`,
        "tool",
        async (span) => {
          const res = executeTool(call.tool, call.args ?? {});
          span.attrs = {
            ...(span.attrs ?? {}),
            args: JSON.stringify(call.args ?? {}),
            ok: res.ok,
          };
          span.costUsd = 0;
          return res;
        },
        { local: true },
      );
      out.push(r);
    } else {
      out.push(executeTool(call.tool, call.args ?? {}));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// (c) Answer (tone) -- free text, used by the judge and non-determinism demos
// ---------------------------------------------------------------------------

export const ANSWER_SYSTEM_PROMPT = `You are SupportBot, a customer support assistant.

Reply to the customer in 2-4 sentences. Be warm and human, not robotic.
You do not have access to account balances or personal records; say so plainly
if you are asked for them. Never promise a refund unless you have confirmed the
order is eligible. Do not invent data.`;

export interface AnswerResult {
  text: string;
  metrics: { latencyMs: number; tokensIn: number; tokensOut: number; costUsd: number };
}

export async function answer(
  message: string,
  model: string,
  temperature = 0.8,
  tracer?: Tracer,
  spanName = "llm.answer",
): Promise<AnswerResult> {
  const run = async (span?: Span): Promise<AnswerResult> => {
    const res = await callModel({
      model,
      messages: [
        { role: "system", content: ANSWER_SYSTEM_PROMPT },
        { role: "user", content: message },
      ],
      temperature,
      maxTokens: 300,
    });
    if (span) {
      span.model = res.model;
      span.tokensIn = res.tokensIn;
      span.tokensOut = res.tokensOut;
      span.costUsd = res.costUsd;
      span.attrs = {
        ...(span.attrs ?? {}),
        temperature,
        cost: res.costEstimated ? "estimated" : "reported",
      };
    }
    return {
      text: res.text.trim(),
      metrics: {
        latencyMs: res.latencyMs,
        tokensIn: res.tokensIn,
        tokensOut: res.tokensOut,
        costUsd: res.costUsd,
      },
    };
  };

  return tracer ? tracer.span(spanName, "llm", run, { capability: "answer" }) : run();
}
