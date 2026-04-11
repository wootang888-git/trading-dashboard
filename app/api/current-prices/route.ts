import { NextRequest, NextResponse } from "next/server";
import { getQuote } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

/** GET /api/current-prices?tickers=AAPL,NVDA,META
 *  Returns { AAPL: 192.34, NVDA: 875.00, ... } — null for any ticker that failed */
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("tickers") ?? "";
  const tickers = raw.split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
  if (tickers.length === 0) return NextResponse.json({});

  const entries = await Promise.all(
    tickers.map(async (ticker) => {
      const q = await getQuote(ticker);
      return [ticker, q ? { price: q.price, prevClose: q.prevClose, open: q.open } : null] as const;
    })
  );

  return NextResponse.json(Object.fromEntries(entries));
}
