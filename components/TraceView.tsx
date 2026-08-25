"use client";

import { formatUsd } from "@/lib/pricing";
import type { Span } from "@/lib/types";
import { Badge } from "./Badge";

const KIND_TONE: Record<Span["kind"], string> = {
  root: "border-accent/50 bg-accent/10 text-accent",
  llm: "border-white/20 bg-white/5 text-white",
  tool: "border-warn/40 bg-warn/10 text-warn",
  judge: "border-fail/35 bg-fail/10 text-fail",
};

function totalCost(span: Span): number {
  let sum = span.costUsd ?? 0;
  span.children.forEach((c) => {
    sum += totalCost(c);
  });
  return sum;
}

function SpanNode({ span, depth, rootLatency }: { span: Span; depth: number; rootLatency: number }) {
  const share = rootLatency > 0 ? Math.min((span.latencyMs / rootLatency) * 100, 100) : 0;
  return (
    <div className={depth === 0 ? "" : "trace-node"}>
      <div className="rounded-lg border border-line bg-surface2 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] ${KIND_TONE[span.kind]}`}
          >
            {span.kind}
          </span>
          <span className="font-mono text-[13px] font-medium text-white">{span.name}</span>
          {span.model ? (
            <span className="font-mono text-[11px] text-muted">{span.model}</span>
          ) : null}
          <div className="ml-auto flex items-center gap-4 font-mono text-[11px]">
            <span className="text-white/85">{span.latencyMs}ms</span>
            {span.tokensIn !== undefined ? (
              <span className="text-muted">
                {span.tokensIn} in / {span.tokensOut ?? 0} out
              </span>
            ) : null}
            <span className="text-accent">
              {formatUsd(depth === 0 ? totalCost(span) : (span.costUsd ?? 0))}
            </span>
          </div>
        </div>

        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full ${span.kind === "tool" ? "bg-warn" : "bg-accent/70"}`}
            style={{ width: `${Math.max(share, 1)}%` }}
          />
        </div>

        {span.attrs && Object.keys(span.attrs).length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-muted">
            {Object.entries(span.attrs).map(([k, v]) => (
              <span key={k}>
                <span className="text-white/45">{k}=</span>
                {String(v).slice(0, 90)}
              </span>
            ))}
          </div>
        ) : null}

        {span.error ? (
          <div className="mt-2 font-mono text-[11px] text-fail">error: {span.error}</div>
        ) : null}
      </div>

      {span.children.length > 0 ? (
        <div className="trace-children mt-2 space-y-2">
          {span.children.map((c) => (
            <SpanNode key={c.id} span={c} depth={depth + 1} rootLatency={rootLatency} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function TraceView({ trace }: { trace: Span | null }) {
  if (!trace) {
    return (
      <div className="panel px-6 py-10 text-center">
        <p className="font-display text-lg text-white">No trace yet.</p>
        <p className="mt-2 font-mono text-[12px] text-muted">
          Run something in the Playground tab, then come back here.
        </p>
      </div>
    );
  }

  const spanCount = (function count(s: Span): number {
    return 1 + s.children.reduce((a, c) => a + count(c), 0);
  })(trace);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="accent">{spanCount} spans</Badge>
        <Badge tone="muted">root {trace.latencyMs}ms</Badge>
        <Badge tone="muted">{formatUsd(totalCost(trace))} total</Badge>
      </div>

      <SpanNode span={trace} depth={0} rootLatency={trace.latencyMs} />

      <div className="panel border-accent/25 bg-accent/[0.04] px-5 py-4">
        <div className="label mb-1.5 text-accent">Why the parent span matters</div>
        <p className="max-w-[80ch] text-[14px] leading-relaxed text-white/85">
          Every child span here is a complete record on its own — you would still have every
          LLM call, every tool call, every latency and cost. Remove the{" "}
          <span className="font-mono text-accent">handle_request</span> parent and you lose the{" "}
          <em>tree</em>, not the data: you can no longer say which classify call belonged to
          which request, or what one user request cost end to end. Nesting is the cheapest
          thing you can add and the most expensive thing to retrofit.
        </p>
      </div>
    </div>
  );
}
