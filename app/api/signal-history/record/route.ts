import { NextRequest, NextResponse } from "next/server";
import { getWatchlist, getMlScores, supabase } from "@/lib/supabase";
import { getQuote, getHistorical, HistoricalBar } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";
import { SECTOR_ETF } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

function _today(): string {
  return new Date().toISOString().split("T")[0];
}

export async function POST(req: NextRequest) {
  // Cron secret protection
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scoreDate = _today();
  const watchlist = await getWatchlist();
  const watchlistTickers = watchlist.map((w) => w.ticker);

  const [spyBars, mlScores] = await Promise.all([
    getHistorical("SPY", 90),
    getMlScores(watchlistTickers),
  ]);

  // Fetch each unique sector ETF once
  const neededSectorEtfs = [...new Set(
    watchlist.map((w) => SECTOR_ETF[w.ticker]).filter(Boolean)
  )];
  const sectorBarMap: Record<string, HistoricalBar[]> = {};
  await Promise.all(
    neededSectorEtfs.map(async (etf) => {
      sectorBarMap[etf] = await getHistorical(etf, 90);
    })
  );

  const rows: {
    ticker: string;
    strategy: string;
    score: number;
    conviction_score: number;
    conviction_band: string;
    entry_price: number;
    stop_price: number;
    ml_score_pct: number | null;
    score_date: string;
  }[] = [];

  await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 90),
      ]);
      if (!quote || bars.length === 0) return;

      const sectorEtf = SECTOR_ETF[ticker];
      const sectorBars = sectorEtf ? (sectorBarMap[sectorEtf] ?? []) : [];
      const signal = buildSignal(ticker, strategy, bars, quote.high52w, spyBars, sectorBars);

      rows.push({
        ticker,
        strategy,
        score: signal.score,
        conviction_score: signal.convictionScore,
        conviction_band: signal.convictionBand === "high" ? "trade" : signal.convictionBand === "medium" ? "watch" : "observe",
        entry_price: signal.entryPrice,
        stop_price: signal.stopPrice,
        ml_score_pct: mlScores[ticker]?.ml_score_pct ?? null,
        score_date: scoreDate,
      });
    })
  );

  if (rows.length === 0) {
    return NextResponse.json({ recorded: 0, date: scoreDate });
  }

  const { error } = await supabase
    .from("signal_history")
    .upsert(rows, { onConflict: "ticker,score_date" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ recorded: rows.length, date: scoreDate });
}
