// Fallback price map, USD per 1M tokens.
//
// This is only used when OpenRouter does not return a cost in the usage block.
// Prices drift; treat these as approximate and update them from
// https://openrouter.ai/models before quoting numbers on stage.

export interface Price {
  inPer1M: number;
  outPer1M: number;
}

// Verified against https://openrouter.ai/api/v1/models at build time.
export const PRICES: Record<string, Price> = {
  "openai/gpt-4o-mini": { inPer1M: 0.15, outPer1M: 0.6 },
  "openai/gpt-4o": { inPer1M: 2.5, outPer1M: 10 },
  "anthropic/claude-sonnet-4.5": { inPer1M: 3, outPer1M: 15 },
  "anthropic/claude-sonnet-4.6": { inPer1M: 3, outPer1M: 15 },
  "anthropic/claude-haiku-4.5": { inPer1M: 1, outPer1M: 5 },
  "anthropic/claude-3-haiku": { inPer1M: 0.25, outPer1M: 1.25 },
  "google/gemini-2.5-flash-lite": { inPer1M: 0.1, outPer1M: 0.4 },
  "google/gemini-2.5-flash": { inPer1M: 0.3, outPer1M: 2.5 },
  "meta-llama/llama-3.1-8b-instruct": { inPer1M: 0.05, outPer1M: 0.08 },
};

/** Used for unknown / user-typed model IDs so cost is never NaN on screen. */
export const DEFAULT_PRICE: Price = { inPer1M: 0.5, outPer1M: 1.5 };

export function priceFor(model: string): Price {
  return PRICES[model] ?? DEFAULT_PRICE;
}

export function estimateCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = priceFor(model);
  return (tokensIn / 1_000_000) * p.inPer1M + (tokensOut / 1_000_000) * p.outPer1M;
}

export function formatUsd(n: number): string {
  if (!Number.isFinite(n)) return "$0.0000";
  if (n === 0) return "$0.0000";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(4)}`;
}
