"use client";

import { useState } from "react";
import { DemoBadge } from "./Badge";
import { useSuiteRunner } from "./Evals";
import { Progress } from "./MetricBar";
import { ModelField, useApp } from "./ModelPicker";
import { ScatterCostQuality } from "./ScatterCostQuality";
import { classificationSet } from "@/data/classification";
import { trajectorySet } from "@/data/trajectory";
import { formatUsd } from "@/lib/pricing";
import type { DatasetId, RunResult } from "@/lib/types";

export function Compare() {
  const { models, setModel, reportDemo } = useApp();
  const [datasetId, setDatasetId] = useState<DatasetId>("classification");
  const [a, setA] = useState<RunResult | null>(null);
  const [b, setB] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const { run, progress } = useSuiteRunner("/api/run-suite");

  const total = datasetId === "classification" ? classificationSet.length : trajectorySet.length;

  async function go() {
    setBusy(true);
    setA(null);
    setB(null);
    try {
      // Sequential, so the progress bar means something and we do not stack
      // eight in-flight calls against one rate limit.
      const ra = await run<RunResult>({ datasetId, model: models.generatorA }, total);
      setA(ra);
      const rb = await run<RunResult>({ datasetId, model: models.generatorB }, total);
      setB(rb);
      reportDemo(ra.demo || rb.demo, ra.demoReason ?? rb.demoReason);
    } catch {
      reportDemo(true, "network error reaching /api/run-suite");
    } finally {
      setBusy(false);
    }
  }

  const ready = a && b;
  const costDelta = ready ? b!.aggregate.totalCostUsd / Math.max(a!.aggregate.totalCostUsd, 1e-9) : 0;
  const accDelta = ready
    ? Math.round((b!.aggregate.scorePct - a!.aggregate.scorePct) * 10) / 10
    : 0;

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
                  setA(null);
                  setB(null);
                }}
                className={`btn ${datasetId === d ? "btn-accent" : ""}`}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
        <ModelField
          label="A (cheap)"
          value={models.generatorA}
          onChange={(v) => setModel("generatorA", v)}
        />
        <ModelField
          label="B (strong)"
          value={models.generatorB}
          onChange={(v) => setModel("generatorB", v)}
        />
        <button className="btn btn-accent" disabled={busy} onClick={go}>
          {busy ? "Running both…" : "Run A vs B"}
        </button>
        {progress ? <Progress done={progress.done} total={progress.total} /> : null}
      </section>

      {ready ? (
        <>
          {(a!.demo || b!.demo) && (
            <div className="flex items-center gap-3">
              <DemoBadge reason={a!.demoReason ?? b!.demoReason} />
              <span className="font-mono text-[11px] text-muted">
                {a!.demoReason ?? b!.demoReason}
              </span>
            </div>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <ModelCard title="A" run={a!} accent="#8C8C8C" />
            <ModelCard title="B" run={b!} accent="#C7F94C" />
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <ScatterCostQuality
              points={[
                {
                  label: "A",
                  model: a!.model,
                  costPerRun: a!.aggregate.totalCostUsd,
                  accuracy: a!.aggregate.scorePct,
                  color: "#8C8C8C",
                },
                {
                  label: "B",
                  model: b!.model,
                  costPerRun: b!.aggregate.totalCostUsd,
                  accuracy: b!.aggregate.scorePct,
                  color: "#C7F94C",
                },
              ]}
            />
            <div className="panel p-6">
              <div className="label mb-3">The only sentence that matters</div>
              <p className="text-[17px] leading-relaxed text-white/90">
                B is{" "}
                <span
                  className={accDelta >= 0 ? "font-semibold text-accent" : "font-semibold text-fail"}
                >
                  {accDelta >= 0 ? "+" : ""}
                  {accDelta} points
                </span>{" "}
                more accurate than A on {a!.aggregate.total} cases, and costs{" "}
                <span className="font-semibold text-warn">{costDelta.toFixed(1)}×</span> as much per
                run.
              </p>
              <dl className="mt-5 space-y-3 border-t border-line pt-4 font-mono text-[12px]">
                <Row
                  k="accuracy"
                  a={`${a!.aggregate.scorePct}%`}
                  b={`${b!.aggregate.scorePct}%`}
                />
                <Row
                  k="cost / run"
                  a={formatUsd(a!.aggregate.totalCostUsd)}
                  b={formatUsd(b!.aggregate.totalCostUsd)}
                />
                <Row
                  k="mean latency"
                  a={`${a!.aggregate.meanLatencyMs}ms`}
                  b={`${b!.aggregate.meanLatencyMs}ms`}
                />
                <Row
                  k="p95 latency"
                  a={`${a!.aggregate.p95LatencyMs}ms`}
                  b={`${b!.aggregate.p95LatencyMs}ms`}
                />
                <Row
                  k="failures"
                  a={String(a!.aggregate.total - a!.aggregate.passed)}
                  b={String(b!.aggregate.total - b!.aggregate.passed)}
                />
              </dl>
              <p className="mt-5 max-w-[46ch] font-mono text-[11px] leading-relaxed text-muted">
                Whether that trade is worth it is a business decision, not a model decision. The
                eval just makes the trade legible.
              </p>
            </div>
          </div>
        </>
      ) : (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg text-white">Nothing compared yet.</p>
          <p className="mt-2 font-mono text-[12px] text-muted">
            Same dataset, two models, one scatter plot.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ k, a, b }: { k: string; a: string; b: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="flex gap-6 tabular-nums">
        <span className="w-20 text-right text-white/70">{a}</span>
        <span className="w-20 text-right font-semibold text-accent">{b}</span>
      </dd>
    </div>
  );
}

function ModelCard({ title, run, accent }: { title: string; run: RunResult; accent: string }) {
  const agg = run.aggregate;
  return (
    <div className="panel p-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-md font-display text-[15px] font-bold text-black"
          style={{ background: accent }}
        >
          {title}
        </span>
        <span className="font-mono text-[13px] text-white">{run.model}</span>
      </div>
      <div className="mt-5 flex items-end gap-6">
        <div>
          <div className="label">Accuracy</div>
          <div className="font-display text-5xl font-bold tabular-nums text-white">
            {agg.scorePct}
            <span className="text-2xl text-muted">%</span>
          </div>
        </div>
        <div className="flex-1 space-y-2 pb-2 font-mono text-[12px] text-muted">
          <div>
            cost <span className="text-white/85">{formatUsd(agg.totalCostUsd)}</span> / run
          </div>
          <div>
            mean <span className="text-white/85">{agg.meanLatencyMs}ms</span> · p95{" "}
            <span className="text-white/85">{agg.p95LatencyMs}ms</span>
          </div>
          <div>
            <span className="text-fail">{agg.total - agg.passed}</span> failures in{" "}
            {agg.clusters.length} cluster{agg.clusters.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      {agg.clusters.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
          {agg.clusters.map((c) => (
            <span
              key={c.reason}
              className="rounded-md border border-fail/30 bg-fail/10 px-2 py-1 font-mono text-[10.5px] text-fail"
            >
              {c.reason} ×{c.count}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
