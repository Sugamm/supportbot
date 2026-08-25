"use client";

import { useRef, useState } from "react";
import { DemoBadge } from "./Badge";
import { MetricBar, Progress } from "./MetricBar";
import { ModelField, useApp } from "./ModelPicker";
import { ResultsTable } from "./ResultsTable";
import { classificationSet } from "@/data/classification";
import { trajectorySet } from "@/data/trajectory";
import { equivalent } from "@/lib/scorers";
import type { DatasetId, EvalRow, RunResult } from "@/lib/types";

export function useSuiteRunner(endpoint: string) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  async function run<T>(body: Record<string, unknown>, total: number): Promise<T> {
    const runId = `r${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    setProgress({ done: 0, total });
    stop();
    timer.current = setInterval(async () => {
      try {
        const r = await fetch(`${endpoint}?runId=${runId}`, { cache: "no-store" });
        const j = await r.json();
        if (j?.progress) setProgress({ done: j.progress.done, total: j.progress.total });
      } catch {
        /* progress is cosmetic; never let it break the run */
      }
    }, 350);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, runId }),
      });
      return (await res.json()) as T;
    } finally {
      stop();
      setProgress(null);
    }
  }

  return { run, progress };
}

export function Evals() {
  const { models, setModel, reportDemo } = useApp();
  const [datasetId, setDatasetId] = useState<DatasetId>("classification");
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { run, progress } = useSuiteRunner("/api/run-suite");

  const total = datasetId === "classification" ? classificationSet.length : trajectorySet.length;
  const notes =
    datasetId === "classification"
      ? classificationSet.map((c) => c.note)
      : trajectorySet.map((c) => c.note);

  async function go() {
    setBusy(true);
    try {
      const data = await run<RunResult>({ datasetId, model: models.generatorA }, total);
      setResult(data);
      reportDemo(data.demo, data.demoReason);
    } catch {
      reportDemo(true, "network error reaching /api/run-suite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel flex flex-wrap items-end gap-5 p-5">
        <div>
          <div className="label mb-2">Dataset</div>
          <div className="flex gap-2">
            {(["classification", "trajectory"] as DatasetId[]).map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDatasetId(d);
                  setResult(null);
                }}
                className={`btn ${datasetId === d ? "btn-accent" : ""}`}
              >
                {d}
                <span className="opacity-60">
                  {d === "classification" ? classificationSet.length : trajectorySet.length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ModelField
          label="Model"
          value={models.generatorA}
          onChange={(v) => setModel("generatorA", v)}
          width="w-[260px]"
        />

        <button className="btn btn-accent" disabled={busy} onClick={go}>
          {busy ? "Running suite…" : "Run suite"}
        </button>

        {progress ? <Progress done={progress.done} total={progress.total} /> : null}

        <p className="ml-auto max-w-[38ch] font-mono text-[11px] leading-relaxed text-muted">
          {datasetId === "classification"
            ? "Scorer: exact_match on parsed JSON (category AND severity)."
            : "Scorer: ordered tool trajectory, with an equivalence tier list."}
        </p>
      </section>

      {result ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <MetricBar agg={result.aggregate} />
          </div>
          {result.demo ? (
            <div className="flex items-center gap-3">
              <DemoBadge reason={result.demoReason} />
              <span className="font-mono text-[11px] text-muted">{result.demoReason}</span>
            </div>
          ) : null}

          {datasetId === "trajectory" ? <TieringNote rows={result.rows} /> : null}

          <ResultsTable
            rows={result.rows}
            clusters={result.aggregate.clusters}
            notes={notes}
          />
        </>
      ) : (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg text-white">No run yet.</p>
          <p className="mt-2 font-mono text-[12px] text-muted">
            Pick a dataset and hit Run suite. Expect failures — that is the point.
          </p>
        </div>
      )}
    </div>
  );
}

/** States what the tiering list actually did on THIS run, rather than asserting a row. */
function TieringNote({ rows }: { rows: EvalRow[] }) {
  const fired = rows.filter((r) => r.tier);
  return (
    <div className="panel border-accent/25 bg-accent/[0.04] px-5 py-4">
      <div className="label mb-1.5 text-accent">Fenced unpredictability</div>
      <p className="max-w-[95ch] text-[14px] leading-relaxed text-white/85">
        {fired.length > 0 ? (
          <>
            {fired.length === 1 ? "Row" : "Rows"}{" "}
            <span className="font-mono text-accent">
              {fired.map((r) => r.index).join(", ")}
            </span>{" "}
            reached for a different tool name than the golden path and still{" "}
            <span className="text-accent">passed</span>, because the tiering list in{" "}
            <span className="font-mono">lib/scorers.ts</span> declares those names equivalent.
          </>
        ) : (
          <>
            No substitutions fired this run — the model picked the exact tool names. When it does
            pick a synonym, the tiering list in{" "}
            <span className="font-mono">lib/scorers.ts</span> accepts it and the row is tagged{" "}
            <span className="font-mono text-warn">tier:</span> instead of failing.
          </>
        )}{" "}
        You are not asking the model to be deterministic — you are fencing the set of acceptable
        behaviours and failing everything outside the fence.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
        {Object.entries(equivalent).map(([canonical, alts]) => (
          <span
            key={canonical}
            className="rounded-md border border-line bg-surface2 px-2 py-1 font-mono text-[10.5px] text-muted"
          >
            <span className="text-white/80">{canonical}</span> ≡ {alts.join(", ")}
          </span>
        ))}
      </div>
    </div>
  );
}
