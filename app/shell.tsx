"use client";

import { useState } from "react";
import { DemoBadge } from "@/components/Badge";
import { Compare } from "@/components/Compare";
import { Evals } from "@/components/Evals";
import { Judge } from "@/components/Judge";
import { AppProvider, ModelPicker, useApp } from "@/components/ModelPicker";
import { Playground } from "@/components/Playground";
import { TraceView } from "@/components/TraceView";
import type { RunBotResponse, Span } from "@/lib/types";

const TABS = [
  { id: "playground", label: "Playground", slide: "S2 · non-determinism" },
  { id: "evals", label: "Evals", slide: "S44 / S75 · scoring + error analysis" },
  { id: "compare", label: "Compare", slide: "S104 · cost vs quality" },
  { id: "judge", label: "Judge", slide: "S64 · calibration" },
  { id: "trace", label: "Trace", slide: "S92 · observability" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Shell({ apiKeyPresent }: { apiKeyPresent: boolean }) {
  return (
    <AppProvider apiKeyPresent={apiKeyPresent}>
      <Inner />
    </AppProvider>
  );
}

function Inner() {
  const { demo, demoReason } = useApp();
  const [tab, setTab] = useState<TabId>("playground");
  const [trace, setTrace] = useState<Span | null>(null);

  const onTrace = (r: RunBotResponse) => setTrace(r.trace);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-3 px-8 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-[22px] font-extrabold tracking-tight text-white">
              Support<span className="text-accent">Bot</span>
            </span>
            <span className="label">evals</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-5">
            <ModelPicker />
            {demo ? <DemoBadge reason={demoReason} /> : null}
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-6">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`group relative whitespace-nowrap px-4 py-3.5 text-left transition ${
                  active ? "text-white" : "text-muted hover:text-white/80"
                }`}
              >
                <span className="font-display text-[17px] font-semibold">{t.label}</span>
                <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.12em] opacity-60">
                  {t.slide}
                </span>
                <span
                  className={`absolute inset-x-3 bottom-0 h-[3px] rounded-t ${
                    active ? "bg-accent" : "bg-transparent"
                  }`}
                />
              </button>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-[1600px] px-8 py-8">
        {tab === "playground" ? <Playground onTrace={onTrace} /> : null}
        {tab === "evals" ? <Evals /> : null}
        {tab === "compare" ? <Compare /> : null}
        {tab === "judge" ? <Judge /> : null}
        {tab === "trace" ? <TraceTab trace={trace} setTrace={setTrace} /> : null}
      </main>
    </div>
  );
}

function TraceTab({
  trace,
  setTrace,
}: {
  trace: Span | null;
  setTrace: (s: Span | null) => void;
}) {
  const [loading, setLoading] = useState(false);

  async function loadLast() {
    setLoading(true);
    try {
      const res = await fetch("/api/run-bot", { cache: "no-store" });
      const data = await res.json();
      if (data?.last?.trace) setTrace(data.last.trace as Span);
    } catch {
      /* the tab still renders whatever it already had */
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button className="btn" onClick={loadLast} disabled={loading}>
          {loading ? "Loading…" : "Load last run"}
        </button>
        <span className="font-mono text-[11px] text-muted">
          The trace from the most recent /api/run-bot call.
        </span>
      </div>
      <TraceView trace={trace} />
    </div>
  );
}
