import { NextResponse } from "next/server";
import { getWatchlist, getMlScores, getMlDiscoveries, getMlPerformance, getMlHealth, getMlSectorPulse, getSignalStreaks } from "@/lib/supabase";
import { getQuote, getHistorical, getNews, HistoricalBar } from "@/lib/yahoo";
import { buildSignal, computeNbaDirective } from "@/lib/signals";
import { SECTOR_ETF } from "@/lib/watchlist";
import { getFinnhubData } from "@/lib/finnhub";
import { getConvictionTrends } from "@/lib/conviction-history";

export const revalidate = 300; // cache 5 min

const POSITIVE = ["buy", "bullish", "outperform", "upgrade", "strong", "surge", "rally", "beat", "upside", "growth"];
const NEGATIVE = ["sell", "bearish", "underperform", "downgrade", "weak", "crash", "avoid", "miss", "cut", "risk"];
function sentimentFromTitle(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  const pos = POSITIVE.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE.filter((w) => lower.includes(w)).length;
  return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
}

export async function GET() {
  const watchlist = await getWatchlist();
  const watchlistTickers = watchlist.map((w) => w.ticker);

  // Fetch ML data + SPY bars + conviction trends + streaks in parallel
  const [spyBars, mlScores, mlDiscoveries, mlPerformance, mlHealth, sectorPulse, convictionTrends, signalStreaks] = await Promise.all([
    getHistorical("SPY", 90),
    getMlScores(watchlistTickers),
    getMlDiscoveries(watchlistTickers, 10),
    getMlPerformance(20),
    getMlHealth(),
    getMlSectorPulse(SECTOR_ETF),
    getConvictionTrends(watchlistTickers),
    getSignalStreaks(watchlistTickers),
  ]);

  // Fetch each unique sector ETF once and share across all tickers in that sector
  const neededSectorEtfs = [...new Set(
    watchlist.map((w) => SECTOR_ETF[w.ticker]).filter(Boolean)
  )];
  const sectorBarMap: Record<string, HistoricalBar[]> = {};
  await Promise.all(
    neededSectorEtfs.map(async (etf) => {
      sectorBarMap[etf] = await getHistorical(etf, 90);
    })
  );

  // Compute MA20 for each sector ETF (mean of last 20 closes); ETF above its MA20 = healthy regime
  const sectorEtfAboveMA20Map: Record<string, boolean> = {};
  for (const etf of neededSectorEtfs) {
    const sBars = sectorBarMap[etf] ?? [];
    if (sBars.length >= 20) {
      const ma20 = sBars.slice(-20).reduce((s, b) => s + b.close, 0) / 20;
      sectorEtfAboveMA20Map[etf] = sBars[sBars.length - 1].close > ma20;
    } else {
      sectorEtfAboveMA20Map[etf] = true; // insufficient data — don't block
    }
  }

  const results = await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars, news, finnhub] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 365),
        getNews(ticker),
        getFinnhubData(ticker),
      ]);
      if (!quote || bars.length === 0) return null;
      const sectorEtf = SECTOR_ETF[ticker];
      const sectorBars = sectorEtf ? (sectorBarMap[sectorEtf] ?? []) : [];
      const sectorEtfAboveMA20 = sectorEtf ? (sectorEtfAboveMA20Map[sectorEtf] ?? true) : true;
      const mlData = mlScores[ticker];
      const signal = buildSignal(ticker, strategy, bars, quote.high52w, spyBars, sectorBars, sectorEtfAboveMA20, mlData?.pm_vol_ratio_live ?? null, quote.earningsTimestamp);

      const earningsDays = quote.earningsTimestamp
        ? Math.ceil((quote.earningsTimestamp.getTime() - Date.now()) / 86400000)
        : null;
      const streakData = signalStreaks[ticker];
      const streakDays = streakData?.streak_days ?? 0;
      const mlDelta24h = streakData?.ml_delta_24h ?? null;
      const { directive: nbaDirective, reason: nbaDirectiveReason } = computeNbaDirective({
        mlScorePct: mlData?.ml_score_pct ?? null,
        mlPercentileRank: mlData?.ml_percentile_rank ?? null,
        convictionScore: signal.convictionScore,
        streakDays,
        mlDelta24h,
        tier: signal.tier,
        entryPrice: signal.entryPrice,
        stopPrice: signal.stopPrice,
        livePrice: quote.price,
        ema8: signal.indicators.ema8,
        structuralTarget: signal.structuralTarget,
        trailMode: signal.trailMode,
        earningsRisk: signal.earningsRisk,
      });
      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
        mlScore: mlData?.ml_score_pct ?? null,
        mlRank: mlData?.ml_rank ?? null,
        garchVol: mlData?.garch_vol ?? null,
        gapPctLive: mlData?.gap_pct_live ?? null,
        pmVolRatioLive: mlData?.pm_vol_ratio_live ?? null,
        open930Live: mlData?.open_930_live ?? null,
        convictionTrend: convictionTrends[ticker]?.trend ?? "stable",
        convictionStreak: convictionTrends[ticker]?.streak ?? 0,
        streakDays,
        mlDelta24h,
        streakDirection: streakData?.streak_direction ?? "flat",
        nbaDirective,
        nbaDirectiveReason,
        sa: {
          earningsDays: earningsDays !== null && earningsDays >= 0 && earningsDays <= 14 ? earningsDays : null,
          recentHeadline: news?.title ?? null,
          newsSentiment: news?.title ? sentimentFromTitle(news.title) : null,
          newsUrl: news?.link ?? null,
          newsPublisher: news?.publisher ?? null,
          finnhubLabel: finnhub.label,
          finnhubBullishPct: finnhub.bullishPct,
          finnhubAnalystCount: finnhub.analystCount,
          analystTargetMean: finnhub.targetMean,
          analystUpside: finnhub.targetMean && quote
            ? Math.round((finnhub.targetMean - quote.price) / quote.price * 100)
            : null,
        },
      };
    })
  );

  const signals = results.filter(Boolean).sort((a, b) => b!.convictionScore - a!.convictionScore);

  // Volume anomalies: tickers with pm_vol_ratio_live > 5× (unusual activity)
  const volumeAnomalies = (mlDiscoveries as {
    ticker: string; pm_vol_ratio_live?: number | null; ml_score_pct: number; gap_pct_live?: number | null;
  }[])
    .filter((d) => (d.pm_vol_ratio_live ?? 0) > 5)
    .sort((a, b) => (b.pm_vol_ratio_live ?? 0) - (a.pm_vol_ratio_live ?? 0))
    .slice(0, 8)
    .map((d) => ({
      ticker: d.ticker,
      pmVolRatioLive: d.pm_vol_ratio_live,
      mlScore: d.ml_score_pct,
      gapPctLive: d.gap_pct_live,
    }));

  // Re-rank discoveries by pulse_rank when live gap data is available
  const rankedDiscoveries = [...mlDiscoveries].sort((a, b) => {
    const pulseA = a.ml_score_pct * (1 + (a.gap_pct_live ?? 0) * (a.pm_vol_ratio_live ?? 1));
    const pulseB = b.ml_score_pct * (1 + (b.gap_pct_live ?? 0) * (b.pm_vol_ratio_live ?? 1));
    return pulseB - pulseA;
  });

  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition = spySignal
    ? spySignal.indicators.isAboveMa20 ? "bull" : "bear"
    : "neutral";

  return NextResponse.json({
    signals,
    mlDiscoveries: rankedDiscoveries,
    mlPerformance,
    marketCondition,
    breadthFlag: mlHealth?.breadth_flag ?? null,
    breadthScore: mlHealth?.breadth_score ?? null,
    sectorPulse,
    volumeAnomalies,
    updatedAt: new Date().toISOString(),
  });
}
