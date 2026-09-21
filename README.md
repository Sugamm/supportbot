# SupportBot Evals

A deliberately imperfect customer-support bot, and the eval harness that proves it.
The bot is the prop. The evals are the point.

![Evals tab: 12 classification cases scored with exact_match, four red rows, each failure
named](docs/screenshots/evals.png)

## Screens

Every screenshot below is a real run of this app in Demo mode, so the numbers match the
cached fixtures in `data/fixtures.ts`.

<details>
<summary><b>Playground</b> — the same prompt, twice, at the same temperature</summary>

![Playground tab: one customer message run twice, two different replies side by
side](docs/screenshots/playground.png)

</details>

<details>
<summary><b>Compare</b> — cost against quality, as one sentence</summary>

![Compare tab: gpt-4o-mini and claude-sonnet-4.5 both at 66.7% on classification, with
Sonnet costing 27.6x as much](docs/screenshots/compare.png)

</details>

<details>
<summary><b>Judge</b> — an LLM judge measured against human labels</summary>

![Judge tab: 83.3% agreement across 12 cases, one false pass and one false
fail](docs/screenshots/judge.png)

</details>

<details>
<summary><b>Trace</b> — nested spans, per-span latency and cost</summary>

![Trace tab: a handle_request root span over classify, agent_plan and two answer spans,
each with its own latency and cost](docs/screenshots/trace.png)

</details>

## Quickstart

```bash
cp .env.local.example .env.local   # 1. copy the env file
# 2. paste your OpenRouter key into OPENROUTER_API_KEY=
npm install                        # 3. install
npm run dev                        # 4. run
open http://localhost:3000         # 5. open
```

No key, no network, or a dead API mid-demo? Every screen still works. The app falls
back to cached fixture results in `data/fixtures.ts` and shows a **DEMO MODE (cached)**
badge in the top bar. Nothing goes blank on the projector.

## Model IDs are editable in the UI

Every model ID (Gen A, Gen B, Judge, and each of the three jury members) is a plain
text field in the top bar. If OpenRouter renames or retires a model between now and the
session, retype it on stage — a stale ID is never a hard failure. Suggestions are
attached to each field; the fallback price map lives in `lib/pricing.ts`.

Defaults (all verified live against OpenRouter):

| Role  | Model                                                                                |
| ----- | ------------------------------------------------------------------------------------ |
| Gen A | `openai/gpt-4o-mini`                                                                 |
| Gen B | `anthropic/claude-sonnet-4.5`                                                        |
| Judge | `anthropic/claude-sonnet-4.5`                                                        |
| Jury  | `openai/gpt-4o-mini`, `anthropic/claude-haiku-4.5`, `google/gemini-2.5-flash`        |

The judge is deliberately a different family from Gen A, so the judging is cross-family
rather than a model grading its own homework.

> Note: `anthropic/claude-3.5-sonnet` and `google/gemini-flash-1.5` now return
> **404 No endpoints found** on OpenRouter. That is exactly why every model ID is a
> text field — check the IDs against <https://openrouter.ai/models> on the morning of
> the session and retype any that have moved.

## Presenter checklist

| Slide       | Tab            | Do this                                                                                                                        |
| ----------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **S2**      | **Playground** | Type any message, hit **Run same prompt twice**. Two outputs, side by side, visibly different. That is the cold open.            |
| **S44/S75** | **Evals**      | Dataset `classification` → **Run suite**. Read the red rows. Then **Group by failure reason** — the clusters name themselves.    |
| **S104**    | **Compare**    | **Run A vs B**. Read the one sentence: "B is +N points more accurate and costs N× as much."                                     |
| **S64**     | **Judge**      | **Run calibration** on Single judge, read the agreement %. Flip to **Jury of 3**, run again — the delta is printed for you.      |
| **S92**     | **Trace**      | After any Playground run, open Trace. Nested spans, per-span latency and cost, and the note on why the parent span matters.      |

### Two extra beats worth hitting

- **Fix the prompt live (S75 payoff).** In `lib/supportbot.ts`, `classify()` uses
  `CLASSIFY_SYSTEM_PROMPT`. Change that one line to `CLASSIFY_SYSTEM_PROMPT_V2` (the
  improved prompt is already written, commented, directly above), save, and re-run the
  classification suite. Measured on this dataset:

  | Model             | Shipped prompt | V2 prompt |
  | ----------------- | -------------- | --------- |
  | `gpt-4o-mini`     | 66.7%          | **83.3%** |
  | `llama-3.1-8b`    | 41.7%          | **66.7%** |

  Requires a live API key — in Demo mode the cached fixtures do not change.

- **Fenced unpredictability (Evals → trajectory).** Row 4 (order `9999`) looks the order
  up and then *refuses* — no `issue_refund` — because it is outside the refund window,
  while row 1 (order `4471`) is eligible. In Demo mode row 2 calls `search_orders`
  instead of `lookup_order` and still passes, because the tiering list in
  `lib/scorers.ts` declares them equivalent; the row is tagged `tier:` rather than
  failed. Live, the models usually pick the canonical name, so the panel above the table
  tells you honestly whether a substitution fired on *this* run.

## What is deliberately broken

