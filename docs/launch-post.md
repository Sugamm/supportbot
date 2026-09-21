# Community release post — Product Hunt / p/vibecoding

**Title:** I vibecoded an AI evals playground, because "I tried it and it worked" is not testing

**Suggested images (in order):** `docs/screenshots/playground.png`, `docs/screenshots/evals.png`,
`docs/screenshots/compare.png`, `docs/screenshots/judge.png`, `docs/screenshots/trace.png`

---

Every LLM feature I've shipped has gone out on vibes. Type a prompt, read the answer,
think "yeah that's good," ship it. Then a user types something slightly different and the
thing falls over.

So I vibecoded the opposite: **SupportBot Evals** — a deliberately mediocre customer-support
bot, wrapped in the eval harness that proves it's mediocre. The bot is the prop. The evals
are the point. Next.js + TypeScript, no database, five tabs, one weekend.

Here's what it actually taught me about testing AI, in the order the tabs go:

**1. Run the same prompt twice.** Same message, same temperature, two visibly different
replies. That's the cold open, and it's the whole reason manual spot-checks are worthless.
You didn't test anything — you sampled once.

**2. Score a dataset, not a vibe.** 12 support messages with golden labels, `exact_match`
on the parsed JSON. My bot lands at 66.7%. A number you can defend beats a feeling you
can't.

**3. Read the failures, don't just count them.** Grouping the red rows names the bug for
you: *"severity inflated by angry tone."* The model was rating how angry someone sounded
instead of business impact. One prompt fix took `gpt-4o-mini` from 66.7% → 83.3%.

**4. Cost is part of quality.** Claude Sonnet 4.5 scores *exactly the same* 66.7% as
`gpt-4o-mini` on classification while costing **27× more**. Flip to agentic tool use and it
jumps to 100% while the cheap model stalls at 83.3%. Same two models, opposite verdict —
you only find that by measuring both axes.

**5. Calibrate the judge before you trust it.** Everyone reaches for LLM-as-judge. Almost
nobody checks it. Mine agrees with human labels 83.3% of the time — and it wobbles between
75% and 83.3% on identical inputs at temperature 0. The non-determinism from step 1 shows
up *inside your measurement tool*. A jury of 3 cheap models matches the expensive single
judge at less than half the cost — it doesn't raise the ceiling, it just stops you from
accidentally picking a bad judge.

Plus a trace view, because per-span latency and cost is the cheapest thing to add up front
and the most expensive thing to retrofit.

The honest part: the numbers above are measured, not marketing. Two rows fool every judge I
tried — the blunt-but-correct reply and the fabricated session log. I left them in.

Runs fully offline on cached fixtures if you don't want to plug in a key.

**Repo:** https://github.com/Sugamm/supportbot

What's the one eval you wish you'd written before shipping, not after?
