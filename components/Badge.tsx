"use client";

import type { ReactNode } from "react";

type Tone = "pass" | "fail" | "muted" | "accent" | "warn";

const TONES: Record<Tone, string> = {
  pass: "border-accent/40 bg-accent/15 text-accent",
  fail: "border-fail/40 bg-fail/15 text-fail",
  warn: "border-warn/40 bg-warn/15 text-warn",
  muted: "border-line bg-white/5 text-muted",
  accent: "border-accent/50 bg-accent text-black",
};

export function Badge({
  tone = "muted",
  children,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.1em] ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function PassFail({ pass, label }: { pass: boolean; label?: string }) {
  return (
    <Badge tone={pass ? "pass" : "fail"}>
      {pass ? "PASS" : "FAIL"}
      {label ? <span className="opacity-70">{label}</span> : null}
    </Badge>
  );
}

/** Shown whenever a response came from data/fixtures.ts instead of the API. */
export function DemoBadge({ reason }: { reason?: string }) {
  return (
    <span
      title={reason ? `Fell back because: ${reason}` : "Serving cached fixture results"}
      className="inline-flex items-center gap-2 rounded-md border border-warn/50 bg-warn/15 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-warn"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warn" />
      Demo mode (cached)
    </span>
  );
}