The classify system prompt is mis-specified on purpose: severity is defined by how the
message *sounds* rather than by business impact, and `churn_risk` is defined too narrowly
("has decided to cancel"). Nothing is hardcoded wrong — fix the prompt and the score
genuinely moves, which is what makes the error-analysis demo honest rather than theatre.

Measured clusters on the seeded dataset:

| Model                        | Score | Clusters                                                                                             |
| ---------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| `gpt-4o-mini` (Gen A)        | 66.7% | severity over-rated ×2, **severity inflated by angry tone** ×1, out-of-scope treated as answerable ×1 |
| `claude-sonnet-4.5` (Gen B)  | 66.7% | **severity inflated by angry tone** ×2, out-of-scope treated as answerable ×1, severity under-rated ×1 |
| `meta-llama/llama-3.1-8b`    | 41.7% | severity over-rated ×3, **churn_risk read as another category** ×1, + 3 more                          |

The tone-inflation cluster is rock solid on every model. The **churn_risk → wrong
category** cluster only appears on genuinely weak models — `gpt-4o-mini` is good enough
to spot a competitor mention, and the prompt was not contorted further just to force it.
If you want that cluster on stage, type `meta-llama/llama-3.1-8b-instruct` into the Gen A
field and re-run: it drops to 41.7% and the cluster appears.

Trajectory tells the opposite story: `gpt-4o-mini` scores 83.3% (it looks up order 4471
but never issues the refund), while `claude-sonnet-4.5` scores 100% — at 27× the cost.
Classification is where the expensive model buys you nothing; agentic tool use is where
it earns its money. That contrast is the whole Compare tab.

## About the judge numbers (read before you present S64)

Measured agreement against the 12 human labels in `data/judgeLabelled.ts`:

| Judge                              | Agreement | Cost / run |
| ---------------------------------- | --------- | ---------- |
| `anthropic/claude-haiku-4.5`       | 91.7%     | $0.0050    |
| `google/gemini-2.5-flash`          | 91.7%     | $0.0015    |
| `anthropic/claude-sonnet-4.5` (default) | 75–83.3% | $0.0159 |
| `openai/gpt-4o-mini`               | 83.3%     | $0.0005    |
| `google/gemini-2.5-flash-lite`     | 75%       | $0.0003    |
| `anthropic/claude-3-haiku`         | 58.3%     | $0.0012    |
| **Jury of 3 (majority vote)**      | **83.3%** | $0.0070    |

Two honest caveats worth saying out loud rather than hiding:

1. **The jury matches the default single judge; it does not beat every single judge.**
   It reliably beats the weak ones (58.3%, 75%) and costs less than half the strong
   Sonnet judge. The real lesson is that a majority vote buys you *robustness against
   picking a bad judge*, not a higher ceiling. Two of the individual judges score higher
   than the jury on this set.
2. **Agreement moves between runs**, even at temperature 0 — the Sonnet judge lands
   anywhere from 75% to 83.3% on the same 12 cases. That is itself the S2 lesson showing
   up inside your measurement tool, and it is worth pointing at.

Both judges reliably disagree with the humans on the same two rows: the **blunt-but-correct**
reply (row 6, judges over-weight tone) and the **fabricated session log** (row 10, only
strong models catch the invention). Those two rows are the point of the set.

## Architecture

```
app/
  layout.tsx            dark theme, fonts
  page.tsx              server component: reads the key, renders the shell
  shell.tsx             tab shell: Playground | Evals | Compare | Judge | Trace
  api/
    run-bot/route.ts    one message -> classify + agent plan + tools -> trace
    run-suite/route.ts  dataset x model -> rows + scores + metrics (GET = progress)
    calibrate/route.ts  judge or jury over the labelled set -> agreement %
components/             Playground, Evals, Compare, Judge, TraceView, ResultsTable,
                        ScatterCostQuality, MetricBar, ModelPicker, Badge
lib/
  openrouter.ts         the single model-call wrapper. Server-side only.
  supportbot.ts         the system under test: classify, agent plan, answer, tools
  scorers.ts            exactMatch, llmJudge, trajectory (+ equivalence tiering)
  runner.ts             concurrency 4, progress, aggregation, fixture fallback
  pricing.ts            per-1M price map used when OpenRouter omits usage.cost
  trace.ts              nested tracer
  types.ts
data/
  classification.ts     12 rows, golden labels
  trajectory.ts         6 rows, ordered tool expectations
  judgeLabelled.ts      12 human-labelled outputs, no generation step
  fixtures.ts           cached results for every tab (Demo mode)
```

**No database.** All state is in-memory on the server plus the TS fixtures above.
Progress for a running suite lives in a `Map` in `lib/runner.ts`; the last trace lives in
a module variable in `app/api/run-bot/route.ts`. Restarting the dev server clears both,
which is fine — nothing here is meant to outlive the session.

**The key never reaches the browser.** `lib/openrouter.ts` reads `process.env` and is
only ever imported from route handlers and `app/page.tsx` (a server component, which
passes a single boolean down). The browser only talks to `/api/*`.

## Cost accounting

Every request sends `"usage": { "include": true }` and reads `response.usage.cost` when
OpenRouter returns it. When it does not, cost is computed from token counts against the
per-1M price map in `lib/pricing.ts`. **Confirm the current usage/cost field against the
OpenRouter docs before quoting numbers** — that field has changed shape before, and there
is a comment in `lib/openrouter.ts` saying so.
