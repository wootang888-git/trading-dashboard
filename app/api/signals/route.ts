import { NextResponse } from "next/server";
import { WATCHLIST } from "@/lib/watchlist";
import { getQuote, getHistorical } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";

export const revalidate = 900; // cache for 15 min (Yahoo Finance delay)

export async function GET() {
  const results = await Promise.all(
    WATCHLIST.map(async ({ ticker, strategy }) => {
      const [quote, bars] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 60),
      ]);

      if (!quote || bars.length === 0) return null;

      const signal = buildSignal(ticker, strategy, bars, quote.high52w);

      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
      };
    })
  );

  const signals = results
    .filter(Boolean)
    .sort((a, b) => b!.score - a!.score);

  // Market condition: based on SPY position vs its 20-day MA
  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition = spySignal
    ? spySignal.indicators.isAboveMa20
      ? "bull"
      : "bear"
    : "neutral";

  return NextResponse.json({ signals, marketCondition });
}
