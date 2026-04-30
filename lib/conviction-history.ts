import { supabase } from "./supabase";

export interface SignalHistoryRow {
  ticker: string;
  strategy: string;
  score: number;
  conviction_score: number;
  conviction_band: "trade" | "watch" | "observe";
  entry_price: number;
  stop_price: number;
  ml_score_pct: number | null;
  score_date: string;
}

export interface ConvictionTrend {
  ticker: string;
  currentBand: "trade" | "watch" | "observe" | null;
  prevBand: "trade" | "watch" | "observe" | null;
  trend: "rising" | "stable" | "falling";
  streak: number;   // consecutive days in current band
  velocity: number; // slope of conviction_score over last 5 days (positive = improving)
}

const BAND_RANK = { trade: 2, watch: 1, observe: 0 };

export function detectTransitions(history: SignalHistoryRow[]): "rising" | "stable" | "falling" {
  if (history.length < 2) return "stable";
  const sorted = [...history].sort((a, b) => a.score_date.localeCompare(b.score_date));
  const latest = sorted[sorted.length - 1].conviction_band;
  const prev = sorted[sorted.length - 2].conviction_band;
  if (BAND_RANK[latest] > BAND_RANK[prev]) return "rising";
  if (BAND_RANK[latest] < BAND_RANK[prev]) return "falling";
  return "stable";
}

export function computeVelocity(history: SignalHistoryRow[]): number {
  const sorted = [...history]
    .sort((a, b) => a.score_date.localeCompare(b.score_date))
    .slice(-5);
  if (sorted.length < 2) return 0;
  // Simple linear regression slope
  const n = sorted.length;
  const xs = sorted.map((_, i) => i);
  const ys = sorted.map((r) => r.conviction_score);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - xMean) * (ys[i] - yMean), 0);
  const den = xs.reduce((s, x) => s + (x - xMean) ** 2, 0);
  return den === 0 ? 0 : num / den;
}

function computeStreak(history: SignalHistoryRow[]): number {
  const sorted = [...history].sort((a, b) => b.score_date.localeCompare(a.score_date));
  if (sorted.length === 0) return 0;
  const currentBand = sorted[0].conviction_band;
  let streak = 0;
  for (const row of sorted) {
    if (row.conviction_band === currentBand) streak++;
    else break;
  }
  return streak;
}

/** Fetches conviction trends for up to the last 5 days for a batch of tickers. */
export async function getConvictionTrends(tickers: string[]): Promise<Record<string, ConvictionTrend>> {
  if (tickers.length === 0) return {};

  const { data } = await supabase
    .from("signal_history")
    .select("ticker, conviction_score, conviction_band, score_date")
    .in("ticker", tickers)
    .order("score_date", { ascending: false })
    .limit(tickers.length * 5);

  if (!data || data.length === 0) return {};

  const byTicker: Record<string, SignalHistoryRow[]> = {};
  for (const row of data as SignalHistoryRow[]) {
    if (!byTicker[row.ticker]) byTicker[row.ticker] = [];
    byTicker[row.ticker].push(row);
  }

  const result: Record<string, ConvictionTrend> = {};
  for (const ticker of tickers) {
    const history = byTicker[ticker] ?? [];
    const sorted = [...history].sort((a, b) => b.score_date.localeCompare(a.score_date));
    result[ticker] = {
      ticker,
      currentBand: sorted[0]?.conviction_band ?? null,
      prevBand: sorted[1]?.conviction_band ?? null,
      trend: detectTransitions(history),
      streak: computeStreak(history),
      velocity: computeVelocity(history),
    };
  }

  return result;
}
