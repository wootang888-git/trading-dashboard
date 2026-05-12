# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build
npx tsc --noEmit     # TypeScript check (run before every commit)
eslint               # Lint
```

No test suite — verify changes by running `/test-signals` against the local dev server.

## Architecture

### Signal Engine (`lib/signals.ts`)

Three-layer pipeline called by both data paths:

1. **`computeIndicators(bars, high52w, spyBars, ticker)`** — computes 40+ technical indicators from OHLCV bars. The 4th `ticker` param fixes SPY RS reference equality (the old `bars === spyBars` check always returned false). Returns a single `Indicators` object. New indicators must be added to BOTH the `zero` fallback object AND the `return` statement (~60 lines apart) — missing either causes a TypeScript error.

2. **Strategy scorers** — four functions, each returning `{ score (0–10), entryNote, stopNote, conditions[] }`:
   - `scoreMomentumBreakout` — RSI 50–75, above MAs, near 52w high, volume surge
   - `scoreEMAPullback` — 8 EMA > 20 EMA, price tight to 8 EMA, bounce candle
   - `scoreMeanReversion` — RSI 25–50 (oversold), below MA20, above MA50, reversal candle
   - `scoreETFRotation` — above both MAs, RSI 50–70, volume confirmed, near 52w high

3. **`validateSignal` + `computeConviction`** — produces a 0–100 conviction score: 40 pts technical (score/10×40), 30 pts R:R tightness (≤3% risk = full points), 15 pts sector relative strength, 15 pts data quality.

4. **`computeADX(bars, 14)`** — Wilder ADX-based regime classifier. Returns `regime: "bull" | "bear" | "choppy"`. Regime gates: bull ADX>25 & +DI>-DI; bear ADX>25 & -DI>+DI; choppy ADX≤25.

5. **`computeStructuralTarget(entry, stop, high52w, latestClose, atr14, ema8, regime)`** — returns `{ target, rrRatio, mode: "fixed"|"trail" }`. Three modes in priority order:
   - **Trail mode** (price ≥ 99.5% of 52w high): target = `min(max(close − 1.5×ATR, ema8), close×0.999)` — clamped so trail stop never sits above close (prevents spurious EXIT on ATH entry day).
   - **ATR projection** (bull regime AND price 94–99.4% of 52w high AND atr14 > 0): target = `close + 2.5×ATR`. R:R computed honestly — not hardcoded. Prevents the 52w high from acting as an upside ceiling for confirmed breakout candidates.
   - **Fixed mode**: target = 52w high (primary resistance ceiling).
   Minimum R:R is **2.0:1**. Gate `rrBelowMinimum` fires when `rrRatio < 2.0`. In bull regime with isNear52wHigh + conviction ≥ 70 + no death cross + RSI/BB not extended → routes to **BREAKOUT_WATCH**. Otherwise routes to OBSERVE.
   `regime` must be computed before this function is called — `computeADX(bars)` runs first in `buildSignal`.

### Stop / Entry Prices (critical)

`SignalCard.tsx` receives `stopPrice: number`, `entryPrice: number`, `structuralTarget?: number`, `rrAchievable?: number`, and `trailMode?: boolean` as **direct numeric props**. R:R is computed from `structuralTarget` (backend) — **not** from `entryPrice + 3 * risk`. The legacy `entryPrice + 3 * risk` formula is only used as a fallback for old data without `structuralTarget`.

**Conviction thresholds are regime-modulated** (not fixed):
- Bull (ADX>25, trending up): HIGH_CONVICTION requires conviction > 82
- Choppy (ADX≤25, ranging): HIGH_CONVICTION requires conviction > 75
- Bear (ADX>25, trending down): HIGH_CONVICTION requires conviction > 90 AND R:R ≥ 3.0

> ⚠️ `parseFirstPrice`/`parseLastPrice` regex helpers do NOT exist. An external audit (2026-04-13) falsely flagged R:R parsing as a live critical bug because prior docs were stale.

### Data Flow — Two Parallel Paths (must stay in sync)

```
1. app/page.tsx  (ISR server component — initial page load, revalidate 300s)
   → getWatchlist(), getHistorical(), getQuote(), getNews(), getFinnhubData()
   → enrichedSignals map: calls computeNbaDirective() + getSignalStreaks()
   → passes `initial` prop to <SignalDashboard>

2. app/api/signals/route.ts  (API route — client Refresh Now every 5 min)
   → same fetches as above, same enrichment, same sa{} shape
   → SignalDashboard polls this and replaces data state
