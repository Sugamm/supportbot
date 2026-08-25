import { NextResponse } from "next/server";
import { OpenRouterError, hasApiKey } from "@/lib/openrouter";
import { InvalidOutputError, agentPlan, answer, classify, executePlan } from "@/lib/supportbot";
import { Tracer, rollup } from "@/lib/trace";
import { fixtureRunBot } from "@/data/fixtures";
import type { AgentPlan, Classification, RunBotResponse, ToolResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Trace tab reads whatever the last run-bot call produced. */
let lastRun: RunBotResponse | null = null;

export async function GET() {
  return NextResponse.json({ last: lastRun });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const message: string = String(body.message ?? "").trim();
  const temperature: number = Number.isFinite(body.temperature) ? Number(body.temperature) : 0.8;
  const twice: boolean = Boolean(body.twice);
  const generatorModel: string = String(body.generatorModel || "openai/gpt-4o-mini");

  if (!message) {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  if (!hasApiKey()) {
    const demo = fixtureRunBot(message, {
      temperature,
      twice,
      generatorModel,
      demoReason: "no OPENROUTER_API_KEY set",
    });
    lastRun = demo;
    return NextResponse.json(demo);
  }

  const tracer = new Tracer("handle_request", { message: message.slice(0, 80), temperature });

  try {
    let classification: Classification | null = null;
    let classifyError: string | null = null;
    try {
      classification = (await classify(message, generatorModel, tracer)).classification;
    } catch (err) {
      if (err instanceof OpenRouterError) throw err;
      // A malformed classification is a real, showable failure -- not a reason
      // to abandon the request.
      classifyError = err instanceof InvalidOutputError ? "invalid output format" : String(err);
    }

    let plan: AgentPlan | null = null;
    let planError: string | null = null;
    let toolResults: ToolResult[] = [];
    try {
      const planned = await agentPlan(message, generatorModel, tracer);
      plan = planned.plan;
      // Nest the tool spans under the plan that decided to call them.
      toolResults = planned.span
        ? await tracer.under(planned.span, () => executePlan(plan!, tracer))
        : await executePlan(plan, tracer);
    } catch (err) {
      if (err instanceof OpenRouterError) throw err;
      planError = err instanceof InvalidOutputError ? "invalid output format" : String(err);
    }

    const a = await answer(message, generatorModel, temperature, tracer);
    const b = twice
      ? await answer(message, generatorModel, temperature, tracer, "llm.answer#2")
      : null;

    const trace = tracer.finish();
    const result: RunBotResponse = {
      message,
      classification,
      classifyError,
      plan,
      planError,
      toolResults,
      answer: a.text,
      answerB: b?.text,
      trace,
      totals: rollup(trace),
      demo: false,
    };
    lastRun = result;
    return NextResponse.json(result);
  } catch (err) {
    const reason =
      err instanceof OpenRouterError
        ? `API error: ${err.message.slice(0, 120)}`
        : `failed: ${err instanceof Error ? err.message : String(err)}`;
    const demo = fixtureRunBot(message, { temperature, twice, generatorModel, demoReason: reason });
    lastRun = demo;
    return NextResponse.json(demo);
  }
}
