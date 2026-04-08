import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("entry_date", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ trades: data ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { ticker, entry_price, stop_price, exit_price, shares, entry_date, exit_date, strategy, notes } = body;

  if (!ticker || !entry_price || !shares || !entry_date || !strategy) {
    return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("trades")
    .insert({
      ticker: ticker.toUpperCase(),
      entry_price,
      stop_price: stop_price ?? null,
      exit_price: exit_price ?? null,
      shares,
      entry_date,
      exit_date: exit_date ?? null,
      strategy,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ trade: data });
}
