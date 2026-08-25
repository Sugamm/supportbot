import type { Span, SpanKind } from "./types";

/**
 * Minimal nested tracer.
 *
 * The whole point of the Trace tab: spans carry a parentId, so the same flat
 * list of events renders as a tree. Drop the parent span and you still have
 * every child -- you just lose the shape of the request.
 */
/** Local tool calls finish in fractions of a millisecond; do not round them to 0. */
function fmtMs(x: number): number {
  return x < 10 ? Math.round(x * 1000) / 1000 : Math.round(x);
}

export class Tracer {
  private seq = 0;
  private readonly t0 = performance.now();
  private readonly nodes = new Map<string, Span>();
  private readonly raw = new Map<string, number>();
  private stack: string[] = [];
  readonly root: Span;

  constructor(rootName: string, attrs?: Span["attrs"]) {
    this.root = this.makeSpan(rootName, "root", null, attrs);
    this.nodes.set(this.root.id, this.root);
    this.stack.push(this.root.id);
  }

  private makeSpan(name: string, kind: SpanKind, parentId: string | null, attrs?: Span["attrs"]): Span {
    this.seq += 1;
    const id = `s${this.seq}`;
    const now = performance.now() - this.t0;
    this.raw.set(id, now);
    return {
      id,
      parentId,
      name,
      kind,
      startMs: fmtMs(now),
      endMs: fmtMs(now),
      latencyMs: 0,
      attrs,
      children: [],
    };
  }

  private close(span: Span) {
    const end = performance.now() - this.t0;
    span.endMs = fmtMs(end);
    span.latencyMs = fmtMs(end - (this.raw.get(span.id) ?? end));
  }

  /** Runs `fn` inside a child of the current span and closes it either way. */
  async span<T>(
    name: string,
    kind: SpanKind,
    fn: (span: Span) => Promise<T>,
    attrs?: Span["attrs"],
  ): Promise<T> {
    const parentId = this.stack[this.stack.length - 1];
    const span = this.makeSpan(name, kind, parentId, attrs);
    this.nodes.get(parentId)!.children.push(span);
    this.nodes.set(span.id, span);
    this.stack.push(span.id);
    try {
      return await fn(span);
    } catch (err) {
      span.error = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      this.close(span);
      this.stack.pop();
    }
  }

  /**
   * Re-enters an already-closed span as the current parent. Used so tool calls
   * nest under the agent-plan span that decided to make them, rather than
   * flattening out as siblings of it.
   */
  async under<T>(parent: Span, fn: () => Promise<T>): Promise<T> {
    this.stack.push(parent.id);
    try {
      return await fn();
    } finally {
      this.stack.pop();
      this.close(parent);
    }
  }

  finish(): Span {
    this.close(this.root);
    return this.root;
  }
}

/** Sums cost/tokens across the whole tree, for the header strip. */
export function rollup(span: Span): {
  latencyMs: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
} {
  let costUsd = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  const walk = (s: Span) => {
    costUsd += s.costUsd ?? 0;
    tokensIn += s.tokensIn ?? 0;
    tokensOut += s.tokensOut ?? 0;
    s.children.forEach(walk);
  };
  walk(span);
  return { latencyMs: span.latencyMs, costUsd, tokensIn, tokensOut };
}
