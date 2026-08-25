"use client";

import { useMemo, useState } from "react";
import { Badge, PassFail } from "./Badge";
import { formatUsd } from "@/lib/pricing";
import type { EvalRow, FailureCluster } from "@/lib/types";

export function ResultsTable({
  rows,
  clusters,
  notes,
}: {
  rows: EvalRow[];
  clusters: FailureCluster[];
  /** Optional per-row hint from the dataset ("anger != severity"). */
  notes?: (string | undefined)[];
}) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const [grouped, setGrouped] = useState(false);
  const [highlight, setHighlight] = useState<number[] | null>(null);

  const visible = useMemo(() => {
    let out = failuresOnly ? rows.filter((r) => !r.pass) : rows;
    if (highlight) out = out.filter((r) => highlight.includes(r.index));
    return out;
  }, [rows, failuresOnly, highlight]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className={`btn ${failuresOnly ? "border-fail/60 text-fail" : ""}`}
          onClick={() => setFailuresOnly((v) => !v)}
        >
          {failuresOnly ? "Showing failures only" : "Failures only"}
        </button>
        <button
          className={`btn ${grouped ? "btn-accent" : ""}`}
          onClick={() => {
            setGrouped((v) => !v);
            setHighlight(null);
          }}
        >
          Group by failure reason
        </button>
        {highlight ? (
          <button className="btn" onClick={() => setHighlight(null)}>
            Clear cluster filter
          </button>
        ) : null}
        <p className="ml-auto max-w-[46ch] font-mono text-[11px] leading-relaxed text-muted">
          exact_match compares parsed JSON exactly. A semantically-correct answer in the
          wrong shape still FAILS.
        </p>
      </div>

      {grouped ? (
        <ClusterView clusters={clusters} total={rows.length} onPick={setHighlight} />
      ) : null}

      <div className="panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-white/[0.02]">
                <Th className="w-10">#</Th>
                <Th className="min-w-[240px]">Input</Th>
                <Th className="min-w-[150px]">Expected</Th>
                <Th className="min-w-[190px]">Actual</Th>
                <Th className="w-[120px]">Scorer</Th>
                <Th className="min-w-[210px]">Failure reason</Th>
                <Th className="w-[190px] text-right">Latency / tokens / cost</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.index}
                  className={`border-b border-line align-top last:border-0 ${
                    r.pass ? "" : "bg-fail/[0.07]"
                  }`}
                >
                  <Td className="font-mono text-muted">{r.index}</Td>
                  <Td>
                    <div className="text-[13px] leading-snug text-white">{r.input}</div>
                    {notes?.[r.index - 1] ? (
                      <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                        {notes[r.index - 1]}
                      </div>
                    ) : null}
                  </Td>
                  <Td className="font-mono text-[12px] text-muted">{r.expected}</Td>
                  <Td
                    className={`font-mono text-[12px] ${r.pass ? "text-white/80" : "text-fail"}`}
                  >
                    {r.actual}
                    {r.tier ? (
                      <div className="mt-1.5">
                        <Badge tone="warn" title="Accepted by the equivalence tier list">
                          tier: {r.tier}
                        </Badge>
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="flex flex-col gap-1">
                      {r.scores.map((s) => (
                        <PassFail key={s.name} pass={s.pass} />
                      ))}
                      <span className="font-mono text-[10px] text-muted">
                        {r.scores.map((s) => s.name).join(", ")}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    {r.pass ? (
                      <span className="font-mono text-[12px] text-muted">—</span>
                    ) : (
                      <div className="space-y-1">
                        <Badge tone="fail">{r.failureReason ?? "failure"}</Badge>
                        <div className="font-mono text-[11px] leading-snug text-muted">
                          {r.scores.find((s) => !s.pass)?.reason}
                        </div>
                      </div>
                    )}
                  </Td>
                  <Td className="text-right font-mono text-[11px] text-muted">
                    <div className="text-white/80">{r.latencyMs}ms</div>
                    <div>
                      {r.tokensIn} in / {r.tokensOut} out
                    </div>
                    <div>{formatUsd(r.costUsd)}</div>
                  </Td>
                </tr>
              ))}
              {visible.length === 0 ? (
                <tr>
                  <Td className="py-8 text-center font-mono text-[12px] text-muted" colSpan={7}>
                    No rows match this filter.
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ClusterView({
  clusters,
  total,
  onPick,
}: {
  clusters: FailureCluster[];
  total: number;
  onPick: (rows: number[] | null) => void;
}) {
  if (clusters.length === 0) {
    return (
      <div className="panel px-5 py-4 font-mono text-[12px] text-muted">
        No failures to cluster in this run.
      </div>
    );
  }
  return (
    <div className="panel p-5">
      <div className="label mb-3">Failure clusters — read three failures, name the bucket</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {clusters.map((c) => (
          <button
            key={c.reason}
            onClick={() => onPick(c.rowIndexes)}
            className="rounded-lg border border-fail/30 bg-fail/[0.08] px-4 py-3.5 text-left transition hover:border-fail/60"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[15px] font-semibold leading-snug text-white">
                {c.reason}
              </span>
              <span className="font-display text-2xl font-bold tabular-nums text-fail">
                {c.count}
              </span>
            </div>
            <div className="mt-1.5 font-mono text-[11px] text-muted">
              rows {c.rowIndexes.join(", ")} · {Math.round((c.count / total) * 100)}% of the suite
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`px-4 py-3 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  colSpan,
}: {
  children: React.ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3.5 ${className}`}>
      {children}
    </td>
  );
}
