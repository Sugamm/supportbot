// Cached demo-mode results.
//
// These are a REAL captured run against OpenRouter, not invented numbers:
// classification + trajectory for both generators, and judge calibration in
// both single and jury mode. Latency, tokens and cost are exactly what came
// back. Everything the UI needs is here, so every screen stays populated with
// zero network.
//
// Two things worth knowing if you regenerate them:
//   1. Keep the failures. A 100% fixture makes the whole demo pointless.
//   2. Live numbers drift run to run even at temperature 0. These are one
//      representative snapshot, not a guarantee.

import {
  aggregateRows,
  clusterClassificationFailure,
  clusterTrajectoryFailure,
  exactMatch,
  trajectory,
} from "@/lib/scorers";
import type {
  CalibrationResult,
  CalibrationRow,
  Category,
  Classification,
  DatasetId,
  EvalRow,
  RunBotResponse,
  RunResult,
  Span,
} from "@/lib/types";
import { classificationSet } from "./classification";
import { trajectorySet } from "./trajectory";
import { judgeLabelledSet } from "./judgeLabelled";

/** Cheap models are treated as tier A, everything else as tier B. */
export function tierFor(model: string): "A" | "B" {
  return /mini|haiku|flash|8b|small|lite|nano/i.test(model) ? "A" : "B";
}

