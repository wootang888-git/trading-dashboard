import { NextRequest, NextResponse } from "next/server";
import { getHistorical } from "@/lib/yahoo";

const RANGE_DAYS: Record<string, number> = {
  "5d": 10,   // fetch extra calendar days to guarantee 5 trading days
  "10d": 18,
  "1mo": 40,
};

const SLICE: Record<string, number> = {
  "5d": 5,
  "10d": 10,
  "1mo": 22,
};

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  const range = req.nextUrl.searchParams.get("range") ?? "10d";
  if (!ticker) return NextResponse.json({ bars: [] });

  const fetchDays = RANGE_DAYS[range] ?? 18;
  const sliceDays = SLICE[range] ?? 10;

  const raw = await getHistorical(ticker.toUpperCase(), fetchDays);
  const sliced = raw.slice(-sliceDays);

  const bars = sliced.map((b) => ({
    time: b.date.toISOString().split("T")[0],
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));

  return NextResponse.json({ bars }, {
    headers: { "Cache-Control": "s-maxage=300, stale-while-revalidate=60" },
  });
}
