Review the project backlog, score each item by swing trader impact vs build effort, and propose a sprint scope for the current session.

## Context

SwingAI is a swing trading signal dashboard. Every decision should be evaluated through one lens: does this help a swing trader find higher-conviction setups faster?

Key files:
- Plan file: `~/.claude/plans/` (most recently modified file)
- Signal engine: `lib/signals.ts`
- Main page: `app/page.tsx`
- Signal card: `components/SignalCard.tsx`
- Project knowledge: `CLAUDE.md`

## Phase 1: Read Current State

1. Find the plan file: `ls -t ~/.claude/plans/ | head -1`, then read it fully.
2. Read `CLAUDE.md` for lessons learned and hard rules.
3. Read the `Indicators` interface at the top of `lib/signals.ts` — this tells you exactly what is already built.
4. Skim `components/SignalCard.tsx` (first 55 lines) — see what fields are exposed to the UI.
5. Skim `app/page.tsx` — understand current page structure and any obvious UI gaps.

Focus on interfaces, exports, and comments — not every line.

## Phase 2: Enumerate Backlog Items

List every pending item from the plan file. If no plan file exists, ask the user to describe the backlog before continuing.

Group items into two tracks — they can be executed in parallel across sessions:
- **Signal / Engine track**: New indicators, scoring changes, new strategies, stop-loss improvements, watchlist changes
- **UI / UX track**: Dashboard layout, new pages, data display, mobile improvements, new components

## Phase 3: Score Each Item

For each item assess:

**Swing trader impact:**
- High: directly filters signals, improves entries/stops, surfaces risk (earnings, bear market)
- Medium: improves workflow efficiency or adds useful context
- Low: cosmetic, informational, or speculative

**Build effort:**
- Low: change logic in one function, reuses already-computed data
- Medium: new helper function + 2–3 file changes
- High: new data source, new page, new DB schema, or external API integration

Produce a prioritized table sorted by impact desc, effort asc within the same impact tier:

| Item | Track | Impact | Effort | Notes |
|------|-------|--------|--------|-------|
| ...  | Engine | High | Low | Already partially built? |

## Phase 4: Effort Reality Check

Before finalizing estimates, check for each item:
- Is it already partially built? Grep the `Indicators` interface in `lib/signals.ts` for related field names.
- Does it require a new external API? If yes, flag it — do not evaluate or trial the API unless the user explicitly asks. External API evaluation is a time sink that often ends in "skip for now."
- Does it require a new Supabase table? If yes, note "needs SQL migration" — that adds setup time.

## Phase 5: Sprint Recommendation

Propose a scope that fits roughly one session:

1. Recommend 1–3 items ordered by execution sequence (dependencies first).
2. Flag items where the estimate is uncertain — explain why.
3. Call out any "quick wins" (Low effort, any impact) that can be done alongside a main item.
4. Explicitly name what is being deferred and why.

Format:

**Recommended sprint:**
1. [Item A] — highest value because...
2. [Item B] — quick win, ~30 min

**Deferred:**
- [Item C] — High effort, requirements unclear
- [Item D] — Needs external API (defer until user confirms access)

## Phase 6: Confirm Before Building

Present the table and recommendation. Ask:

"Does this sprint scope look right, or would you like to adjust priorities before I start building?"

Do not write any code until the user confirms.

## Rules

- Do not evaluate external APIs unless the user explicitly asks. (Trovest.io evaluation cost a full session with zero shipped output.)
- Always check if an item is already partially built before estimating effort — many Sprint 1/2 indicators exist in `lib/signals.ts`.
- Keep signal/engine and UI/UX items in separate tracks — they can run in parallel across sessions.
- If the plan file does not exist or is out of date, ask the user to narrate the backlog before scoring.
- "Low effort" assumes all required data is already computed in `computeIndicators()`. If new data is needed, reclassify as Medium or High.
