import { createClient } from "@supabase/supabase-js";
import { WATCHLIST, Strategy } from "./watchlist";
import { WatchlistBacktestConfig, WatchlistBacktestResult, WatchlistSignalSnapshot, TradeResult } from "./backtest";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- Watchlist ---

export interface WatchlistItem {
  user_id?: string;
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
  user_id?: string;
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
  // In a multi-user app, we get the UID from the session
  const { data: { session } } = await supabase.auth.getSession();
  
  const { error } = await supabase.from("trades").insert({
    ...trade,
    user_id: session?.user?.id // Will be null if not logged in
  });
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

// --- ML Scores (Phase 1 — XGBoost daily ranker) ---

export interface MlScore {
  ticker: string;
  score_date: string;
  ml_score: number;        // 0.0–1.0 raw probability
  ml_rank: number;         // 1 = highest score today
  ml_score_pct: number;    // 0–100 for display
  feature_snapshot: Record<string, number> | null;
  fwd_pe: number | null;
  market_cap_b: number | null;
}

export interface MlPerformanceRow {
  ticker: string;
  score_date: string;
  ml_rank: number;
  return_5d: number;
  spy_return_5d: number | null;
  beat_spy: boolean | null;
}

function _today(): string {
  return new Date().toISOString().split("T")[0];
}

async function _latestScoreDate(): Promise<string> {
  const { data } = await supabase
    .from("ml_scores")
    .select("score_date")
    .order("score_date", { ascending: false })
    .limit(1)
    .single();
  return data?.score_date ?? _today();
}

/** ML scores for specific watchlist tickers — used for the badge on SignalCard. */
export async function getMlScores(
  tickers: string[],
  scoreDate?: string
): Promise<Record<string, MlScore>> {
  if (tickers.length === 0) return {};
  const d = scoreDate ?? await _latestScoreDate();
  const { data } = await supabase
    .from("ml_scores")
    .select("ticker, ml_score, ml_rank, ml_score_pct")
    .eq("score_date", d)
    .in("ticker", tickers);
  return Object.fromEntries((data ?? []).map((r) => [r.ticker, r as MlScore]));
}

/** Top-N ML discoveries NOT on the watchlist — used for the discoveries panel. */
export async function getMlDiscoveries(
  excludeTickers: string[],
  limit = 10,
  scoreDate?: string
): Promise<MlScore[]> {
  const d = scoreDate ?? await _latestScoreDate();
  let query = supabase
    .from("ml_scores")
    .select("ticker, ml_score, ml_rank, ml_score_pct, feature_snapshot, fwd_pe, market_cap_b")
    .eq("score_date", d)
    .order("ml_rank", { ascending: true })
    .limit(limit);

  // Supabase doesn't support .not().in() with empty arrays cleanly — guard it
  if (excludeTickers.length > 0) {
    query = query.not("ticker", "in", `(${excludeTickers.join(",")})`);
  }

  const { data } = await query;
  return (data ?? []) as MlScore[];
}

/** Recent track record rows from ml_performance — used for MlTrackRecord card. */
export async function getMlPerformance(limit = 20): Promise<MlPerformanceRow[]> {
  const { data } = await supabase
    .from("ml_performance")
    .select("ticker, score_date, ml_rank, return_5d, spy_return_5d, beat_spy")
    .order("score_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as MlPerformanceRow[];
}
