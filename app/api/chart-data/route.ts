import { NextRequest, NextResponse } from "next/server";
import { getHistorical, getIntraday, getIntradayMultiDay } from "@/lib/yahoo";

const RANGE_DAYS: Record<string, number> = {
  "5d": 10,
  "10d": 18,
  "1mo": 40,
};
const SLICE: Record<string, number> = {
  "5d": 5,
  "10d": 10,
  "1mo": 22,
};
// Calendar days to fetch for multi-day intraday view
const RANGE_CAL_DAYS: Record<string, number> = {
  "5d": 8,
  "10d": 16,
  "1mo": 38,
};

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const range = req.nextUrl.searchParams.get("range") ?? "10d";
  const interval = req.nextUrl.searchParams.get("interval") ?? "";

  if (!ticker) return NextResponse.json({ bars: [], isIntraday: false });

  const sym = ticker.toUpperCase();

  // ── Intraday path (1D range) ──
  if (range === "1d") {
    const bars = await getIntraday(sym, interval || "5m");
    return NextResponse.json({ bars, isIntraday: true });
  }

  // ── Sub-daily path for 5D / 10D / 1M with an interval selected ──
  if (interval && interval !== "daily") {
    const calDays = RANGE_CAL_DAYS[range] ?? 16;
    const bars = await getIntradayMultiDay(sym, interval, calDays);
    return NextResponse.json({ bars, isIntraday: true }, {
      headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
    });
  }

  // ── Daily path ──
  const fetchDays = RANGE_DAYS[range] ?? 18;
  const sliceDays = SLICE[range] ?? 10;
  const raw = await getHistorical(sym, fetchDays);
  const bars = raw.slice(-sliceDays).map((b) => ({
    time: b.date.toISOString().split("T")[0],
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  return NextResponse.json({ bars, isIntraday: false }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
