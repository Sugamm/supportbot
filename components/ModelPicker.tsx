"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

/**
 * Every model ID is user-editable. A model that OpenRouter has renamed or
 * retired should be a five-second fix on stage, never a hard failure.
 */
export const MODEL_SUGGESTIONS = [
  "openai/gpt-4o-mini",
  "openai/gpt-4o",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-3-haiku",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "meta-llama/llama-3.1-8b-instruct",
];

export interface Models {
  generatorA: string;
  generatorB: string;
  /** Deliberately a different family from generator A: cross-family judging. */
  judge: string;
  jury: string[];
}

// Verified live against OpenRouter. The 3.5-sonnet and gemini-flash-1.5 IDs in
// the original spec now 404 -- which is exactly why these fields are editable.
const DEFAULT_MODELS: Models = {
  generatorA: "openai/gpt-4o-mini",
  generatorB: "anthropic/claude-sonnet-4.5",
  judge: "anthropic/claude-sonnet-4.5",
  // Three families, all cheap. Measured on data/judgeLabelled.ts: this jury
  // agrees 83.3% where the single sonnet judge agrees 75%, at half the cost.
  jury: ["openai/gpt-4o-mini", "anthropic/claude-haiku-4.5", "google/gemini-2.5-flash"],
};

interface AppState {
  models: Models;
  setModel: (key: keyof Omit<Models, "jury">, value: string) => void;
  setJury: (index: number, value: string) => void;
  demo: boolean;
  demoReason?: string;
  /** Called by every tab after a fetch so the top-bar badge stays truthful. */
  reportDemo: (demo: boolean, reason?: string) => void;
  apiKeyPresent: boolean;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({
  children,
  apiKeyPresent,
}: {
  children: ReactNode;
  apiKeyPresent: boolean;
}) {
  const [models, setModels] = useState<Models>(DEFAULT_MODELS);
  const [demo, setDemo] = useState(!apiKeyPresent);
  const [demoReason, setDemoReason] = useState<string | undefined>(
    apiKeyPresent ? undefined : "no OPENROUTER_API_KEY set",
  );

  const setModel = useCallback((key: keyof Omit<Models, "jury">, value: string) => {
    setModels((m) => ({ ...m, [key]: value }));
  }, []);

  const setJury = useCallback((index: number, value: string) => {
    setModels((m) => {
      const jury = [...m.jury];
      jury[index] = value;
      return { ...m, jury };
    });
  }, []);

  const reportDemo = useCallback((isDemo: boolean, reason?: string) => {
    setDemo(isDemo);
    setDemoReason(isDemo ? reason : undefined);
  }, []);

  const value = useMemo(
    () => ({ models, setModel, setJury, demo, demoReason, reportDemo, apiKeyPresent }),
    [models, setModel, setJury, demo, demoReason, reportDemo, apiKeyPresent],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used inside <AppProvider>");
  return ctx;
}

export function ModelField({
  label,
  value,
  onChange,
  width = "w-[250px]",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  width?: string;
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="label whitespace-nowrap">{label}</span>
      <input
        className={`rounded-md border border-line bg-surface2 px-2.5 py-1.5 font-mono text-[12px] text-white outline-none focus:border-accent/60 ${width}`}
        value={value}
        spellCheck={false}
        list="model-suggestions"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** The slim top-bar picker: generator A/B and the judge. */
export function ModelPicker() {
  const { models, setModel } = useApp();
  return (
    <div className="flex flex-wrap items-center gap-4">
      <datalist id="model-suggestions">
        {MODEL_SUGGESTIONS.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <ModelField
        label="Gen A"
        value={models.generatorA}
        onChange={(v) => setModel("generatorA", v)}
      />
      <ModelField
        label="Gen B"
        value={models.generatorB}
        onChange={(v) => setModel("generatorB", v)}
      />
      <ModelField label="Judge" value={models.judge} onChange={(v) => setModel("judge", v)} />
    </div>
  );
}
