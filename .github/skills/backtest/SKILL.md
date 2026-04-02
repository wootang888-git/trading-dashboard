---
name: backtest
description: "Skill to run and inspect the watchlist-based swing trading backtest; use when validating strategy performance, backtest signal selection, and P/L metrics."
---

# Swing Trader Backtest Skill

This skill defines a reusable backtest workflow for the trading-dashboard project.

## Use Case
- Execute watchlist backtest for defined window and strategy rules
- Tag high-conviction signals (`score >= 4`, top 3 by conviction)
- Simulate entry at next open, ATR stop, 1.5x take-profit
- Produce trade-level and summary P&L metrics

## Slash command
- `/backtest` (or `/run_backtest`) prompts parameters:
  - `startDate` (e.g., `2026-01-03`)
  - `endDate` (e.g., `2026-02-15`)
  - `shares` (e.g., `100`)
  - `atrPeriod` (e.g., `14`)
  - `tp` (e.g., `1.5`)
  - `maxHoldDays` (e.g., `30`)

## Endpoint
- `GET /api/backtest?start=...&end=...&shares=...&atrPeriod=...&tp=...&maxHoldDays=...`

## QA logic
1. Ensure watchlist entries exist (`getWatchlist()` output).
2. Signal on `startDate`; if missing, find previous trading day.
3. Mark high conviction by `score >= 4` and top3 conviction.
4. Entry on next session open, stop = `entry - ATR`, target = `entry + 1.5 * (entry-stop)`.
5. Allow exit after `endDate`.
6. Return:
   - `summary`: total trades, wins, losses, winRate, netPnl, maxDrawdown
   - `signals[]`, `trades[]`

## File references
- `lib/backtest.ts`
- `app/api/backtest/route.ts`

## Expected output
- JSON with `config`, `summary`, `signals`, `trades`, `updatedAt`
- Should be readable in terminal with `curl ... | jq .`

## Next steps
- Add optional `app/backtest/page.tsx` with table/charts
- Add compare mode to execute multiple parameter sets
