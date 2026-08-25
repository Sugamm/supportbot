"use client";

import { useState } from "react";
import { Badge } from "./Badge";
import { Metric } from "./MetricBar";
import { useApp } from "./ModelPicker";
import { formatUsd } from "@/lib/pricing";
import type { RunBotResponse } from "@/lib/types";

const EXAMPLES = [
  "refund my order 4471",
  "I want a refund for order 9999",
  "you people are useless, fix this garbage now",
  "what's my current account balance?",
  "let me talk to a human",
];

export function Playground({ onTrace }: { onTrace: (r: RunBotResponse) => void }) {
  const { models, reportDemo } = useApp();
  const [message, setMessage] = useState("I want a refund for order 9999");
  const [temperature, setTemperature] = useState(0.8);
  const [result, setResult] = useState<RunBotResponse | null>(null);
  const [busy, setBusy] = useState<"" | "once" | "twice">("");

  async function run(twice: boolean) {
    if (!message.trim()) return;
    setBusy(twice ? "twice" : "once");
    try {
      const res = await fetch("/api/run-bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          temperature,
          twice,
          generatorModel: models.generatorA,
        }),
      });
      const data: RunBotResponse = await res.json();
      setResult(data);
      onTrace(data);
      reportDemo(data.demo, data.demoReason);
    } catch {
      reportDemo(true, "network error reaching /api/run-bot");
    } finally {
      setBusy("");
    }
  }

  const differ =
    result?.answerB !== undefined && result.answerB.trim() !== result.answer.trim();

  return (
    <div className="space-y-6">
      <section className="panel p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[320px] flex-1">
            <div className="label mb-2">Customer message</div>
            <input
              className="input"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) run(false);
              }}
              placeholder="type a customer message…"
            />
          </div>
          <div>
            <div className="label mb-2">Temperature · {temperature.toFixed(1)}</div>
            <input
              type="range"
              min={0}
              max={1.5}
              step={0.1}
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="h-2 w-56 cursor-pointer appearance-none rounded-full bg-white/10 accent-[#C7F94C]"
            />
          </div>
          <button className="btn" disabled={Boolean(busy)} onClick={() => run(false)}>
            {busy === "once" ? "Running…" : "Run"}
          </button>
          <button
            className="btn btn-accent"
            disabled={Boolean(busy)}
            onClick={() => run(true)}
            title="Fires the answer capability twice at the same temperature"
          >
            {busy === "twice" ? "Running twice…" : "Run same prompt twice"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="label mr-1">Try</span>
          {EXAMPLES.map((e) => (
            <button
              key={e}
              onClick={() => setMessage(e)}
              className="rounded-md border border-line bg-surface2 px-2.5 py-1 font-mono text-[11px] text-muted transition hover:border-white/25 hover:text-white"
            >
              {e}
            </button>
          ))}
        </div>
      </section>

      {result ? (
        <>
          <div className="panel flex flex-wrap divide-x divide-line">
            <Metric
              label="Total latency"
              value={`${result.totals.latencyMs}ms`}
              sub="whole request"
            />
            <Metric
              label="Total cost"
              value={formatUsd(result.totals.costUsd)}
              sub={`${result.totals.tokensIn} in / ${result.totals.tokensOut} out`}
              tone="accent"
            />
            <Metric
              label="Model"
              value={models.generatorA.split("/")[1] ?? models.generatorA}
              sub={models.generatorA}
            />
          </div>

          {result.answerB !== undefined ? (
            <section className="panel p-6">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-display text-xl font-semibold">
                  Same prompt. Same temperature. Twice.
                </h3>
                <Badge tone={differ ? "fail" : "muted"}>
                  {differ ? "outputs differ" : "outputs identical this time"}
                </Badge>
                <span className="ml-auto font-mono text-[11px] text-muted">
                  temperature {temperature.toFixed(1)}
                </span>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <RunPane label="Run 1" text={result.answer} differ={differ} />
                <RunPane label="Run 2" text={result.answerB} differ={differ} />
              </div>
              <p className="mt-4 max-w-[90ch] font-mono text-[12px] leading-relaxed text-muted">
                Nothing changed between these two calls except the sampling. This is why
                &quot;I tried it and it worked&quot; is not evidence, and why a single manual
                spot-check tells you almost nothing about the system you are shipping.
              </p>
            </section>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="panel p-6">
              <div className="label mb-3">Classification</div>
              {result.classification ? (
                <div className="space-y-3">
                  <div className="font-display text-3xl font-semibold text-accent">
                    {result.classification.category}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="label">Severity</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={`h-6 w-6 rounded font-mono text-[12px] leading-6 text-center ${
                            n <= result.classification!.severity
                              ? "bg-accent text-black"
                              : "bg-white/[0.06] text-muted"
                          }`}
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <Badge tone="fail">{result.classifyError ?? "no classification"}</Badge>
              )}
            </section>

            <section className="panel p-6 lg:col-span-2">
              <div className="label mb-3">Tool plan</div>
              {result.plan ? (
                <div className="space-y-4">
                  <p className="text-[13px] leading-relaxed text-white/75">
                    {result.plan.reasoning}
                  </p>
                  {result.toolResults.length === 0 ? (
                    <Badge tone="muted">no tools called</Badge>
                  ) : (
                    <ol className="space-y-2">
                      {result.toolResults.map((exec, i) => (
                        <li
                          key={`${exec.tool}-${i}`}
                          className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface2 px-3.5 py-2.5"
                        >
                          <span className="font-mono text-[11px] text-muted">{i + 1}</span>
                          <span className="font-mono text-[13px] text-white">{exec.tool}</span>
                          <span className="font-mono text-[11px] text-muted">
                            {JSON.stringify(exec.args)}
                          </span>
                          <Badge tone={exec.ok ? "pass" : "fail"}>
                            {exec.ok ? "ok" : "refused"}
                          </Badge>
                          <span className="ml-auto font-mono text-[11px] text-muted">
                            {exec.latencyMs}ms · local
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ) : (
                <Badge tone="fail">{result.planError ?? "no plan"}</Badge>
              )}
            </section>
          </div>

          <section className="panel p-6">
            <div className="label mb-3">Final answer</div>
            <p className="max-w-[95ch] text-[16px] leading-relaxed text-white/90">
              {result.answer}
            </p>
          </section>
        </>
      ) : (
        <div className="panel px-6 py-12 text-center">
          <p className="font-display text-lg text-white">Nothing run yet.</p>
          <p className="mt-2 font-mono text-[12px] text-muted">
            Hit &quot;Run same prompt twice&quot; first — it is the cold open.
          </p>
        </div>
      )}
    </div>
  );
}

function RunPane({ label, text, differ }: { label: string; text: string; differ: boolean }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        differ ? "border-fail/40 bg-fail/[0.05]" : "border-line bg-surface2"
      }`}
    >
      <div className="label mb-2">{label}</div>
      <p className="text-[15px] leading-relaxed text-white/90">{text}</p>
    </div>
  );
}
