import { NextResponse } from "next/server";
import { getWatchlist } from "@/lib/supabase";
import { getQuote, getHistorical } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";
import { getSAData, daysUntilEarnings } from "@/lib/seeking-alpha";

export const revalidate = 300; // cache 5 min

export async function GET() {
  const watchlist = await getWatchlist();

  const results = await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars, sa] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 60),
        getSAData(ticker),
      ]);
      if (!quote || bars.length === 0) return null;

      const signal = buildSignal(ticker, strategy, bars, quote.high52w);
      const earningsDays = daysUntilEarnings(sa.earningsDate);

      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
        sa: {
          quantRating: sa.quantRating,
          analystRating: sa.analystRating,
          earningsDays,  // days until next earnings (null if unknown)
        },
      };
    })
  );

  const signals = results.filter(Boolean).sort((a, b) => b!.score - a!.score);

  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition = spySignal
    ? spySignal.indicators.isAboveMa20 ? "bull" : "bear"
    : "neutral";

  return NextResponse.json({ signals, marketCondition, updatedAt: new Date().toISOString() });
}