```

**These two paths are parallel implementations of the same pipeline and must be kept identical.**  
When adding a field to the signal shape, update all three locations: `app/page.tsx`, `app/api/signals/route.ts`, and the `SignalData` type in `components/SignalDashboard.tsx`. TypeScript will catch mismatches at compile time — `npx tsc --noEmit` is the required check.

Server components must NOT call their own API routes (`fetch('/api/...')`) — Vercel ISR returns empty results. Import `lib/` functions directly and use `export const revalidate = 300` on the page.

### NBA Directive vs Tier — two separate systems

- `tier` (HIGH_CONVICTION, TACTICAL_BUY, WATCH_EXTENDED, BREAKOUT_WATCH, OBSERVE, EXIT) — rule-based; conviction score + hard gates
- `nbaDirective` (SCALE_IN, HOLD_TRAIL, HARVEST, WATCH, OBSERVE_WARN, EXIT, NOISE) — action signal; tier + ML score + streak + price vs EMA
- **Never mix them as the source of truth for the same thing.** Banner pills count by directive; dashboard sections must also filter by directive — otherwise counts visibly mismatch
- SCALE_IN ≠ HIGH_CONVICTION: SCALE_IN requires Day 3+ AND rising ML delta on top of HIGH_CONVICTION tier
- BREAKOUT_WATCH always produces `nbaDirective === "WATCH"` — never SCALE_IN. It is explicitly excluded from the Build Position SCALE_IN filter to prevent duplicate cards.

### Dashboard Section → Filter Mapping

| Section | Filter |
|---|---|
| Build Position | Sub-A: `nbaDirective === "SCALE_IN" && tier !== "BREAKOUT_WATCH"` / Sub-B: `tier === "HIGH_CONVICTION" && nbaDirective !== "SCALE_IN"` |
| Trend Riding | `nbaDirective === "HOLD_TRAIL"` |
| Blue Sky Watch | `tier === "BREAKOUT_WATCH"` |
| Overheated — Wait | `tier === "WATCH_EXTENDED"` |
| Not Yet | `tier !== "WATCH_EXTENDED" && tier !== "BREAKOUT_WATCH" && (tier === "OBSERVE" \|\| nbaDirective === "WATCH" \|\| nbaDirective === "OBSERVE_WARN")` + EXIT tier cards pinned to top |

No standalone "Exit Now" section — EXIT cards float to top of "Not Yet" via sort. HARVEST is card-level only (gold pill), not a section. Banner pill "Scale In" count = SCALE_IN directive length.

### Key Files

| File | Purpose |
|---|---|
| `lib/signals.ts` | All indicator math + 4 strategy scorers + validation + conviction + computeNbaDirective |
| `lib/yahoo.ts` | Yahoo Finance wrappers: `getQuote`, `getHistorical`, `getIntraday`, `getNews` |
| `lib/finnhub.ts` | Finnhub analyst consensus: `getFinnhubData(ticker)` → `{ bullishPct, bearishPct, analystCount, label }`. 6h in-memory cache. FREE: `/stock/recommendation`. PAID (not used): `/news-sentiment`, `/stock/price-target`. |
| `lib/supabase.ts` | DB ops + in-process cache for `signal_weights` (6h TTL) |
| `lib/watchlist.ts` | Static `WATCHLIST[]` fallback + `SECTOR_ETF` map (ticker → sector ETF) |
| `lib/backtest.ts` | Walk-forward backtest engine; run locally (Vercel 60s timeout) |
| `components/SignalCard.tsx` | Expandable card: metric tiles, conditions, trade notes, chart, news, Finnhub analyst row |
| `components/FAQModal.tsx` | Contextual help panel; `mode="conviction"` or `mode="ml"`. **Update section names here after every section rename in SignalDashboard.tsx.** |
| `components/StepperInput.tsx` | Mobile-friendly `−`/`+` number input (44px tap targets); use instead of `<input type="number">` |
| `components/StockChart.tsx` | lightweight-charts: candlesticks, 8/20 EMA, BB bands, R:R overlay |
| `app/api/signals/route.ts` | API route: orchestrates all fetching + scoring (client refresh path) |
| `app/api/chart-data/route.ts` | Serves OHLCV bars; aggregates 30m → 2h/4h in-process |

### Mobile UX Design Rule

**Mobile-first product used on handheld phones. Core meaning must be visible without any gesture.**

- Hover tooltips are invisible on mobile — use only for optional secondary context
- Use `FAQModal` (tap-to-open bottom sheet), always-visible inline text, or tap-to-expand (`useState`)
- Use `StepperInput` instead of `<input type="number">` — spinners hidden on mobile Safari/Chrome
- Never add `hidden sm:block` to interactive elements that are the only mobile entry point

### Supabase Tables

`watchlist` · `trades` · `signal_weights` · `signal_history` · `backtest_results` · `ml_scores` · `ml_performance` · `ml_health`

**RLS policy for `trades` and `watchlist`:** `USING ((user_id IS NULL) OR (auth.uid() = user_id))` covering `authenticated, anon`. Never change to `TO authenticated` only — silently empties the journal when using the anon key without a session.

`signal_weights` is populated by `POST /api/backtest` (runs 100+ tickers × 5 years — run locally, not on Vercel).

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
RAPIDAPI_KEY=           # optional — Seeking Alpha articles via /api/sa-articles
FINNHUB_API_KEY=        # optional — Finnhub analyst consensus (free tier, 60 req/min)
```

