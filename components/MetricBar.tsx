"use client";

import { formatUsd } from "@/lib/pricing";
import type { RunAggregate } from "@/lib/types";

export function Metric({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "accent" | "fail";
}) {
  const color =
    tone === "accent" ? "text-accent" : tone === "fail" ? "text-fail" : "text-white";
  return (
    <div className="min-w-[130px] flex-1 px-5 py-4">
      <div className="label">{label}</div>
      <div className={`mt-1.5 font-display text-3xl font-semibold tabular-nums ${color}`}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 font-mono text-[11px] text-muted">{sub}</div> : null}
    </div>
  );
}

/** The header strip on the Evals tab: score, cost, latency. */
export function MetricBar({ agg, extra }: { agg: RunAggregate; extra?: React.ReactNode }) {
  const failed = agg.total - agg.passed;
  return (
    <div className="panel flex flex-wrap divide-x divide-line">
      <Metric
        label="Score"
        value={`${agg.scorePct}%`}
        sub={`${agg.passed}/${agg.total} passed`}
        tone="accent"
      />
      <Metric
        label="Failures"
        value={String(failed)}
        sub={`${agg.clusters.length} cluster${agg.clusters.length === 1 ? "" : "s"}`}
        tone={failed > 0 ? "fail" : "default"}
      />
      <Metric label="Total cost" value={formatUsd(agg.totalCostUsd)} sub="this run" />
      <Metric label="Mean latency" value={`${agg.meanLatencyMs}ms`} sub="per case" />
      <Metric label="p95 latency" value={`${agg.p95LatencyMs}ms`} sub="per case" />
      {extra}
    </div>
  );
}

export function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-2 w-56 overflow-hidden rounded-full bg-white/10">
        <div
          className="progress-stripes h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${Math.max(pct, 4)}%` }}
        />
      </div>
      <span className="font-mono text-[11px] text-muted">
        {done}/{total} cases · concurrency 4
      </span>
    </div>
  );
}
