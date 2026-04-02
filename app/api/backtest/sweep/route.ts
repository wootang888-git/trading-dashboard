import { NextResponse } from "next/server";
import { getWatchlist, logBacktestResult } from "@/lib/supabase";
import { getHistorical } from "@/lib/yahoo";
import { runWatchlistBacktestSweep, HISTORY_DAYS, WatchlistBacktestConfig } from "@/lib/backtest";

export async function POST(request: Request) {
  const body = await request.json();
  const {
    startDate = "2026-01-03",
    endDate = "2026-02-15",
    fixedShares = 100,
    atrPeriod = 14,
    targetMultiplier = 1.5,
    maxHoldDays = 30,
    includeMode = "both",
    minScore = 4,
    topN = 3,
    trendFilter = true,
    requireBreakout,
    maxEntryGapPct,
    minHoldDays,
    reportTopCount = 5,
    sweepMode = "quick",
  } = body;

  const watchlist = await getWatchlist();
  const spyBars = await getHistorical("SPY", HISTORY_DAYS);

  const baseConfig: WatchlistBacktestConfig = {
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

  // Define sweep configs based on mode
  let sweepConfigs: WatchlistBacktestConfig[];
  if (sweepMode === "quick") {
    sweepConfigs = [
      baseConfig,
      { ...baseConfig, minScore: 5, topN: 2 },
      { ...baseConfig, minScore: 5, topN: 2, trendFilter: true, maxEntryGapPct: 2 },
      { ...baseConfig, minScore: 4, topN: 3, trendFilter: true, requireBreakout: true, maxEntryGapPct: 2 },
    ];
  } else {
    // deep sweep - more variations
    sweepConfigs = [
      baseConfig,
      { ...baseConfig, minScore: 5, topN: 2 },
      { ...baseConfig, minScore: 6, topN: 1 },
      { ...baseConfig, minScore: 5, topN: 2, trendFilter: true },
      { ...baseConfig, minScore: 5, topN: 2, requireBreakout: true },
      { ...baseConfig, minScore: 5, topN: 2, maxEntryGapPct: 2 },
      { ...baseConfig, minScore: 5, topN: 2, minHoldDays: 2 },
      { ...baseConfig, minScore: 4, topN: 3, trendFilter: true, requireBreakout: true },
      { ...baseConfig, minScore: 4, topN: 3, trendFilter: true, maxEntryGapPct: 2 },
      { ...baseConfig, minScore: 4, topN: 3, trendFilter: true, requireBreakout: true, maxEntryGapPct: 2 },
    ];
  }

  const sweepResults = await runWatchlistBacktestSweep(
    watchlist.map((w) => ({ ticker: w.ticker, strategy: w.strategy })),
    spyBars,
    sweepConfigs
  );

  // Log each sweep result to DB
  for (const sweepResult of sweepResults) {
    await logBacktestResult({
      config: sweepResult.config,
      summary: sweepResult.result.summary,
      trades: sweepResult.result.trades,
      signals: sweepResult.result.signals,
    });
  }

  return NextResponse.json({
    message: "Watchlist simulation sweep complete",
    config: baseConfig,
    sweepResults,
    updatedAt: new Date().toISOString(),
  });
}