interface ClsFixture {
  category: Category;
  severity: number;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// --- classification, openai/gpt-4o-mini -> 66.7% -----------------------------
const CLS_A: ClsFixture[] = [
  { category: "billing", severity: 4, latencyMs: 1065, tokensIn: 194, tokensOut: 13, costUsd: 0.0000369 },
  { category: "praise", severity: 1, latencyMs: 870, tokensIn: 195, tokensOut: 14, costUsd: 0.00003765 },
  { category: "churn_risk", severity: 5, latencyMs: 1206, tokensIn: 198, tokensOut: 16, costUsd: 0.0000393 },
  { category: "billing", severity: 2, latencyMs: 810, tokensIn: 195, tokensOut: 12, costUsd: 0.00003645 },
  { category: "technical", severity: 5, latencyMs: 725, tokensIn: 198, tokensOut: 12, costUsd: 0.0000369 },
  { category: "technical", severity: 5, latencyMs: 893, tokensIn: 197, tokensOut: 12, costUsd: 0.00003675 },
  { category: "out_of_scope", severity: 1, latencyMs: 819, tokensIn: 195, tokensOut: 14, costUsd: 0.00003765 },
  { category: "billing", severity: 2, latencyMs: 4834, tokensIn: 195, tokensOut: 13, costUsd: 0.00003705 },
  { category: "sales", severity: 2, latencyMs: 985, tokensIn: 197, tokensOut: 13, costUsd: 0.00003735 },
  { category: "billing", severity: 5, latencyMs: 709, tokensIn: 196, tokensOut: 12, costUsd: 0.0000366 },
  { category: "praise", severity: 1, latencyMs: 1370, tokensIn: 195, tokensOut: 14, costUsd: 0.00003765 },
  { category: "churn_risk", severity: 4, latencyMs: 1336, tokensIn: 196, tokensOut: 16, costUsd: 0.000039 },
];

// --- classification, anthropic/claude-sonnet-4.5 -> 66.7% --------------------
// Same score as the cheap model, ~27x the cost. That is the Compare tab's
// punchline on this dataset: the expensive model buys you nothing here.
const CLS_B: ClsFixture[] = [
  { category: "billing", severity: 4, latencyMs: 1668, tokensIn: 208, tokensOut: 26, costUsd: 0.001014 },
  { category: "praise", severity: 1, latencyMs: 1914, tokensIn: 209, tokensOut: 26, costUsd: 0.001017 },
  { category: "churn_risk", severity: 5, latencyMs: 2580, tokensIn: 211, tokensOut: 29, costUsd: 0.001068 },
  { category: "billing", severity: 2, latencyMs: 2040, tokensIn: 210, tokensOut: 26, costUsd: 0.00102 },
  { category: "technical", severity: 4, latencyMs: 2540, tokensIn: 212, tokensOut: 26, costUsd: 0.001026 },
  { category: "technical", severity: 4, latencyMs: 1856, tokensIn: 212, tokensOut: 26, costUsd: 0.001026 },
  { category: "out_of_scope", severity: 1, latencyMs: 2451, tokensIn: 209, tokensOut: 30, costUsd: 0.001077 },
  { category: "billing", severity: 2, latencyMs: 2233, tokensIn: 209, tokensOut: 26, costUsd: 0.001017 },
  { category: "sales", severity: 1, latencyMs: 2144, tokensIn: 212, tokensOut: 26, costUsd: 0.001026 },
  { category: "billing", severity: 4, latencyMs: 2377, tokensIn: 211, tokensOut: 26, costUsd: 0.001023 },
  { category: "praise", severity: 1, latencyMs: 1602, tokensIn: 209, tokensOut: 26, costUsd: 0.001017 },
  { category: "churn_risk", severity: 5, latencyMs: 1860, tokensIn: 213, tokensOut: 29, costUsd: 0.001074 },
];

interface TrjFixture {
  tools: string[];
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

// --- trajectory, openai/gpt-4o-mini -> 83.3% ---------------------------------
// Row 1 is the real failure: it looks the order up and then never issues the
// refund. Row 4 (order 9999) is the win: it looks up, finds it ineligible, and
// refuses without calling issue_refund.
const TRJ_A: TrjFixture[] = [
  { tools: ["lookup_order"], latencyMs: 699, tokensIn: 399, tokensOut: 53, costUsd: 0.00009165 },
  // Captured as "lookup_order". Renamed here to the tier-equivalent
  // "search_orders" so Demo mode always shows a substitution passing via the
  // tiering list in lib/scorers.ts -- live models happen to prefer the
  // canonical name, so this beat would otherwise never be visible offline.
  { tools: ["search_orders"], latencyMs: 565, tokensIn: 401, tokensOut: 51, costUsd: 0.00009075 },
  { tools: [], latencyMs: 613, tokensIn: 400, tokensOut: 46, costUsd: 0.0000876 },
  { tools: ["lookup_order"], latencyMs: 916, tokensIn: 402, tokensOut: 51, costUsd: 0.0000909 },
  { tools: ["escalate_to_human"], latencyMs: 697, tokensIn: 399, tokensOut: 56, costUsd: 0.00009345 },
  { tools: ["escalate_to_human"], latencyMs: 769, tokensIn: 396, tokensOut: 70, costUsd: 0.0001014 },
];

// --- trajectory, anthropic/claude-sonnet-4.5 -> 100% -------------------------
const TRJ_B: TrjFixture[] = [
  { tools: ["lookup_order", "issue_refund"], latencyMs: 1880, tokensIn: 444, tokensOut: 221, costUsd: 0.004647 },
  { tools: ["lookup_order"], latencyMs: 2819, tokensIn: 445, tokensOut: 151, costUsd: 0.0036 },
  { tools: [], latencyMs: 1705, tokensIn: 444, tokensOut: 137, costUsd: 0.003387 },
  { tools: ["lookup_order"], latencyMs: 2031, tokensIn: 447, tokensOut: 249, costUsd: 0.005076 },
  { tools: ["escalate_to_human"], latencyMs: 2233, tokensIn: 443, tokensOut: 131, costUsd: 0.003294 },
  { tools: ["escalate_to_human"], latencyMs: 2691, tokensIn: 440, tokensOut: 137, costUsd: 0.003375 },
];

function classificationRows(tier: "A" | "B"): EvalRow[] {
  const src = tier === "A" ? CLS_A : CLS_B;
  return classificationSet.map((c, i) => {
    const f = src[i];
    const actual: Classification = { category: f.category, severity: f.severity };
    const score = exactMatch(actual, c.expected);
    return {
      index: i + 1,
      input: c.input,
      expected: JSON.stringify(c.expected),
      actual: JSON.stringify(actual),
      scores: [score],
      pass: score.pass,
      failureReason: score.pass ? null : clusterClassificationFailure(actual, c.expected, c.input),
      latencyMs: f.latencyMs,
      tokensIn: f.tokensIn,
      tokensOut: f.tokensOut,
      costUsd: f.costUsd,
    };
  });
}

function trajectoryRows(tier: "A" | "B"): EvalRow[] {
  const src = tier === "A" ? TRJ_A : TRJ_B;
  return trajectorySet.map((c, i) => {
    const f = src[i];
    const score = trajectory(f.tools, c.expectedTools);
    const subs = score.substitutions.map((s) => `${s.called} ~ ${s.expected}`).join(", ");
    return {
      index: i + 1,
      input: c.input,
      expected: c.expectedTools.length ? c.expectedTools.join(" -> ") : "(no tools)",
      actual: f.tools.length ? f.tools.join(" -> ") : "(no tools)",
      scores: [{ name: score.name, pass: score.pass, reason: score.reason }],
      tier: subs || null,
      pass: score.pass,
      failureReason: score.pass
        ? null
        : clusterTrajectoryFailure(f.tools, c.expectedTools, score.reason),
      latencyMs: f.latencyMs,
      tokensIn: f.tokensIn,
      tokensOut: f.tokensOut,
      costUsd: f.costUsd,
    };
  });
}

export function fixtureRun(datasetId: DatasetId, model: string, demoReason: string): RunResult {
  const tier = tierFor(model);
  const rows = datasetId === "classification" ? classificationRows(tier) : trajectoryRows(tier);
  return { datasetId, model, rows, aggregate: aggregateRows(rows), demo: true, demoReason };
}

// ---------------------------------------------------------------------------
// Judge calibration
// ---------------------------------------------------------------------------

/**
 * Captured single-judge run: anthropic/claude-sonnet-4.5, 83.3% agreement.
 * It disagrees with the humans on exactly the two cases the set was built
 * around -- the blunt-but-correct reply (row 6) and the fabricated session log
 * (row 10).
 */
const SINGLE_JUDGE: { label: "pass" | "fail"; reason: string; latencyMs: number; costUsd: number }[] =
  [
    { label: "pass", reason: "The reply is polite, addresses the payment failure issue directly, offers a concrete solution, and makes no inappropriate promises or invented data.", latencyMs: 1710, costUsd: 0.00144 },
    { label: "fail", reason: "The reply invents specific account data ($412.65 and invoice date) that cannot be verified from the customer message.", latencyMs: 1915, costUsd: 0.001266 },
    { label: "pass", reason: "The reply is polite, appropriately declines an off-topic request, and redirects to relevant support topics without being defensive.", latencyMs: 3056, costUsd: 0.001371 },
    { label: "fail", reason: "The reply promises a refund without verifying order eligibility or checking any account data first.", latencyMs: 2345, costUsd: 0.001215 },
    { label: "pass", reason: "The reply is polite, directly addresses the order status question, makes no refund promises, and provides factual tracking information.", latencyMs: 2101, costUsd: 0.001371 },
    { label: "fail", reason: "Reply is not polite and comes across as curt and dismissive rather than empathetic to the customer's frustration.", latencyMs: 1692, costUsd: 0.001242 },
    { label: "pass", reason: "The reply is polite, addresses the customer's frustration by asking for specifics, and appropriately escalates without unauthorized promises.", latencyMs: 2068, costUsd: 0.001365 },
    { label: "pass", reason: "Reply is polite, addresses the double-charge issue appropriately, and doesn't invent account data.", latencyMs: 1794, costUsd: 0.001383 },
    { label: "fail", reason: "The reply is dismissive and not polite, failing to directly help the customer with their question.", latencyMs: 2248, costUsd: 0.001203 },
    { label: "pass", reason: "The reply is polite, addresses the crash issue with specific technical details, and references verifiable session data rather than inventing account information.", latencyMs: 2285, costUsd: 0.001434 },
    { label: "fail", reason: "Reply is vague and doesn't actually specify what features are included in the team plan.", latencyMs: 1975, costUsd: 0.001182 },
    { label: "pass", reason: "Reply is polite, acknowledges the specific uptime issue with factual detail, offers constructive next steps, and makes no invented data.", latencyMs: 2705, costUsd: 0.001359 },
  ];

const JURY_MODELS = [
  "openai/gpt-4o-mini",
  "anthropic/claude-haiku-4.5",
  "google/gemini-2.5-flash",
];

/** Captured jury run over the same set: 83.3% agreement at less than half the cost. */
const JURY_VOTES: { labels: ("pass" | "fail")[]; reasons: string[]; latencyMs: number; costUsd: number }[] = [
  { labels: ["pass", "pass", "pass"], reasons: ["The reply is polite, addresses the issue, and does not promise a refund.", "Polite, offers practical next steps, and does not invent account details.", "Polite, addresses the issue, and provides a clear next step."], latencyMs: 1574, costUsd: 0.00061915 },
  { labels: ["fail", "fail", "fail"], reasons: ["insufficient info", "Reply invents account data without accessing actual account information.", "The bot invented account data."], latencyMs: 1439, costUsd: 0.00048155 },
  { labels: ["pass", "pass", "pass"], reasons: ["The reply is polite and addresses the issue appropriately.", "Polite, non-defensive, appropriately redirects an out-of-scope question.", "Polite, non-defensive, and correctly states its limitations."], latencyMs: 1579, costUsd: 0.00059315 },
  { labels: ["fail", "fail", "fail"], reasons: ["promises a refund without confirming eligibility", "Reply promises a refund without verifying order eligibility.", "The bot promised a refund without checking eligibility."], latencyMs: 1685, costUsd: 0.0005126 },
  { labels: ["pass", "pass", "pass"], reasons: ["The reply is polite, addresses the issue, and does not promise a refund.", "Addresses the tracking question directly with specific shipping details.", "Polite, does not promise a refund, and does not invent data."], latencyMs: 1364, costUsd: 0.00059365 },
  { labels: ["fail", "pass", "fail"], reasons: ["reply is not polite and does not address the customer's tone", "Polite, addresses the actual issue, and doesn't invent account data.", "The reply is impolite and does not address the customer's frustration."], latencyMs: 1276, costUsd: 0.00051835 },
  { labels: ["pass", "pass", "pass"], reasons: ["The reply is polite, addresses the issue, and does not promise a refund.", "Non-defensive, addresses the issue by asking for specifics.", "Polite, asks for specifics, and doesn't invent data."], latencyMs: 1418, costUsd: 0.0006474 },
  { labels: ["pass", "pass", "pass"], reasons: ["Polite, and does not promise a refund without checking eligibility.", "Doesn't promise a refund without verification, and doesn't invent data.", "Explains the process without promising a refund directly."], latencyMs: 1448, costUsd: 0.0006358 },
  { labels: ["fail", "fail", "fail"], reasons: ["reply does not directly address the customer's issue", "Dismissive and defensive rather than polite and helpful.", "The reply is defensive and not polite."], latencyMs: 2057, costUsd: 0.00051385 },
  { labels: ["pass", "pass", "fail"], reasons: ["Polite, addresses the issue, and does not invent account data.", "Addresses the issue with specific technical details.", "The reply invents account data (session logs, autosave time, snapshot location)."], latencyMs: 1529, costUsd: 0.0006257 },
  { labels: ["fail", "fail", "pass"], reasons: ["insufficient info", "Vague - customer asked what's included but received only generic praise.", "Polite, addresses the issue by listing features."], latencyMs: 1150, costUsd: 0.000588 },
  { labels: ["pass", "pass", "pass"], reasons: ["The reply is polite, addresses the issue, and does not promise a refund.", "Provides concrete evidence and offers appropriate next steps.", "Addresses the issue directly and does not invent account data."], latencyMs: 2672, costUsd: 0.00066215 },
];

export function fixtureCalibration(
  mode: "single" | "jury",
  models: string[],
  demoReason: string,
): CalibrationResult {
  const activeModels = mode === "jury" ? (models.length >= 3 ? models.slice(0, 3) : JURY_MODELS) : models.slice(0, 1);

  const rows: CalibrationRow[] = judgeLabelledSet.map((c, i) => {
    if (mode === "jury") {
      const v = JURY_VOTES[i];
      const votes = v.labels.map((label, k) => ({
        model: activeModels[k] ?? JURY_MODELS[k],
        label,
        reason: v.reasons[k],
      }));
      const passes = votes.filter((x) => x.label === "pass").length;
      const judgeLabel: "pass" | "fail" = passes > votes.length / 2 ? "pass" : "fail";
      return {
        index: i + 1,
        input: c.input,
        botOutput: c.botOutput,
        humanLabel: c.humanLabel,
        judgeLabel,
        agree: judgeLabel === c.humanLabel,
        reason: `majority ${passes}/${votes.length} -> ${judgeLabel}`,
        votes,
        latencyMs: v.latencyMs,
        costUsd: v.costUsd,
      };
    }

    const s = SINGLE_JUDGE[i];
    return {
      index: i + 1,
      input: c.input,
      botOutput: c.botOutput,
      humanLabel: c.humanLabel,
      judgeLabel: s.label,
      agree: s.label === c.humanLabel,
      reason: s.reason,
      latencyMs: s.latencyMs,
      costUsd: s.costUsd,
    };
  });

  return summariseCalibration(rows, mode, activeModels, true, demoReason);
}

/** Shared by the fixture path and the live path so the numbers match. */
export function summariseCalibration(
  rows: CalibrationRow[],
  mode: "single" | "jury",
  models: string[],
  demo: boolean,
  demoReason?: string,
): CalibrationResult {
  const agreeCount = rows.filter((r) => r.agree).length;
  const confusion = { truePass: 0, falsePass: 0, trueFail: 0, falseFail: 0 };
  for (const r of rows) {
    if (r.humanLabel === "pass" && r.judgeLabel === "pass") confusion.truePass += 1;
    else if (r.humanLabel === "fail" && r.judgeLabel === "pass") confusion.falsePass += 1;
    else if (r.humanLabel === "fail" && r.judgeLabel === "fail") confusion.trueFail += 1;
    else confusion.falseFail += 1;
  }
  return {
    mode,
    models,
    rows,
    agreementPct: rows.length ? Math.round((agreeCount / rows.length) * 1000) / 10 : 0,
    agreeCount,
    total: rows.length,
    confusion,
    totalCostUsd: rows.reduce((a, r) => a + r.costUsd, 0),
    demo,
    demoReason,
  };
}

// ---------------------------------------------------------------------------
// Playground / run-bot
// ---------------------------------------------------------------------------

interface BotFixture {
  classification: Classification;
  plan: {
    reasoning: string;
    tool_calls: { tool: string; args: Record<string, unknown> }[];
    final_answer: string;
  };
  answers: [string, string];
}

const DEFAULT_BOT: BotFixture = {
  classification: { category: "technical", severity: 3 },
  plan: {
    reasoning:
      "The customer has not asked for a specific account action, so no tool is required. I will answer directly.",
    tool_calls: [],
    final_answer:
      "Thanks for flagging this - I've got what I need to look into it. If you can share the exact time it happened, I can narrow it down faster.",
  },
  answers: [
    "Thanks for reaching out, and sorry for the trouble. I've made a note of this so our team can dig in - if you can tell me roughly when it started, that'll help us pin it down quickly.",
    "Sorry about that! I want to get this sorted for you. Could you let me know when you first noticed it? With a rough timestamp I can pull the right logs and get you a real answer rather than a guess.",
  ],
};

const BOT_FIXTURES: { match: RegExp; fixture: BotFixture }[] = [
  {
    match: /refund.*4471|4471.*refund/i,
    fixture: {
      classification: { category: "billing", severity: 4 },
      plan: {
        reasoning:
          "The customer is asking for a refund on a specific order. I must look the order up first to confirm eligibility, then refund it if eligible.",
        tool_calls: [
          { tool: "lookup_order", args: { id: "4471" } },
          { tool: "issue_refund", args: { id: "4471" } },
        ],
        final_answer:
          "I've checked order 4471 - it's inside the 30-day window, so I've gone ahead and refunded $89.00. It should be back on your card in 3-5 business days.",
      },
      answers: [
        "I've refunded order 4471 for you - $89.00 is on its way back to your card and usually lands within 3-5 business days. Sorry it didn't work out this time.",
        "Done! Order 4471 was still inside the refund window, so I've processed the $89.00 back to your original payment method. Give it 3-5 business days to show up on your statement.",
      ],
    },
  },
  {
    match: /9999/,
    fixture: {
      classification: { category: "billing", severity: 4 },
      plan: {
        reasoning:
          "The customer wants a refund for order 9999. I looked it up: it was placed in November 2025, which is outside the 30-day refund window, so it is not refund-eligible. I will not call issue_refund.",
        tool_calls: [{ tool: "lookup_order", args: { id: "9999" } }],
        final_answer:
          "I've pulled up order 9999. It was placed on 2025-11-02, which puts it outside our 30-day refund window, so I can't process a refund on it directly. I can get you to someone on our billing team who can look at an exception if you'd like.",
      },
      answers: [
        "I checked order 9999 - it's from November 2025, so it's outside the 30-day refund window and I can't refund it myself. I'd rather tell you that straight than promise something I can't do. Want me to pass this to billing for an exception review?",
        "Order 9999 falls outside our 30-day refund window, so a refund isn't something I can action here. I don't want to leave you stuck though - our billing team can review exceptions, and I'm happy to hand this over.",
      ],
    },
  },
  {
    match: /weather|mars/i,
    fixture: {
      classification: { category: "out_of_scope", severity: 1 },
      plan: {
        reasoning:
          "This is not about our product or the customer's account. No tool applies. I will decline politely.",
        tool_calls: [],
        final_answer:
          "That one's outside what I can help with - I'm here for questions about your account and our product. Anything on that side I can dig into?",
      },
      answers: [
        "Ha - that's a bit outside my remit! I'm here for account and product questions, so if anything's up on that front, I'm all yours.",
        "That's not something I can help with, I'm afraid - I only cover our product and your account. Happy to jump on anything in that territory though.",
      ],
    },
  },
  {
    match: /talk to a human|speak to (a|an) (human|agent|person)|real person/i,
    fixture: {
      classification: { category: "technical", severity: 3 },
      plan: {
        reasoning: "The customer has explicitly asked for a human. Escalate.",
        tool_calls: [
          { tool: "escalate_to_human", args: { reason: "customer requested a human agent" } },
        ],
        final_answer:
          "Of course - I'm handing you to a human agent now. They'll pick this up with the full history of our conversation, so you won't have to repeat yourself.",
      },
      answers: [
        "Absolutely - passing you to a human now. They'll have this conversation in front of them, so you won't need to start over.",
        "No problem at all. I'm connecting you with someone from our team right now, and they'll see everything we've discussed so far.",
      ],
    },
  },
  {
    match: /useless|garbage|terrible|rubbish/i,
    fixture: {
      // The over-escalation is visible right here in the Playground: the golden
      // label for this row is severity 3, and the shipped prompt says 5.
      classification: { category: "technical", severity: 5 },
      plan: {
        reasoning:
          "The customer is angry about something being broken but has not named a specific order or asked for a human, so no tool call is needed yet.",
        tool_calls: [],
        final_answer:
          "That's fair, and I'm sorry. Tell me which part is failing and I'll get straight on it - no runaround.",
      },
      answers: [
        "That's on us, and I'm sorry you've had to chase it. Tell me exactly what's failing and I'll get it in front of the right person today - no runaround.",
        "You're right to be annoyed. Point me at the specific thing that's broken and I'll take it from there - I'd rather fix it than apologise twice.",
      ],
    },
  },
  {
    match: /balance/i,
    fixture: {
      classification: { category: "billing", severity: 2 },
      plan: {
        reasoning:
          "The customer is asking for account financial data. I have no tool that returns balances, so I cannot look this up.",
        tool_calls: [],
        final_answer:
          "I don't have access to account balances from here, so I can't give you a figure without guessing - and I'd rather not. You'll find the current balance under Settings > Billing, or I can put you through to someone who can read it out.",
      },
      answers: [
        "I can't see account balances from where I sit, so I won't guess at a number. You'll find it under Settings > Billing, or I can hand you to someone who can pull it up properly.",
        "Balances aren't something I have access to, so I'd only be making a number up - and that helps no one. Settings > Billing has the live figure, or I can get a human to read it to you.",
      ],
    },
  },
];

function pickBotFixture(message: string): BotFixture {
  return BOT_FIXTURES.find((f) => f.match.test(message))?.fixture ?? DEFAULT_BOT;
}

let fixtureSpanSeq = 0;
function span(partial: Partial<Span> & { name: string; kind: Span["kind"] }): Span {
  fixtureSpanSeq += 1;
  const latencyMs = partial.latencyMs ?? 0;
  const startMs = partial.startMs ?? 0;
  return {
    id: `f${fixtureSpanSeq}`,
    parentId: partial.parentId ?? null,
    startMs,
    endMs: startMs + latencyMs,
    latencyMs,
    children: partial.children ?? [],
    ...partial,
  } as Span;
}

export function fixtureRunBot(
  message: string,
  opts: { temperature: number; twice: boolean; generatorModel: string; demoReason: string },
): RunBotResponse {
  const f = pickBotFixture(message);
  const { generatorModel } = opts;
  const cheap = tierFor(generatorModel) === "A";
  const unit = cheap ? 0.000092 : 0.0035;

  const toolResults = f.plan.tool_calls.map((c) => ({
    tool: c.tool,
    args: c.args,
    ok: c.tool !== "issue_refund" || String(c.args.id) === "4471",
    result:
      c.tool === "lookup_order"
        ? {
            id: String(c.args.id),
            status: "delivered",
            refundEligible: String(c.args.id) === "4471",
          }
        : c.tool === "issue_refund"
          ? { refunded: true, id: String(c.args.id), amount: "$89.00" }
          : { escalated: true, ticket: "HUM-4820" },
    latencyMs: 0.14,
  }));

  let cursor = 2;
  const classifySpan = span({
    name: "llm.classify",
    kind: "llm",
    parentId: "f-root",
    startMs: cursor,
    latencyMs: 893,
    model: generatorModel,
    tokensIn: 197,
    tokensOut: 13,
    costUsd: unit * 0.4,
    attrs: {
      capability: "classify",
      output: JSON.stringify(f.classification),
      cost: "reported",
    },
  });
  cursor += 893;

  const planSpan = span({
    name: "llm.agent_plan",
    kind: "llm",
    parentId: "f-root",
    startMs: cursor,
    latencyMs: 916,
    model: generatorModel,
    tokensIn: 402,
    tokensOut: 51,
    costUsd: unit,
    attrs: { capability: "agent", cost: "reported" },
    children: toolResults.map((t, i) =>
      span({
        name: `tool.${t.tool}`,
        kind: "tool",
        startMs: cursor + 800 + i * 2,
        latencyMs: 0.14,
        costUsd: 0,
        attrs: { local: true, args: JSON.stringify(t.args), ok: t.ok },
      }),
    ),
  });
  cursor += 916;

  const answerSpan = span({
    name: "llm.answer",
    kind: "llm",
    parentId: "f-root",
    startMs: cursor,
    latencyMs: 1387,
    model: generatorModel,
    tokensIn: 96,
    tokensOut: 84,
    costUsd: unit * 0.9,
    attrs: { capability: "answer", temperature: opts.temperature, cost: "reported" },
  });
  cursor += 1387;

  const children = [classifySpan, planSpan, answerSpan];

  if (opts.twice) {
    children.push(
      span({
        name: "llm.answer#2",
        kind: "llm",
        parentId: "f-root",
        startMs: cursor,
        latencyMs: 1156,
        model: generatorModel,
        tokensIn: 96,
        tokensOut: 91,
        costUsd: unit * 0.95,
        attrs: {
          capability: "answer",
          temperature: opts.temperature,
          run: 2,
          cost: "reported",
        },
      }),
    );
    cursor += 1156;
  }

  const root = span({
    name: "handle_request",
    kind: "root",
    startMs: 0,
    latencyMs: cursor + 3,
    attrs: { message: message.slice(0, 80), temperature: opts.temperature, demo: true },
    children,
  });
  root.id = "f-root";

  const costUsd = children.reduce((a, c) => a + (c.costUsd ?? 0), 0);
  const tokensIn = children.reduce((a, c) => a + (c.tokensIn ?? 0), 0);
  const tokensOut = children.reduce((a, c) => a + (c.tokensOut ?? 0), 0);

  return {
    message,
    classification: f.classification,
    classifyError: null,
    plan: f.plan,
    planError: null,
    toolResults,
    answer: f.answers[0],
    answerB: opts.twice ? f.answers[1] : undefined,
    trace: root,
    totals: { latencyMs: root.latencyMs, costUsd, tokensIn, tokensOut },
    demo: true,
    demoReason: opts.demoReason,
  };
}
