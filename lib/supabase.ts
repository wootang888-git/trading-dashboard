import { createClient } from "@supabase/supabase-js";
import { WATCHLIST, Strategy } from "./watchlist";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Watchlist ---

export interface WatchlistItem {
  id?: string;
  ticker: string;
  name: string;
  strategy: Strategy;
  created_at?: string;
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from("watchlist")
    .select("*")
    .order("created_at", { ascending: true });
  if (error || !data || data.length === 0) {
    // Fall back to static list if DB is empty or unavailable
    return WATCHLIST.map((w) => ({ ...w, strategy: w.strategy as Strategy }));
  }
  return data;
}

export async function addToWatchlist(
  ticker: string,
  name: string,
  strategy: Strategy
): Promise<{ success: boolean; error?: string }> {
  const existing = await getWatchlist();
  if (existing.length >= 100) {
    return { success: false, error: "Watchlist is at the 100 ticker limit." };
  }
  const { error } = await supabase
    .from("watchlist")
    .insert({ ticker: ticker.toUpperCase(), name, strategy });
  if (error) {
    return {
      success: false,
      error: error.code === "23505" ? `${ticker.toUpperCase()} is already on your watchlist.` : error.message,
    };
  }
  return { success: true };
}

export async function removeFromWatchlist(ticker: string): Promise<boolean> {
  const { error } = await supabase
    .from("watchlist")
    .delete()
    .eq("ticker", ticker.toUpperCase());
  return !error;
}

export interface Trade {
  id?: string;
  ticker: string;
  entry_price: number;
  exit_price: number | null;
  shares: number;
  entry_date: string;
  exit_date: string | null;
  strategy: string;
  notes: string | null;
  created_at?: string;
}

export async function getTrades(): Promise<Trade[]> {
  const { data, error } = await supabase
    .from("trades")
    .select("*")
    .order("entry_date", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function addTrade(trade: Omit<Trade, "id" | "created_at">): Promise<boolean> {
  const { error } = await supabase.from("trades").insert(trade);
  return !error;
}

export async function updateTrade(id: string, updates: Partial<Trade>): Promise<boolean> {
  const { error } = await supabase.from("trades").update(updates).eq("id", id);
  return !error;
}