### SAInfo shape (SignalCard `sa` prop)

```typescript
interface SAInfo {
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
  newsUrl: string | null;
  newsPublisher: string | null;
  finnhubLabel: "bullish" | "bearish" | "neutral" | null;
  finnhubBullishPct: number | null;
  finnhubAnalystCount: number | null;
  analystTargetMean: number | null;  // always null (paid endpoint)
  analystUpside: number | null;      // always null (paid endpoint)
}
```

Defined in three files — must be kept in sync: `components/SignalCard.tsx`, `components/SignalDashboard.tsx`, `app/page.tsx`, `app/api/signals/route.ts`.

## Lessons Learned

### Dual data path parity — the #1 source of page-load vs refresh inconsistency
When changing enrichment logic in `route.ts`, apply the identical change to `page.tsx`. The `enrichedSignals` map in `page.tsx` and the per-ticker block in `route.ts` must compute and attach the same fields. Missing `computeNbaDirective()` or `getSignalStreaks()` in `page.tsx` caused Trend Riding / Build Position sections to appear empty on load but populated after Refresh Now (2026-05).

Pre-push check: `grep -n "computeNbaDirective\|getSignalStreaks" app/page.tsx app/api/signals/route.ts` — both files must show results.

### ML score display convention
Always show `ml_score_pct` (integer 0–100) as `74%`. Never show `ml_score` (0.0–1.0 float) directly to users.

### Conflicting card pills — EXIT suppresses trend chips
Suppress "↑ Momentum Building" and "↓ Thesis Weakening" chips when `nbaDirective === "EXIT"`. Both can be technically true simultaneously but contradict each other for a novice. EXIT is the definitive action.

### Trade Journal targetBuffer sign convention
`targetBuffer = (target - livePrice) / entryPrice * 100`. Negative = price is ABOVE the 3:1 target. Check `targetBuffer <= 0` → "Target Achieved" BEFORE `targetBuffer < 5` → "Near Target" — negative values otherwise match Near Target.

### UX language — coaching, not finance jargon
Brainstorm 3–4 labeling options before implementing any section/terminology change. User tone: coaching/encouragement. Examples: "Build Position" not "Scale In Candidates", "Trend Riding" not "Hold/Trail", "Not Yet" not "Observe".

### GARCH coverage
`garch_vol` in `ml_scores` is used only in `CalculatorModal` (position sizing). Does NOT affect conviction scores. If null: check `ml_scores.garch_vol` in Supabase → check `score_date` freshness → check GitHub Actions logs.

### yahoo-finance2 v3 breaking change
Must instantiate as a class: `const YF = require('yahoo-finance2').default; const yf = new YF({ suppressNotices: ['yahooSurvey'] })`. The old `import yahooFinance from 'yahoo-finance2'` throws "Call new YahooFinance() first".

### Next.js server component data fetching
Server components must NOT use `fetch()` to call their own API routes — empty results during Vercel ISR. Import and call data functions directly. Use `export const revalidate = 300` on the page.

### Vercel deployment
- Vercel CLI auto-injects content into CLAUDE.md and creates AGENTS.md — delete this content
- Env vars set in the Vercel UI before a CLI deploy don't carry over to the CLI-created project — re-add with `npx vercel env add`
- After any deployment, ISR cache may serve old HTML for up to 5 min. Append `?_vercel_no_cache=1` to force a fresh render for diagnosis

### Untracked files cause silent Vercel build failures
Before every commit that adds a new `import`, run `git status` and confirm all referenced files are staged. New files are never auto-staged. The `/pre-push-check` skill automates this check.

### External tools must not change code directly
Gemini/GPT proposals are input for `/assess-proposal`, not ready-to-apply patches. A Gemini-injected CatBoost ensemble in 2026-04 broke `score_live.py` and required a full revert.

### External audit reports — verify against live code before acting
Before acting on any external audit, grep for the claimed functions/patterns and cross-reference CLAUDE.md. False positives have occurred (2026-04-13 audit flagged already-fixed bugs as live issues).

### Preventing documentation drift
Update CLAUDE.md in the same commit as any refactor that changes a key mechanism. Use `/learn` after any session that changes architecture. If CLAUDE.md and live code conflict, **trust the code**.
