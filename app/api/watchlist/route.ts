import { NextRequest, NextResponse } from "next/server";
import { addToWatchlist, removeFromWatchlist } from "@/lib/supabase";
import { Strategy } from "@/lib/watchlist";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, name, strategy } = body as {
    ticker: string;
    name?: string;
    strategy: Strategy;
  };

  if (!ticker || !strategy) {
    return NextResponse.json({ error: "ticker and strategy are required." }, { status: 400 });
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  const normalizedName = (name ?? "").trim();

  const result = await addToWatchlist(normalizedTicker, normalizedName, strategy);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    item: { ticker: normalizedTicker, name: normalizedName, strategy },
  });
}

export async function DELETE(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get("ticker");
  if (!ticker) {
    return NextResponse.json({ error: "ticker is required." }, { status: 400 });
  }

  const ok = await removeFromWatchlist(ticker);
  if (!ok) {
    return NextResponse.json({ error: "Failed to remove ticker." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
