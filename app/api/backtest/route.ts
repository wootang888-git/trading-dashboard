import { NextResponse } from "next/server";
import { getWatchlist, logBacktestResult } from "@/lib/supabase";
import { getQuote, getHistorical } from "@/lib/yahoo";
import { runFullBacktest, runWatchlistBacktest, runWatchlistBacktestSweep, BACKTEST_UNIVERSE, HISTORY_DAYS, WatchlistBacktestConfig } from "@/lib/backtest";

// Backtest is compute-heavy — no caching, always runs fresh
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const startDate = url.searchParams.get("start") ?? "2026-01-03";
  const endDate = url.searchParams.get("end") ?? "2026-02-15";
  const fixedShares = Number(url.searchParams.get("shares") ?? 100);
  const atrPeriod = Number(url.searchParams.get("atrPeriod") ?? 14);
  const tpMultiplier = Number(url.searchParams.get("tp") ?? 1.5);
  const maxHoldDays = Number(url.searchParams.get("maxHoldDays") ?? 30);
  const includeMode = (url.searchParams.get("includeMode") as "both" | "trade" | "watch") ?? "both";
  const minScore = Number(url.searchParams.get("minScore") ?? 4);
  const topN = Number(url.searchParams.get("topN") ?? 3);
  const trendFilter = url.searchParams.get("trendFilter") === "true";
  const requireBreakout = url.searchParams.get("requireBreakout") === "true";
  const maxEntryGapPct = Number(url.searchParams.get("maxEntryGapPct") ?? 100);
  const minHoldDays = Number(url.searchParams.get("minHoldDays") ?? 0);

  const watchlist = await getWatchlist();
  const spyBars = await getHistorical("SPY", HISTORY_DAYS);

  const config: WatchlistBacktestConfig = {
    startDate,
    endDate,
    fixedShares,
    atrPeriod,
    targetMultiplier: tpMultiplier,
    maxHoldDays: Number.isNaN(maxHoldDays) ? undefined : maxHoldDays,
    includeMode,
    minScore: Number.isNaN(minScore) ? undefined : minScore,
    topN: Number.isNaN(topN) ? undefined : topN,
    trendFilter,
    requireBreakout,
    maxEntryGapPct: Number.isNaN(maxEntryGapPct) ? undefined : maxEntryGapPct,
    minHoldDays: Number.isNaN(minHoldDays) ? undefined : minHoldDays,
  };

  const sweep = url.searchParams.get("sweep") === "true";

  if (sweep) {
    // Basic sweep variations for quick tuning; add more configs as needed.
    const sweepConfigs: WatchlistBacktestConfig[] = [
      config,
      { ...config, minScore: 5, topN: 2 },
      { ...config, minScore: 5, topN: 2, trendFilter: true, maxEntryGapPct: 2 },
      { ...config, minScore: 4, topN: 3, trendFilter: true, requireBreakout: true, maxEntryGapPct: 2 },
    ];

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
      config,
      sweepResults,
      updatedAt: new Date().toISOString(),
    });
  }

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

export async function POST() {
  const watchlist = await getWatchlist();

  // Fetch SPY bars once for RS baseline (same 5yr window as backtest)
  const spyBars = await getHistorical("SPY", HISTORY_DAYS);

  // Merge live watchlist with extended backtest universe (deduplicate by ticker)
  const watchlistEntries = watchlist.map(({ ticker, strategy }) => ({ ticker, strategy }));
  const universeMap = new Map<string, { ticker: string; strategy: string }>();
  for (const entry of [...BACKTEST_UNIVERSE, ...watchlistEntries]) {
    universeMap.set(entry.ticker, entry); // watchlist strategy wins if duplicate
  }
  const allTickers = [...universeMap.values()];

  // Fetch 52w highs in parallel (needed for indicator computation)
  const tickerData = await Promise.all(
    allTickers.map(async ({ ticker, strategy }) => {
      const quote = await getQuote(ticker);
      return quote ? { ticker, strategy, high52w: quote.high52w } : null;
    })
  );
  const validTickers = tickerData.filter(Boolean) as { ticker: string; strategy: string; high52w: number }[];

  const summary = await runFullBacktest(validTickers, spyBars);

  return NextResponse.json({
    message: "Backtest complete",
    completed: summary.completed.length,
    failed: summary.failed.length,
    weightsComputed: summary.weights.length,
    observationsTotal: summary.observationsTotal,
    failedDetails: summary.failed,
  });
}
