Add a new technical indicator to the SwingAI signal engine. Walks through every required touch-point from design through deploy without missing a step.

## Context

The signal engine lives in `lib/signals.ts`. Indicators are computed once in `computeIndicators()`, then consumed by four strategy scorers: `scoreMomentumBreakout`, `scoreEMAPullback`, `scoreMeanReversion`, `scoreETFRotation`.

**Already built — do not duplicate:**
- Sprint 1: `upDayVolRatio`, `emaFanOpen`, `emaGapWidening`, `rsiInBullZone`, `ema10`, `ema50`
- Sprint 2: `isHigherHighs`, `isHigherLows`, `trendStructureIntact`, `recentSwingLow`, `rsVsSpy`, `rsRising`, `rsMakingNewHigh`

## Phase 1: Design

1. State what the new indicator measures and why it helps swing traders.
2. Rate confidence impact: Low / Medium / High (how much does it filter false signals?).
3. Rate build effort: Low (reuses existing data) / Medium (new math on existing bars) / High (new data source).
4. Grep for existing field names before writing anything — do not recompute something already computed:
   ```bash
   grep -n "fieldName" "lib/signals.ts"
   ```
5. If effort is High and impact is Low, stop and discuss with the user before continuing.

## Phase 2: Add to Indicators Interface

Edit the `Indicators` interface in `lib/signals.ts` (top of file):

```typescript
// Sprint N: Short description — what this measures, what threshold matters
myNewField: boolean;  // true when condition X holds
```

Use `boolean` for conditions, `number` for ratios/values, `number | null` when prerequisites (bar count, SPY data) may not be met.

## Phase 3: Add Helper Function

Add a named helper in the `// ─── Indicator helpers` section (before `computeIndicators`):

- Naming: `calc...` for numeric outputs, `detect...` for structural analysis
- Guard against insufficient bars at the top: `if (bars.length < N) return safeDefault;`
- Keep it pure — no side effects, no external calls

## Phase 4: computeIndicators — TWO Required Locations

⚠️ This is the most error-prone step. There are exactly two places to update:

**Location A — the `zero` fallback object** (near top of `computeIndicators`). Add the new field with a safe default. Missing this causes a TypeScript error because the return type won't satisfy `Indicators` when bars are empty.

```typescript
const zero: Indicators = {
  // ... existing fields ...
  myNewField: false,  // ADD HERE
};
```

**Location B — the `return` statement** (near bottom of `computeIndicators`). Add the computed value:

```typescript
return {
  // ... existing fields ...
  myNewField: computedValue,  // ADD HERE
};
```

Always update both in the same edit — they are ~60 lines apart.

## Phase 5: Add Scoring Bonus

Update whichever strategy functions the indicator applies to. Strategy locations in `lib/signals.ts`:
- `scoreMomentumBreakout` (~line 294)
- `scoreEMAPullback` (~line 372)
- `scoreMeanReversion` (~line 459)
- `scoreETFRotation` (~line 532)

For each relevant strategy, add:

```typescript
// Sprint N: Reason this matters for this strategy
if (ind.myNewField) score += 1;
```

Score bonuses: +1 for confirmatory, +2 for strong signal, +3 for primary setup condition. Total is capped at 10.

Add a condition pill to the `conditions[]` array at the bottom of each strategy function:

```typescript
{ label: "My label", met: ind.myNewField },
```

## Phase 6: UI Exposure (Only If Needed)

Skip unless the new field should appear as a metric tile on the card (not just a condition pill).

1. Add the field to the `indicators` sub-interface inside `SignalData` in `components/SignalDashboard.tsx`
2. Add a `MetricTile` entry in `components/SignalCard.tsx` if a dedicated tile is wanted

## Phase 7: TypeScript Check

```bash
cd "/Users/henrywoo/Claude Folder/trading-dashboard" && npx tsc --noEmit
```

Common causes of errors:
- Forgot to add field to the `zero` object in `computeIndicators`
- Forgot to add field to the `return` statement in `computeIndicators`
- New field in `Indicators` not yet added to `SignalData.indicators` in `SignalDashboard.tsx`

## Phase 8: Verify and Deploy

Run `/test-signals` to fetch live data and confirm:
- The new condition pill appears on signal cards
- Score changes are directionally sensible
- No `NaN` or `null` values leak into the UI

Then run `/deploy`.

## Rules

- Always add new fields to BOTH the `zero` fallback AND the `return` statement in `computeIndicators` — missing either breaks TypeScript.
- Check for existing indicators before adding. Many common signals are already computed.
- Score bonuses compound across all strategies. A +1 that applies to all 4 strategies shifts many signals — calibrate carefully.
- Sprint labels are for orientation only — do not necessarily add at the bottom of the interface.
