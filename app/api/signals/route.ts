import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/supabase";
import { getQuote, getHistorical, getNews, HistoricalBar } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";
import { SECTOR_ETF } from "@/lib/watchlist";

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
      const [quote, bars, news] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 90),
        getNews(ticker),
      ]);
      if (!quote || bars.length === 0) return null;
      const sectorEtf = SECTOR_ETF[ticker];
      const sectorBars = sectorEtf ? (sectorBarMap[sectorEtf] ?? []) : [];
      const signal = buildSignal(ticker, strategy, bars, quote.high52w, spyBars, sectorBars);

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
        sa: {
          earningsDays: earningsDays !== null && earningsDays >= 0 && earningsDays <= 14 ? earningsDays : null,
          recentHeadline: news?.title ?? null,
          newsSentiment: news?.title ? sentimentFromTitle(news.title) : null,
          newsUrl: news?.link ?? null,
          newsPublisher: news?.publisher ?? null,
        },
      };
    })
  );

  const signals = results.filter(Boolean).sort((a, b) => b!.convictionScore - a!.convictionScore);

  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition = spySignal
    ? spySignal.indicators.isAboveMa20 ? "bull" : "bear"
    : "neutral";

  return NextResponse.json({ signals, marketCondition, updatedAt: new Date().toISOString() });
}
