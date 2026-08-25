"use client";

import { useState } from "react";
import { Badge } from "./Badge";
import { useSuiteRunner } from "./Evals";
import { Metric, Progress } from "./MetricBar";
import { ModelField, useApp } from "./ModelPicker";
import { judgeLabelledSet } from "@/data/judgeLabelled";
import { JUDGE_RUBRIC } from "@/lib/scorers";
import { formatUsd } from "@/lib/pricing";
import type { CalibrationResult } from "@/lib/types";

export function Judge() {
  const { models, setModel, setJury, reportDemo } = useApp();
  const [jury, setJuryMode] = useState(false);
  const [single, setSingle] = useState<CalibrationResult | null>(null);
  const [juryResult, setJuryResult] = useState<CalibrationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDisagreeOnly, setShowDisagreeOnly] = useState(false);
  const { run, progress } = useSuiteRunner("/api/calibrate");

  const result = jury ? juryResult : single;

  async function go() {
    setBusy(true);
    try {
      const mode = jury ? "jury" : "single";
      const data = await run<CalibrationResult>(
        { mode, models: jury ? models.jury : [models.judge] },
        judgeLabelledSet.length,
      );
      if (jury) setJuryResult(data);
      else setSingle(data);
      reportDemo(data.demo, data.demoReason);
    } catch {
      reportDemo(true, "network error reaching /api/calibrate");
    } finally {
      setBusy(false);
    }
  }

  const rows = result
    ? showDisagreeOnly
      ? result.rows.filter((r) => !r.agree)
      : result.rows
    : [];

  return (
    <div className="space-y-6">
      <section className="panel p-5">
        <div className="flex flex-wrap items-end gap-5">
          <div>
            <div className="label mb-2">Mode</div>
            <div className="flex gap-2">
              <button
                className={`btn ${!jury ? "btn-accent" : ""}`}
                onClick={() => setJuryMode(false)}
              >
                Single judge
              </button>
              <button
                className={`btn ${jury ? "btn-accent" : ""}`}
                onClick={() => setJuryMode(true)}
              >
                Jury of 3
              </button>
            </div>
          </div>

          {jury ? (
            <div className="flex flex-wrap gap-3">
              {models.jury.map((m, i) => (
                <ModelField
                  key={i}
                  label={`J${i + 1}`}
                  value={m}
                  onChange={(v) => setJury(i, v)}
                  width="w-[200px]"
                />
              ))}
            </div>
          ) : (
            <ModelField
              label="Judge"
              value={models.judge}
              onChange={(v) => setModel("judge", v)}
              width="w-[260px]"
            />
          )}

          <button className="btn btn-accent" disabled={busy} onClick={go}>
            {busy ? "Calibrating…" : "Run calibration"}
          </button>
          {progress ? <Progress done={progress.done} total={progress.total} /> : null}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <div className="label mb-2">Rubric (verbatim, in the judge system prompt)</div>
          <p className="max-w-[110ch] font-mono text-[12px] leading-relaxed text-white/70">
            {JUDGE_RUBRIC}
          </p>
        </div>
      </section>

      {result ? (
        <>
          <div className="panel flex flex-wrap divide-x divide-line">
            <Metric
              label="Agreement"
              value={`${result.agreementPct}%`}
              sub={`${result.agreeCount}/${result.total} cases`}
              tone="accent"
            />
            <Metric
              label="False pass"
              value={String(result.confusion.falsePass)}
              sub="judge said pass, human said fail"
              tone={result.confusion.falsePass > 0 ? "fail" : "default"}
            />
            <Metric
              label="False fail"
              value={String(result.confusion.falseFail)}
              sub="judge said fail, human said pass"
              tone={result.confusion.falseFail > 0 ? "fail" : "default"}
            />
            <Metric label="Cost" value={formatUsd(result.totalCostUsd)} sub="whole calibration" />
          </div>

          <div className="panel border-accent/30 bg-accent/[0.05] px-6 py-5">
            <div className="label mb-2 text-accent">The defensible sentence</div>
            <p className="font-display text-2xl font-semibold leading-snug text-white">
              This judge agrees with humans{" "}
              <span className="text-accent">{result.agreementPct}%</span> across{" "}
              <span className="text-accent">{result.total}</span> cases.
            </p>
            <p className="mt-2 max-w-[95ch] font-mono text-[12px] leading-relaxed text-muted">
              Not &quot;the LLM judge says we&apos;re at 92%&quot;. An unvalidated judge is an
              opinion with a number attached. This sentence is a measurement you can defend in a
              review.
            </p>
            {single && juryResult ? (
              <p className="mt-4 font-mono text-[13px] text-white/85">
                single {single.agreementPct}% → jury {juryResult.agreementPct}%{" "}
                <span
                  className={
                    juryResult.agreementPct >= single.agreementPct ? "text-accent" : "text-fail"
                  }
                >
                  ({juryResult.agreementPct >= single.agreementPct ? "+" : ""}
                  {Math.round((juryResult.agreementPct - single.agreementPct) * 10) / 10} pts)
                </span>
              </p>
            ) : (
              <p className="mt-4 font-mono text-[12px] text-muted">
                Run both modes to see whether the jury beats the single judge.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              className={`btn ${showDisagreeOnly ? "border-fail/60 text-fail" : ""}`}
              onClick={() => setShowDisagreeOnly((v) => !v)}
            >
              {showDisagreeOnly ? "Showing disagreements" : "Disagreements only"}
            </button>
            <span className="font-mono text-[11px] text-muted">
              {result.mode === "jury" ? `jury: ${result.models.join(", ")}` : result.models[0]}
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((r) => {
              const human = judgeLabelledSet[r.index - 1];
              return (
                <div
                  key={r.index}
                  className={`panel p-5 ${r.agree ? "" : "border-fail/40 bg-fail/[0.06]"}`}
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-[11px] text-muted">#{r.index}</span>
                    <span className="text-[14px] text-white">{r.input}</span>
                    <div className="ml-auto flex items-center gap-2">
                      <Badge tone={r.humanLabel === "pass" ? "pass" : "fail"}>
                        human {r.humanLabel}
                      </Badge>
                      <Badge tone={r.judgeLabel === "pass" ? "pass" : "fail"}>
                        judge {r.judgeLabel}
                      </Badge>
                      <Badge tone={r.agree ? "muted" : "fail"}>
                        {r.agree ? "agree" : "disagree"}
                      </Badge>
                    </div>
                  </div>

                  <p className="mt-3 border-l-2 border-line pl-4 text-[14px] leading-relaxed text-white/75">
                    {r.botOutput}
                  </p>

                  <div className="mt-3 grid gap-2 font-mono text-[11.5px] leading-relaxed md:grid-cols-2">
                    <div className="text-muted">
                      <span className="text-white/45">judge: </span>
                      {r.reason}
                    </div>
                    {human?.humanNote ? (
                      <div className="text-muted">
                        <span className="text-white/45">human: </span>
                        {human.humanNote}
                      </div>
                    ) : null}
                  </div>

                  {r.votes ? (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      {r.votes.map((v, i) => (
                        <span
                          key={i}
                          className={`rounded-md border px-2 py-1 font-mono text-[10.5px] ${
                            v.label === "pass"
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-fail/30 bg-fail/10 text-fail"
                          }`}
                          title={v.reason}
                        >
                          {v.model.split("/")[1] ?? v.model}: {v.label}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  <div className="mt-3 font-mono text-[10.5px] text-muted">
                    {r.latencyMs}ms · {formatUsd(r.costUsd)}
                  </div>
                </div>
              );
            })}
            {rows.length === 0 ? (
              <div className="panel px-6 py-8 text-center font-mono text-[12px] text-muted">
                No disagreements in this run.
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg text-white">Judge not calibrated yet.</p>
          <p className="mt-2 font-mono text-[12px] text-muted">
            {judgeLabelledSet.length} human-labelled cases are waiting. No generation step — the
            outputs are fixed, so only the judge varies.
          </p>
        </div>
      )}
    </div>
  );
}
