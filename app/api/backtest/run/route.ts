import { NextResponse } from "next/server";
import { getWatchlist, logBacktestResult } from "@/lib/supabase";
import { getHistorical } from "@/lib/yahoo";
import { runWatchlistBacktest, HISTORY_DAYS, WatchlistBacktestConfig } from "@/lib/backtest";

export async function POST(request: Request) {
  const body = await request.json();
  const {
    startDate = "2026-01-03",
    endDate = "2026-02-15",
    fixedShares = 100,
    atrPeriod = 14,
    targetMultiplier = 1.5,
    maxHoldDays,
    includeMode = "both",
    minScore,
    topN,
    trendFilter = true,
    requireBreakout,
    maxEntryGapPct,
    minHoldDays,
    reportTopCount = 5,
  } = body;

  const watchlist = await getWatchlist();
  const spyBars = await getHistorical("SPY", HISTORY_DAYS);

  const config: WatchlistBacktestConfig = {
    startDate,
    endDate,
    fixedShares,
    atrPeriod,
    targetMultiplier,
    maxHoldDays,
    includeMode,
    minScore,
    topN,
    trendFilter,
    requireBreakout,
    maxEntryGapPct,
    minHoldDays,
    reportTopCount,
  };

  const result = await runWatchlistBacktest(
    watchlist.map((w) => ({ ticker: w.ticker, strategy: w.strategy })),
    spyBars,
    config
  );

  // Log the result to DB
  await logBacktestResult({
    config,
    summary: result.summary,
    trades: result.trades,
    signals: result.signals,
  });

  return NextResponse.json({
    message: "Watchlist simulation complete",
    config,
    summary: result.summary,
    signals: result.signals,
    trades: result.trades,
    updatedAt: new Date().toISOString(),
  });
}