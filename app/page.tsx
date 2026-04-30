import SignalDashboard from "@/components/SignalDashboard";
import { getWatchlist, getMlScores, getMlDiscoveries, getMlPerformance, getMlHealth, getMlSectorPulse } from "@/lib/supabase";
import { getConvictionTrends } from "@/lib/conviction-history";
import { getQuote, getHistorical, getNews, HistoricalBar } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";
import { SECTOR_ETF } from "@/lib/watchlist";
import { getFinnhubData } from "@/lib/finnhub";

export const revalidate = 300;

async function getInitialData() {
  const watchlist = await getWatchlist();

  // Fetch SPY bars once upfront for RS calculations
  const spyBars = await getHistorical("SPY", 90);

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

  const results = await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars, news, finnhub] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 90),
        getNews(ticker),
        getFinnhubData(ticker),
      ]);
      if (!quote || bars.length === 0) return null;
      const sectorEtf = SECTOR_ETF[ticker];
      const sectorBars = sectorEtf ? (sectorBarMap[sectorEtf] ?? []) : [];
      const signal = buildSignal(ticker, strategy, bars, quote.high52w, spyBars, sectorBars);

      const POSITIVE = ["buy", "bullish", "outperform", "upgrade", "strong", "surge", "rally", "beat", "upside", "growth"];
      const NEGATIVE = ["sell", "bearish", "underperform", "downgrade", "weak", "crash", "avoid", "miss", "cut", "risk"];
      const sentiment = (title: string): "positive" | "negative" | "neutral" => {
        const lower = title.toLowerCase();
        const pos = POSITIVE.filter((w) => lower.includes(w)).length;
        const neg = NEGATIVE.filter((w) => lower.includes(w)).length;
        return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
      };

      const earningsDays = quote.earningsTimestamp
        ? Math.ceil((quote.earningsTimestamp.getTime() - Date.now()) / 86400000)
        : null;

      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
        prevClose: quote.prevClose,
        open: quote.open,
        sa: {
          earningsDays: earningsDays !== null && earningsDays >= 0 && earningsDays <= 14 ? earningsDays : null,
          recentHeadline: news?.title ?? null,
          newsSentiment: news?.title ? sentiment(news.title) : null,
          newsUrl: news?.link ?? null,
          newsPublisher: news?.publisher ?? null,
          finnhubLabel: finnhub.label,
          finnhubBullishPct: finnhub.bullishPct,
          finnhubAnalystCount: finnhub.analystCount,
          analystTargetMean: finnhub.targetMean,
          analystUpside: finnhub.targetMean
            ? Math.round((finnhub.targetMean - quote.price) / quote.price * 100)
            : null,
        },
      };
    })
  );

  const signals = results.filter(Boolean).sort((a, b) => b!.convictionScore - a!.convictionScore);
  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition: "bull" | "bear" | "neutral" = spySignal
    ? spySignal.indicators.isAboveMa20 ? "bull" : "bear"
    : "neutral";

  const watchlistTickers = watchlist.map((w) => w.ticker);
  const [mlScores, mlDiscoveries, mlPerformance, mlHealth, sectorPulse, convictionTrends] = await Promise.all([
    getMlScores(watchlistTickers),
    getMlDiscoveries(watchlistTickers, 10),
    getMlPerformance(20),
    getMlHealth(),
    getMlSectorPulse(SECTOR_ETF),
    getConvictionTrends(watchlistTickers),
  ]);

  const enrichedSignals = (signals as NonNullable<(typeof signals)[number]>[]).map((s) => ({
    ...s,
    mlScore: mlScores[s.ticker]?.ml_score_pct ?? null,
    mlRank: mlScores[s.ticker]?.ml_rank ?? null,
    garchVol: mlScores[s.ticker]?.garch_vol ?? null,
    gapPctLive: mlScores[s.ticker]?.gap_pct_live ?? null,
    pmVolRatioLive: mlScores[s.ticker]?.pm_vol_ratio_live ?? null,
    open930Live: mlScores[s.ticker]?.open_930_live ?? null,
    convictionTrend: convictionTrends[s.ticker]?.trend ?? "stable",
    convictionStreak: convictionTrends[s.ticker]?.streak ?? 0,
  }));

  return {
    signals: enrichedSignals,
    mlDiscoveries,
    mlPerformance,
    marketCondition,
    breadthFlag: mlHealth?.breadth_flag ?? null,
    breadthScore: mlHealth?.breadth_score ?? null,
    sectorPulse,
    volumeAnomalies: [],  // computed server-side in API route only (needs mlDiscoveries with pulse data)
    updatedAt: new Date().toISOString(),
  };
}

export default async function DashboardPage() {
  const initial = await getInitialData();

  return (
    <main className="min-h-screen" style={{ backgroundColor: "var(--surface)", color: "var(--on-surface)" }}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Client component handles display + auto-refresh */}
        <SignalDashboard initial={initial} />

        <footer className="text-center text-xs pt-4 pb-8" style={{ color: "var(--outline)" }}>
          Not financial advice. Paper trade first. Protect your capital.
        </footer>
      </div>
    </main>
  );
}
