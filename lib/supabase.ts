import { createClient } from "@supabase/supabase-js";
import { WATCHLIST, Strategy } from "./watchlist";
import { WatchlistBacktestConfig, WatchlistBacktestResult, WatchlistSignalSnapshot, TradeResult } from "./backtest";

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
  stop_price: number | null;
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

export async function deleteTrade(id: string): Promise<boolean> {
  const { error } = await supabase.from("trades").delete().eq("id", id);
  return !error;
}

// --- Signal Weights (backtest-calibrated per-condition win rates) ---

export interface SignalWeight {
  strategy: string;
  condition_name: string;
  win_rate: number;      // 0.0–1.0
  sample_count: number;
  computed_at?: string;
}

// In-process cache: populated once per server process, refreshed every 6h
let _weightsCache: Record<string, number> | null = null;
let _weightsCacheAt = 0;
const WEIGHTS_TTL_MS = 6 * 60 * 60 * 1000;

/** Returns a map of "strategy:condition_name" → win_rate.
 *  Defaults to 1.0 (neutral) for any condition not yet backtested. */
export async function getSignalWeights(): Promise<Record<string, number>> {
  const now = Date.now();
  if (_weightsCache && now - _weightsCacheAt < WEIGHTS_TTL_MS) {
    return _weightsCache;
  }
  const { data, error } = await supabase
    .from("signal_weights")
    .select("strategy, condition_name, win_rate");
  if (error || !data) return {};
  const map: Record<string, number> = {};
  for (const row of data) {
    map[`${row.strategy}:${row.condition_name}`] = row.win_rate;
  }
  _weightsCache = map;
  _weightsCacheAt = now;
  return map;
}

/** Upserts win-rate weights computed by the backtest engine. */
export async function upsertSignalWeights(weights: SignalWeight[]): Promise<boolean> {
  const rows = weights.map((w) => ({
    strategy: w.strategy,
    condition_name: w.condition_name,
    win_rate: w.win_rate,
    sample_count: w.sample_count,
    computed_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("signal_weights")
    .upsert(rows, { onConflict: "strategy,condition_name" });
  if (!error) {
    _weightsCache = null; // invalidate cache so next read picks up new values
  }
  return !error;
}

// --- Signal History (closed-loop validation log) ---

export interface SignalHistoryEntry {
  ticker: string;
  strategy: string;
  score: number;
  conviction_score: number;
  entry_price: number;
  stop_price: number;
}

/** Logs a signal snapshot to the history table for future closed-loop validation. */
export async function logSignal(entry: SignalHistoryEntry): Promise<boolean> {
  const { error } = await supabase.from("signal_history").insert({
    ...entry,
    recorded_at: new Date().toISOString(),
  });
  return !error;
}

// --- Backtest Results (strategy tuning logs) ---

export interface BacktestResultLog {
  config: WatchlistBacktestConfig;
  summary: WatchlistBacktestResult["summary"];
  trades: TradeResult[];
  signals: WatchlistSignalSnapshot[];
}

/** Logs a backtest result to the database for analysis and tuning. */
export async function logBacktestResult(result: BacktestResultLog): Promise<boolean> {
  const { error } = await supabase.from("backtest_results").insert({
    config: result.config,
    summary: result.summary,
    trades: result.trades,
    signals: result.signals,
    run_at: new Date().toISOString(),
  });
  return !error;
}
