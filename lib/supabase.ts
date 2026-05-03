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
  ml_percentile_rank: number | null; // 0–100 true percentile within daily scored universe
  feature_snapshot: Record<string, number> | null;
  fwd_pe: number | null;
  market_cap_b: number | null;
  garch_vol: number | null;
  // Pulse columns (written by pulse_premarket.py at 9:15 AM ET)
  gap_pct_live: number | null;
  pm_vol_ratio_live: number | null;
  open_930_live: number | null;
}

export interface MlHealth {
  score_date: string;
  spy_regime: string;
  vix_close: number | null;
  calibration_flag: string | null;
  breadth_score: number | null;
  breadth_flag: "accumulation" | "neutral" | "distribution" | null;
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
    .select("ticker, ml_score, ml_rank, ml_score_pct, ml_percentile_rank, garch_vol, gap_pct_live, pm_vol_ratio_live, open_930_live")
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
    .select("ticker, ml_score, ml_rank, ml_score_pct, ml_percentile_rank, feature_snapshot, fwd_pe, market_cap_b, garch_vol, gap_pct_live, pm_vol_ratio_live, open_930_live")
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

/** Sector-level pulse aggregation — avg gap and breadth per sector ETF.
 *  Only populated after pulse_premarket.py has run for the day. */
export async function getMlSectorPulse(
  sectorEtfMap: Record<string, string>,
  scoreDate?: string,
): Promise<import("@/components/SectorPulseBanner").SectorPulseData[]> {
  const d = scoreDate ?? await _latestScoreDate();
  const { data } = await supabase
    .from("ml_scores")
    .select("ticker, gap_pct_live")
    .eq("score_date", d)
    .not("gap_pct_live", "is", null);

  if (!data || data.length === 0) return [];

  // Group by sector ETF using the provided map
  const byEtf: Record<string, number[]> = {};
  for (const row of data) {
    const etf = sectorEtfMap[row.ticker];
    if (!etf || etf === "SPY" || etf === "QQQ") continue; // skip broad market
    if (!byEtf[etf]) byEtf[etf] = [];
    byEtf[etf].push(row.gap_pct_live as number);
  }

  return Object.entries(byEtf)
    .filter(([, gaps]) => gaps.length >= 2) // need at least 2 tickers per sector
    .map(([etf, gaps]) => {
      const avgGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const pctPositive = gaps.filter((g) => g > 0).length / gaps.length;
      const direction: "hot" | "warm" | "neutral" | "cold" =
        avgGap > 0.01 && pctPositive > 0.6 ? "hot" :
        avgGap > 0 ? "warm" :
        avgGap > -0.01 ? "neutral" : "cold";
      return { etf, avgGap, pctPositive, direction };
    })
    .sort((a, b) => b.avgGap - a.avgGap);
}

// --- Signal Streaks (Phase B — Persistence Service) ---

export interface SignalStreak {
  ticker: string;
  streak_days: number;          // consecutive days conviction_score > 85
  ml_delta_24h: number | null;  // today ml_score_pct minus yesterday ml_score_pct
  streak_direction: "rising" | "falling" | "flat";
}

/** Returns streak + ml_delta data for a list of tickers from signal_history.
 *  Reads the last 3 rows per ticker ordered by score_date DESC.
 *  Falls back gracefully: missing history → streak_days: 0, ml_delta_24h: null. */
export async function getSignalStreaks(tickers: string[]): Promise<Record<string, SignalStreak>> {
  if (tickers.length === 0) return {};

  // Fetch last 5 rows per ticker — 5× budget so uneven history density across tickers
  // doesn't crowd out some tickers from the global limit. Supabase returns rows globally
  // (no per-partition support in JS client), so extra headroom keeps all tickers covered.
  const { data } = await supabase
    .from("signal_history")
    .select("ticker, score_date, conviction_score, ml_score_pct")
    .in("ticker", tickers)
    .order("score_date", { ascending: false })
    .limit(Math.max(tickers.length * 5, 100));

  if (!data || data.length === 0) {
    return Object.fromEntries(tickers.map((t) => [t, { ticker: t, streak_days: 0, ml_delta_24h: null, streak_direction: "flat" as const }]));
  }

  // Group by ticker
  const byTicker: Record<string, { conviction_score: number; ml_score_pct: number | null }[]> = {};
  for (const row of data) {
    if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
    byTicker[row.ticker].push({ conviction_score: row.conviction_score, ml_score_pct: row.ml_score_pct });
  }

  const result: Record<string, SignalStreak> = {};
  for (const ticker of tickers) {
    const rows = byTicker[ticker] ?? [];
    // rows[0] = today, rows[1] = yesterday, rows[2] = day before
    let streak_days = 0;
    for (const row of rows) {
      if (row.conviction_score > 85) streak_days++;
      else break;
    }

    const todayMl = rows[0]?.ml_score_pct ?? null;
    const yesterdayMl = rows[1]?.ml_score_pct ?? null;
    const ml_delta_24h = todayMl !== null && yesterdayMl !== null ? todayMl - yesterdayMl : null;

    const streak_direction: SignalStreak["streak_direction"] =
      ml_delta_24h === null ? "flat"
      : ml_delta_24h > 2 ? "rising"
      : ml_delta_24h < -2 ? "falling"
      : "flat";

    result[ticker] = { ticker, streak_days, ml_delta_24h, streak_direction };
  }
  return result;
}

/** Latest ml_health row — regime, VIX, calibration flag, and pulse breadth signal. */
export async function getMlHealth(): Promise<MlHealth | null> {
  const { data } = await supabase
    .from("ml_health")
    .select("score_date, spy_regime, vix_close, calibration_flag, breadth_score, breadth_flag")
    .order("score_date", { ascending: false })
    .limit(1)
    .single();
  return (data as MlHealth) ?? null;
}
