Modify entry conditions, stop-loss logic, scoring weights, or R:R parameters across one or more of the four SwingAI strategies.

## Context

All four strategies live in `lib/signals.ts`:
- `scoreMomentumBreakout` (~line 294)
- `scoreEMAPullback` (~line 372)
- `scoreMeanReversion` (~line 459)
- `scoreETFRotation` (~line 532)

Each returns `{ score, entryNote, stopNote, conditions }`.

The `entryNote` and `stopNote` strings are parsed by `components/SignalCard.tsx`:
- `parseFirstPrice(note)` — reads the **first** `$X.XX` in the string → used for **stop price**
- `parseLastPrice(note)` — reads the **last** `$X.XX` in the string → used for **entry price**

These parsers drive the R:R calculation and the position size calculator pre-fill. Breaking the string format corrupts every card silently — TypeScript will not catch it.

**Current R:R: 3:1** — target formula is `entry + 3 × risk`. Last changed from 2:1 in session 2026-03-30.

## Phase 1: Read Before Touching (Required)

Read these three files before writing a single line of code:

1. `lib/signals.ts` — understand the current stop anchor, ATR buffer, and fallback for each strategy. Note `recentSwingLow` usage from `detectTrendStructure`.
2. `components/SignalCard.tsx` lines 1–55 — internalize `parseFirstPrice` and `parseLastPrice`.
3. `app/calculator/page.tsx` lines 1–40 — see the current target formula and label string.

Do not skip this phase.

## Phase 2: Design the Change

For each strategy being modified, write out the design before coding:

**Stop-loss design:**
- Structural anchor? (swing low, EMA level, MA level, candle low)
- ATR buffer multiplier? (typically 0.3–1.0× ATR)
- Fallback when `recentSwingLow` is null? (new stock, <30 bars of history)

**Current stop anchors (as of 2026-03-30):**
| Strategy | Anchor | Buffer | Fallback |
|---|---|---|---|
| Momentum Breakout | `recentSwingLow` | −0.5× ATR | entry − 1.5× ATR |
| EMA Pullback | lower of `ema8 × 0.985` or `recentSwingLow` | −0.3× ATR | `ema8 × 0.99` |
| Mean Reversion | `recentSwingLow` | −1.0× ATR | `candle_low − 1× ATR` |
| ETF Rotation | `ma20 × 0.99` | — | `latest.low` |

**⚠️ Stop note string format — non-negotiable:**
The stop price dollar amount MUST be the FIRST `$X.XX` in the `stopNote` string.

✅ Correct: `Stop $198.45 (below swing low $202.10 − 0.5× ATR $3.65)`
❌ Wrong: `Below swing low $202.10, stop at $198.45` — stop is not first, corrupts R:R

**⚠️ Entry note string format — non-negotiable:**
The entry price dollar amount MUST be the LAST `$X.XX` in the `entryNote` string.

✅ Correct: `Buy stop $0.05 above $215.30 (today's high / resistance)` — last number is entry
❌ Wrong: `Buy above resistance $215.30 — add $0.05 buffer` — entry is not last, corrupts R:R

## Phase 3: Implement in lib/signals.ts

For each strategy function:

1. Update the stop price calculation using the structural anchor + ATR buffer pattern:
   ```typescript
   const swingStop = ind.recentSwingLow !== null && ind.atr14 > 0
     ? ind.recentSwingLow - N * ind.atr14
     : null;
   const fallbackStop = /* MA-based or ATR-from-low fallback */;
   const stopPrice = swingStop ?? fallbackStop;
   ```
2. Update `stopLabel` — ensure the computed `stopPrice` appears first in the string.
3. Update `entryNote` if entry logic changes — ensure trigger price is last in the string.
4. Update `conditions[]` if any entry gates are being added or removed.
5. Update score bonuses if weights are changing.

## Phase 4: Update R:R Dependents (Only If Ratio Changes)

If the R:R multiplier is changing, update all three locations atomically:

1. `components/SignalCard.tsx` — find `entryPrice + 3 * risk`, update the multiplier
2. `app/calculator/page.tsx` — find `entryNum + 3 * riskPerShare`, update the multiplier AND the label `"Target (3:1 R:R)"`
3. Update any `CLAUDE.md` documentation referencing the old ratio

If only stop anchors or entry conditions are changing (not the multiplier), skip this phase entirely.

## Phase 5: TypeScript Check

```bash
cd "/Users/henrywoo/Claude Folder/trading-dashboard" && npx tsc --noEmit
```

TypeScript cannot catch stop/entry string format bugs — those require Phase 6.

## Phase 6: Manual Verification (Do Not Skip)

Run `/test-signals` to get live signal output, then verify:

1. Pick one signal card per modified strategy and inspect the `stopNote` string:
   - Is the stop price the first dollar amount?
   - Is the stop price **realistic**? On a $50 stock, a stop should typically be $1–5 below entry. A stop $0.30 away is too tight; $12 away likely means a fallback is misfiring.

2. Verify R:R math: `(target − entry) / (entry − stop)` should equal the intended ratio (e.g., 3.0).

3. Check the calculator: open `/calculator?entry=<X>&stop=<Y>` with values from a real card. The "Target (3:1 R:R)" line should show the correct target price.

4. Confirm that cards where `recentSwingLow` is null show a valid fallback stop (not `NaN` or `$0.00`).

## Phase 7: Deploy

Run `/deploy`.

## Rules

- Stop price is always the FIRST dollar amount in `stopNote`. Read by `parseFirstPrice` in `SignalCard.tsx`. Never restructure the string without re-verifying this.
- Entry price is always the LAST dollar amount in `entryNote`. Read by `parseLastPrice` in `SignalCard.tsx`. Never restructure the string without re-verifying this.
- Every strategy needs a fallback stop for when `recentSwingLow` is null. This happens on tickers with fewer than 30 bars or very flat price action.
- Current R:R is 3:1. If changing this, update `SignalCard.tsx` AND `app/calculator/page.tsx` AND the label string — all three, same session.
- Do not change scoring weights for multiple strategies simultaneously without testing each separately — a +1 across all 4 strategies can shift a dozen cards between strength tiers unexpectedly.
- Read Phase 1 files before writing. No exceptions.
