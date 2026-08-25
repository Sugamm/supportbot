// Server-side only. The API key is read from process.env here and never
// crosses into a client component -- the browser only ever talks to /api/*.
import type { ChatMessage, ModelCallResult } from "./types";
import { estimateCostUsd } from "./pricing";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

/** Thrown for every failure path so callers have one thing to catch -> Demo mode. */
export class OpenRouterError extends Error {
  readonly status: number;
  readonly model: string;
  constructor(message: string, opts: { status?: number; model?: string } = {}) {
    super(message);
    this.name = "OpenRouterError";
    this.status = opts.status ?? 0;
    this.model = opts.model ?? "";
  }
}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.trim());
}

export interface CallModelArgs {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseFormatJSON?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export async function callModel({
  model,
  messages,
  temperature = 0,
  responseFormatJSON = false,
  maxTokens = 700,
  timeoutMs = 45_000,
}: CallModelArgs): Promise<ModelCallResult> {
  if (!hasApiKey()) {
    throw new OpenRouterError("OPENROUTER_API_KEY is not set", { model });
  }

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    // Asks OpenRouter to attach accounting to the response. The exact shape of
    // the usage/cost field has changed before -- confirm `usage.cost` against
    // the current OpenRouter docs if costs start showing as estimated.
    usage: { include: true },
  };
  if (responseFormatJSON) {
    body.response_format = { type: "json_object" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "SupportBot Evals",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    throw new OpenRouterError(`network error: ${msg}`, { model });
  }
  clearTimeout(timer);

  const latencyMs = Math.round(performance.now() - started);

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenRouterError(`HTTP ${res.status}: ${detail.slice(0, 300)}`, {
      status: res.status,
      model,
    });
  }

  let json: any;
  try {
    json = await res.json();
  } catch {
    throw new OpenRouterError("response was not valid JSON", { model });
  }

  if (json?.error) {
    throw new OpenRouterError(String(json.error?.message ?? "unknown provider error"), { model });
  }

  const text: string = json?.choices?.[0]?.message?.content ?? "";
  if (!text) {
    throw new OpenRouterError("empty completion", { model });
  }

  const usage = json?.usage ?? {};
  const tokensIn = Number(usage.prompt_tokens ?? 0);
  const tokensOut = Number(usage.completion_tokens ?? 0);

  const reportedCost = typeof usage.cost === "number" ? usage.cost : undefined;
  const costEstimated = reportedCost === undefined;
  const costUsd = reportedCost ?? estimateCostUsd(model, tokensIn, tokensOut);

  return { text, tokensIn, tokensOut, costUsd, costEstimated, latencyMs, model, raw: json };
}

/** Models sometimes wrap JSON in prose or a ```json fence. Salvage it before zod. */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start !== -1 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}
