/**
 * Backtest engine — computes win rates for each indicator condition per strategy.
 *
 * For each bar in the historical series, we:
 *  1. Compute indicators up to that bar (walk-forward, no lookahead bias)
 *  2. Score the strategy at that point
 *  3. Check which conditions were met
 *  4. Record whether price was higher at T+5, T+10, and T+15 trading days
 *  5. Compute win rate per condition across all observations
 *
 * Results are stored in Supabase via upsertSignalWeights().
 * The engine is not run on every refresh — it's triggered manually or via a nightly cron.
 */

import { HistoricalBar, getHistorical, getQuote } from "./yahoo";
import { computeIndicators, scoreMomentumBreakout, scoreEMAPullback, scoreMeanReversion, scoreETFRotation, buildSignal } from "./signals";
import { SignalWeight, upsertSignalWeights } from "./supabase";

export interface BacktestResult {
  strategy: string;
  ticker: string;
  totalObservations: number;
  conditionWinRates: Record<string, { winRate: number; sampleCount: number }>;
}

export interface TradeSignalSnapshot {
  ticker: string;
  strategy: string;
  signalDate: string; // YYYY-MM-DD
  score: number;
  convictionScore: number;
  convictionBand: "high" | "medium" | "low";
  isScoreHigh: boolean;
  isTop3: boolean;
  indicators: {
    atr14: number;
    [key: string]: number | boolean | null | undefined;
  };
  entryPriceSignal?: number;
  stopPriceSignal?: number;
}

export interface TradeResult {
  ticker: string;
  strategy: string;
  signalDate: string;
  entryDate: string;
  exitDate: string;
  isScoreHigh: boolean;
  isTop3: boolean;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  exitPrice: number;
  shares: number;
  riskAmount: number;
  pnl: number;
  pnlPct: number;
  rMultiple: number;
  win: boolean;
  holdDays: number;
}

export interface BacktestSummary {
  completed: string[];
  failed: string[];
  weights: SignalWeight[];
  observationsTotal: number;
}

// Minimum score to count an observation — avoids polluting win rates with weak non-setups
const MIN_SCORE_FOR_OBSERVATION = 4;
// Number of forward bars to check for outcome
const FORWARD_BARS = [5, 10, 15];
// Minimum bars of history required before evaluating a signal
const MIN_HISTORY_BARS = 55;
// Fetch 5 years of history (≈1300 trading days) for richer calibration
export const HISTORY_DAYS = 1300;

/**
 * Extended backtest universe — liquid US stocks across sectors.
 * Used ONLY for calibrating condition weights; not added to the live watchlist.
 * Covers diverse market environments: growth, value, cyclical, defensive, high-beta.
 *
 * Vercel note: ~100 tickers × 300ms delay = ~30s. Run via curl from local terminal
 * if the Vercel 60s function timeout is a concern:
 *   curl -X POST http://localhost:3000/api/backtest
 */
export const BACKTEST_UNIVERSE: Array<{ ticker: string; strategy: string }> = [
  // Large-cap Tech / Growth (momentum + EMA pullback candidates)
  { ticker: "AAPL",  strategy: "momentum" },
  { ticker: "MSFT",  strategy: "momentum" },
  { ticker: "AMZN",  strategy: "momentum" },
  { ticker: "GOOGL", strategy: "momentum" },
  { ticker: "META",  strategy: "momentum" },
  { ticker: "NVDA",  strategy: "momentum" },
  { ticker: "AMD",   strategy: "momentum" },
  { ticker: "INTC",  strategy: "mean_reversion" },
  { ticker: "CRM",   strategy: "momentum" },
  { ticker: "ADBE",  strategy: "ema_pullback" },
  { ticker: "SNOW",  strategy: "momentum" },
  { ticker: "NOW",   strategy: "momentum" },
  { ticker: "DDOG",  strategy: "momentum" },
  { ticker: "NET",   strategy: "momentum" },
  { ticker: "CRWD",  strategy: "momentum" },
  { ticker: "ANET",  strategy: "momentum" },
  { ticker: "MRVL",  strategy: "momentum" },
  { ticker: "SMCI",  strategy: "mean_reversion" },
  { ticker: "AVGO",  strategy: "ema_pullback" },
  { ticker: "QCOM",  strategy: "ema_pullback" },
  // Financials
  { ticker: "JPM",   strategy: "ema_pullback" },
  { ticker: "GS",    strategy: "momentum" },
  { ticker: "BAC",   strategy: "mean_reversion" },
  { ticker: "MS",    strategy: "momentum" },
  { ticker: "V",     strategy: "ema_pullback" },
  { ticker: "MA",    strategy: "ema_pullback" },
  { ticker: "AXP",   strategy: "ema_pullback" },
  { ticker: "BLK",   strategy: "momentum" },
  { ticker: "SCHW",  strategy: "mean_reversion" },
  { ticker: "COF",   strategy: "mean_reversion" },
  // Healthcare / Biotech
  { ticker: "UNH",   strategy: "ema_pullback" },
  { ticker: "LLY",   strategy: "momentum" },
  { ticker: "JNJ",   strategy: "mean_reversion" },
  { ticker: "ABBV",  strategy: "ema_pullback" },
  { ticker: "MRK",   strategy: "ema_pullback" },
  { ticker: "BMY",   strategy: "mean_reversion" },
  { ticker: "AMGN",  strategy: "mean_reversion" },
  { ticker: "REGN",  strategy: "momentum" },
  { ticker: "VRTX",  strategy: "momentum" },
  { ticker: "ISRG",  strategy: "ema_pullback" },
  // Energy
  { ticker: "XOM",   strategy: "ema_pullback" },
  { ticker: "CVX",   strategy: "ema_pullback" },
  { ticker: "SLB",   strategy: "momentum" },
  { ticker: "MPC",   strategy: "momentum" },
  { ticker: "VLO",   strategy: "momentum" },
  { ticker: "COP",   strategy: "ema_pullback" },
  { ticker: "EOG",   strategy: "ema_pullback" },
  { ticker: "PSX",   strategy: "mean_reversion" },
  // Industrials / Defense
  { ticker: "CAT",   strategy: "ema_pullback" },
  { ticker: "DE",    strategy: "ema_pullback" },
  { ticker: "HON",   strategy: "ema_pullback" },
  { ticker: "UPS",   strategy: "mean_reversion" },
  { ticker: "FDX",   strategy: "mean_reversion" },
  { ticker: "LMT",   strategy: "ema_pullback" },
  { ticker: "RTX",   strategy: "ema_pullback" },
  { ticker: "NOC",   strategy: "ema_pullback" },
  { ticker: "GE",    strategy: "momentum" },
  { ticker: "MMM",   strategy: "mean_reversion" },
  // Consumer Discretionary
  { ticker: "HD",    strategy: "ema_pullback" },
  { ticker: "COST",  strategy: "ema_pullback" },
  { ticker: "MCD",   strategy: "ema_pullback" },
  { ticker: "NKE",   strategy: "mean_reversion" },
  { ticker: "SBUX",  strategy: "mean_reversion" },
  { ticker: "TGT",   strategy: "mean_reversion" },
  { ticker: "LOW",   strategy: "ema_pullback" },
  { ticker: "BKNG",  strategy: "momentum" },
  { ticker: "ABNB",  strategy: "momentum" },
  { ticker: "UBER",  strategy: "momentum" },
  // Consumer Staples (mean-reversion candidates — range-bound)
  { ticker: "PG",    strategy: "mean_reversion" },
  { ticker: "KO",    strategy: "mean_reversion" },
  { ticker: "PEP",   strategy: "mean_reversion" },
  { ticker: "WMT",   strategy: "ema_pullback" },
  { ticker: "PM",    strategy: "mean_reversion" },
  // Broad market ETFs (ETF rotation calibration)
  { ticker: "SPY",   strategy: "etf_rotation" },
  { ticker: "QQQ",   strategy: "etf_rotation" },
  { ticker: "IWM",   strategy: "etf_rotation" },
  { ticker: "XLK",   strategy: "etf_rotation" },
  { ticker: "XLF",   strategy: "etf_rotation" },
  { ticker: "XLE",   strategy: "etf_rotation" },
  { ticker: "XLV",   strategy: "etf_rotation" },
  { ticker: "XLI",   strategy: "etf_rotation" },
  { ticker: "XLY",   strategy: "etf_rotation" },
  { ticker: "GLD",   strategy: "etf_rotation" },
  { ticker: "TLT",   strategy: "etf_rotation" },
  { ticker: "ITA",   strategy: "etf_rotation" },
  // High-beta / speculative (good for mean-reversion calibration)
  { ticker: "PLTR",  strategy: "mean_reversion" },
  { ticker: "SOFI",  strategy: "mean_reversion" },
  { ticker: "RIVN",  strategy: "mean_reversion" },
  { ticker: "LCID",  strategy: "mean_reversion" },
  { ticker: "HOOD",  strategy: "mean_reversion" },
  { ticker: "COIN",  strategy: "momentum" },
  { ticker: "MSTR",  strategy: "momentum" },
  { ticker: "TSLA",  strategy: "momentum" },
  // Mid-cap growth
  { ticker: "APP",   strategy: "momentum" },
  { ticker: "FTNT",  strategy: "momentum" },
  { ticker: "PANW",  strategy: "ema_pullback" },
  { ticker: "ARM",   strategy: "momentum" },
  { ticker: "MU",    strategy: "ema_pullback" },
];

/** Runs the backtest for one ticker + strategy combination.
 *  Returns per-condition win rates based on 2 years of daily bars. */
export async function backtestTicker(
  ticker: string,
  strategy: string,
  high52w: number,
  spyBars: HistoricalBar[]
): Promise<BacktestResult | null> {
  const bars = await getHistorical(ticker, HISTORY_DAYS);
  if (bars.length < MIN_HISTORY_BARS + Math.max(...FORWARD_BARS)) return null;

  // Track condition counts: met+won / met+total per condition per forward horizon
  const conditionStats: Record<string, { wins: number; total: number }> = {};

  const scorer =
    strategy === "ema_pullback"     ? scoreEMAPullback
    : strategy === "mean_reversion" ? scoreMeanReversion
    : strategy === "etf_rotation"   ? scoreETFRotation
    : scoreMomentumBreakout;

  // Walk forward: for each bar from MIN_HISTORY_BARS to (end - max forward bars)
  const maxForward = Math.max(...FORWARD_BARS);
  for (let i = MIN_HISTORY_BARS; i < bars.length - maxForward; i++) {
    const historySlice = bars.slice(0, i + 1);
    const spySlice = spyBars.slice(0, i + 1); // align SPY window to same length as possible
    const latestBar = historySlice[historySlice.length - 1];

    const ind = computeIndicators(historySlice, high52w, spySlice);
    const { score, conditions } = scorer(ind, historySlice);

    // Only count observations where the signal is at least "weak"
    if (score < MIN_SCORE_FOR_OBSERVATION) continue;

    // Outcome: did price close higher at T+5, T+10, T+15? Use median of the 3.
    const outcomes = FORWARD_BARS.map((fwd) => {
      const futureBar = bars[i + fwd];
      return futureBar ? futureBar.close > latestBar.close : null;
    }).filter((v): v is boolean => v !== null);

    if (outcomes.length === 0) continue;
    // Win = majority of forward windows show higher price
    const wins = outcomes.filter(Boolean).length;
    const isWin = wins > outcomes.length / 2;

    for (const condition of conditions) {
      if (!condition.met) continue; // only track conditions that were actually met
      const key = condition.label;
      if (!conditionStats[key]) conditionStats[key] = { wins: 0, total: 0 };
      conditionStats[key].total += 1;
      if (isWin) conditionStats[key].wins += 1;
    }
  }

  // Convert to win rate map
  const conditionWinRates: Record<string, { winRate: number; sampleCount: number }> = {};
  for (const [key, stat] of Object.entries(conditionStats)) {
    if (stat.total >= 5) { // require minimum 5 observations for statistical relevance
      conditionWinRates[key] = {
        winRate: stat.wins / stat.total,
        sampleCount: stat.total,
      };
    }
  }

  return {
    strategy,
    ticker,
    totalObservations: Object.values(conditionStats).reduce((s, v) => s + v.total, 0),
    conditionWinRates,
  };
}

/** Aggregates backtest results across all tickers for a given strategy.
 *  Merges per-ticker condition stats into strategy-level win rates. */
function aggregateResults(results: BacktestResult[], strategy: string): SignalWeight[] {
  const merged: Record<string, { wins: number; total: number }> = {};

  for (const result of results) {
    if (result.strategy !== strategy) continue;
    for (const [condition, { winRate, sampleCount }] of Object.entries(result.conditionWinRates)) {
      if (!merged[condition]) merged[condition] = { wins: 0, total: 0 };
      merged[condition].wins += Math.round(winRate * sampleCount);
      merged[condition].total += sampleCount;
    }
  }

  return Object.entries(merged)
    .filter(([, stat]) => stat.total >= 10) // strategy-level minimum sample
    .map(([condition_name, stat]) => ({
      strategy,
      condition_name,
      win_rate: stat.wins / stat.total,
      sample_count: stat.total,
    }));
}

/** Runs the full backtest across all provided tickers and strategies.
 *  Saves aggregated win-rate weights to Supabase.
 *  Returns a summary of what completed vs failed. */
export async function runFullBacktest(
  tickers: Array<{ ticker: string; strategy: string; high52w: number }>,
  spyBars: HistoricalBar[]
): Promise<BacktestSummary> {
  const strategies = [...new Set(tickers.map((t) => t.strategy))];
  const completed: string[] = [];
  const failed: string[] = [];
  const allResults: BacktestResult[] = [];

  // Run backtest for each ticker sequentially to avoid Yahoo Finance rate limiting
  for (const { ticker, strategy, high52w } of tickers) {
    try {
      const result = await backtestTicker(ticker, strategy, high52w, spyBars);
      if (result) {
        allResults.push(result);
        completed.push(`${ticker}:${strategy}`);
      } else {
        failed.push(`${ticker}:${strategy} (insufficient data)`);
      }
    } catch (err) {
      failed.push(`${ticker}:${strategy} (error: ${err instanceof Error ? err.message : String(err)})`);
    }
    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 300));
  }

  // Aggregate per-strategy and save to Supabase
  const allWeights: SignalWeight[] = [];
  for (const strategy of strategies) {
    const weights = aggregateResults(allResults, strategy);
    allWeights.push(...weights);
  }

  if (allWeights.length > 0) {
    await upsertSignalWeights(allWeights);
  }

  const observationsTotal = allResults.reduce((s, r) => s + r.totalObservations, 0);

  return { completed, failed, weights: allWeights, observationsTotal };
}

// --- New: Watchlist-specific simulation for trade-level profit/loss reporting ---

export interface WatchlistSignalSnapshot {
  ticker: string;
  strategy: string;
  signalDate: string;
  score: number;
  convictionScore: number;
  convictionBand: "high" | "medium" | "low";
  isScoreHigh: boolean;
  isTop3: boolean;
  isWatch82: boolean;
  atr14: number;
  entryPriceSignal: number;
  stopPriceSignal: number;
}

export interface WatchlistBacktestConfig {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  fixedShares: number;
  atrPeriod: number;
  targetMultiplier: number;
  maxHoldDays?: number;
  includeMode?: "both" | "trade" | "watch";

  // Optional strategy knobs for tuning/walkforward sweep
  minScore?: number;       // min score to treat as high conviction (default 4)
  topN?: number;           // number of top convictions to always include (default 3)
  trendFilter?: boolean;   // enforce moving average trend (ma20 > ma50)
  requireBreakout?: boolean; // require next-day close > prev close high
  maxEntryGapPct?: number; // skip if next open gaps more than this % from signal close
  minHoldDays?: number;    // enforce minimum days to hold before exit logic applies
  reportTopCount?: number; // number of top conviction and best performers to show (default 5, min 5)
}

export interface WatchlistTickerPerformance {
  ticker: string;
  pnl: number;
  pnlPct: number;
  winRate: number;
  resultsCount: number;
  avgHoldDays: number;
  convictionScore: number;
}

export interface WatchlistBacktestResult {
  signals: WatchlistSignalSnapshot[];
  trades: TradeResult[];
  summary: {
    totalSignals: number;
    totalTrades: number;
    wins: number;
    losses: number;
    winRate: number;
    netPnl: number;
    grossProfit: number;
    grossLoss: number;
    avgWinPct: number;
    avgLossPct: number;
    totalRisked: number;
    averageHoldDays: number;
    topConvictionTickers: WatchlistTickerPerformance[];
    bestPerformers: WatchlistTickerPerformance[];
    switchCountsPerTicker: Record<string, { tradeToWatch: number; watchToTrade: number; totalSwitches: number }>;
    switchDistribution: Array<{ switches: number; count: number }>;
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function findBarIndexByDate(bars: HistoricalBar[], date: string): number {
  return bars.findIndex((bar) => formatDate(bar.date) === date);
}

function findNearestBarIndexOnOrBeforeDate(bars: HistoricalBar[], date: string): number {
  const idx = findBarIndexByDate(bars, date);
  if (idx !== -1) return idx;

  const target = new Date(date);
  for (let i = bars.length - 1; i >= 0; i--) {
    const barDate = new Date(formatDate(bars[i].date));
    if (barDate <= target) {
      return i;
    }
  }

  return -1;
}

function calcAtr(bars: HistoricalBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const high = bars[i].high;
    const low = bars[i].low;
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  if (trs.length < period) return trs.reduce((s, v) => s + v, 0) / trs.length;
  return trs.slice(-period).reduce((s, v) => s + v, 0) / period;
}

function calcFib82Level(bars: HistoricalBar[]): number | null {
  if (bars.length < 10) return null;
  const prices = bars.map((b) => b.close);
  const highest = Math.max(...prices);
  const lowest = Math.min(...prices);
  return highest - (highest - lowest) * 0.82;
}

function isWatch82Signal(bars: HistoricalBar[]): boolean {
  const level = calcFib82Level(bars);
  if (level === null) return false;
  const lastClose = bars[bars.length - 1].close;
  const tolerance = level * 0.005; // 0.5%
  return Math.abs(lastClose - level) <= tolerance;
}

function simulateTradeFromSignal(
  bars: HistoricalBar[],
  entryIndex: number,
  entryPrice: number,
  stopPrice: number,
  targetPrice: number,
  fixedShares: number,
  maxHoldDays?: number,
  minHoldDays?: number
): {
  exitDate: string;
  exitPrice: number;
  win: boolean;
  holdDays: number;
  pnl: number;
  rMultiple: number;
} {
  let exitPrice = bars[entryIndex].close;
  let exitDate = formatDate(bars[entryIndex].date);
  let win = false;
  let foundExit = false;

  const start = entryIndex + 1 + (minHoldDays ? minHoldDays : 0);
  const end = maxHoldDays ? Math.min(bars.length, entryIndex + 1 + maxHoldDays) : bars.length;

  for (let i = start; i < end; i++) {
    const bar = bars[i];
    const lowHit = bar.low <= stopPrice;
    const highHit = bar.high >= targetPrice;

    if (lowHit && highHit) {
      // if both hit same day, pick closer to open price by default (conservative: stop)
      exitPrice = stopPrice;
      exitDate = formatDate(bar.date);
      win = false;
      foundExit = true;
      break;
    }
    if (lowHit) {
      exitPrice = stopPrice;
      exitDate = formatDate(bar.date);
      win = false;
      foundExit = true;
      break;
    }
    if (highHit) {
      exitPrice = targetPrice;
      exitDate = formatDate(bar.date);
      win = true;
      foundExit = true;
      break;
    }
  }

  if (!foundExit && bars.length > entryIndex) {
    const finalBar = bars[Math.min(bars.length - 1, end - 1)];
    exitPrice = finalBar.close;
    exitDate = formatDate(finalBar.date);
    win = exitPrice >= entryPrice;
  }

  const pnl = (exitPrice - entryPrice) * fixedShares;
  const riskPerShare = entryPrice - stopPrice;
  const rMultiple = riskPerShare > 0 ? (exitPrice - entryPrice) / riskPerShare : 0;

  return {
    exitDate,
    exitPrice,
    win,
    holdDays: Math.max(1, findBarIndexByDate(bars, exitDate) - entryIndex),
    pnl,
    rMultiple,
  };
}

export async function runWatchlistBacktest(
  watchlist: Array<{ ticker: string; strategy: string }>,
  spyBars: HistoricalBar[],
  config: WatchlistBacktestConfig
): Promise<WatchlistBacktestResult> {
  const startDate = config.startDate;
  const endDate = config.endDate;

  const minScore = config.minScore ?? MIN_SCORE_FOR_OBSERVATION;
  const topN = config.topN ?? 3;
  const includeMode = config.includeMode ?? "both";
  const trendFilter = config.trendFilter ?? false;
  const requireBreakout = config.requireBreakout ?? false;
  const maxEntryGapPct = config.maxEntryGapPct ?? 100;
  const minHoldDays = config.minHoldDays ?? 0;

  const signalCandidates: WatchlistSignalSnapshot[] = [];
  const transitionStats: Record<
    string,
    { tradeToWatch: number; watchToTrade: number; totalSwitches: number }
  > = {};

  for (const { ticker, strategy } of watchlist) {
    transitionStats[ticker] = { tradeToWatch: 0, watchToTrade: 0, totalSwitches: 0 };
    try {
      const quote = await getQuote(ticker);
      if (!quote) continue;

      const bars = await getHistorical(ticker, HISTORY_DAYS);
      if (bars.length < MIN_HISTORY_BARS) continue;

      const startIndex = findNearestBarIndexOnOrBeforeDate(bars, startDate);
      const endIndex = findNearestBarIndexOnOrBeforeDate(bars, endDate);
      if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) continue;

      // Collect transition counts between trade and watch signals over the window
      let prevState: "none" | "trade" | "watch" = "none";
      for (let i = startIndex; i <= endIndex; i++) {
        if (i < MIN_HISTORY_BARS) continue;
        const slice = bars.slice(0, i + 1);
        const daySignal = buildSignal(ticker, strategy, slice, quote.high52w, spyBars);
        const isTradeSignal = daySignal.score >= minScore;
        const isCurrentWatch82 = isWatch82Signal(slice);

        const currentState = isTradeSignal ? "trade" : isCurrentWatch82 ? "watch" : "none";
        if (prevState === "trade" && currentState === "watch") {
          transitionStats[ticker].tradeToWatch += 1;
          transitionStats[ticker].totalSwitches += 1;
        }
        if (prevState === "watch" && currentState === "trade") {
          transitionStats[ticker].watchToTrade += 1;
          transitionStats[ticker].totalSwitches += 1;
        }

        prevState = currentState;
      }

      const signalIndex = findNearestBarIndexOnOrBeforeDate(bars, startDate);
      if (signalIndex === -1) continue;

      // Ensure we can enter on the next day
      if (signalIndex + 1 >= bars.length) continue;

      const signalBars = bars.slice(0, signalIndex + 1);
      const signal = buildSignal(ticker, strategy, signalBars, quote.high52w, spyBars);
      const atr = signal.indicators.atr14 || calcAtr(signalBars.slice(-config.atrPeriod), config.atrPeriod);

      if (trendFilter && !(signal.indicators.ma20 > signal.indicators.ma50)) {
        continue;
      }

      // entry is next trading bar
      const entryBar = bars[signalIndex + 1];
      if (!entryBar) continue;

      const prevClose = bars[signalIndex].close;
      const gapPct = Math.abs(entryBar.open - prevClose) / prevClose * 100;
      if (maxEntryGapPct > 0 && gapPct > maxEntryGapPct) continue;

      if (requireBreakout && entryBar.close <= bars[signalIndex].high) continue;

      const entryPrice = entryBar.open;
      const stopPrice = Math.max(0.001, entryPrice - atr);

      signalCandidates.push({
        ticker,
        strategy,
        signalDate: formatDate(bars[signalIndex].date),
        score: signal.score,
        convictionScore: signal.convictionScore,
        convictionBand: signal.convictionBand,
        isScoreHigh: signal.score >= minScore,
        isTop3: false,
        isWatch82: isWatch82Signal(signalBars),
        atr14: atr,
        entryPriceSignal: entryPrice,
        stopPriceSignal: stopPrice,
      });
    } catch {
      continue;
    }
  }

  // Mark top3 by convictionScore
  const topTickers = [...signalCandidates]
    .sort((a, b) => b.convictionScore - a.convictionScore)
    .slice(0, topN)
    .map((c) => c.ticker);

  for (const c of signalCandidates) {
    c.isTop3 = topTickers.includes(c.ticker);
  }

  const trades: TradeResult[] = [];

  for (const candidate of signalCandidates) {
    const tradeCandidate = candidate.isScoreHigh || candidate.isTop3;
    if (includeMode === "trade" && !tradeCandidate) continue;
    if (includeMode === "watch" && !candidate.isWatch82) continue;
    if (includeMode === "both" && !tradeCandidate && !candidate.isWatch82) continue;

    const bars = await getHistorical(candidate.ticker, HISTORY_DAYS);
    const signalIndex = findBarIndexByDate(bars, candidate.signalDate);
    if (signalIndex === -1 || signalIndex + 1 >= bars.length) continue;

    const entryBar = bars[signalIndex + 1];
    const entryDate = formatDate(entryBar.date);
    if (entryDate > endDate) continue; // entry must be on or before endDate

    const targetPrice = candidate.entryPriceSignal + config.targetMultiplier * (candidate.entryPriceSignal - candidate.stopPriceSignal);
    const result = simulateTradeFromSignal(
      bars,
      signalIndex + 1,
      entryBar.open,
      candidate.stopPriceSignal,
      targetPrice,
      config.fixedShares,
      config.maxHoldDays,
      minHoldDays
    );

    const pnlPct = result.exitPrice / entryBar.open - 1;

    trades.push({
      ticker: candidate.ticker,
      strategy: candidate.strategy,
      signalDate: candidate.signalDate,
      entryDate,
      exitDate: result.exitDate,
      isScoreHigh: candidate.isScoreHigh,
      isTop3: candidate.isTop3,
      entryPrice: entryBar.open,
      stopPrice: candidate.stopPriceSignal,
      targetPrice,
      exitPrice: result.exitPrice,
      shares: config.fixedShares,
      riskAmount: (entryBar.open - candidate.stopPriceSignal) * config.fixedShares,
      pnl: result.pnl,
      pnlPct: pnlPct * 100,
      rMultiple: result.rMultiple,
      win: result.win,
      holdDays: result.holdDays,
    });
  }

  const wins = trades.filter((t) => t.win).length;
  const losses = trades.filter((t) => !t.win).length;
  const netPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossProfit = trades.filter((t) => t.win).reduce((s, t) => s + t.pnl, 0);
  const grossLoss = trades.filter((t) => !t.win).reduce((s, t) => s + t.pnl, 0);
  const totalRisked = trades.reduce((s, t) => s + t.riskAmount, 0);
  const avgWinPct = trades.filter((t) => t.win).reduce((s, t) => s + t.pnlPct, 0) / Math.max(1, wins);
  const avgLossPct = trades.filter((t) => !t.win).reduce((s, t) => s + t.pnlPct, 0) / Math.max(1, losses);
  const avgHoldDays = trades.reduce((s, t) => s + t.holdDays, 0) / Math.max(1, trades.length);

  const tickerStats: Record<string, { totalPnl: number; totalPnlPct: number; win: number; total: number; totalHoldDays: number; maxConviction: number; }> = {};
  for (const tr of trades) {
    const stats = tickerStats[tr.ticker] ?? { totalPnl: 0, totalPnlPct: 0, win: 0, total: 0, totalHoldDays: 0, maxConviction: 0 };
    stats.totalPnl += tr.pnl;
    stats.totalPnlPct += tr.pnlPct;
    if (tr.win) stats.win += 1;
    stats.total += 1;
    stats.totalHoldDays += tr.holdDays;
    const signal = signalCandidates.find((s) => s.ticker === tr.ticker && s.signalDate === tr.signalDate);
    if (signal && signal.convictionScore > stats.maxConviction) {
      stats.maxConviction = signal.convictionScore;
    }
    tickerStats[tr.ticker] = stats;
  }

  // include tickers that had signals but no executed trades as well
  for (const s of signalCandidates) {
    if (!tickerStats[s.ticker]) {
      tickerStats[s.ticker] = {
        totalPnl: 0,
        totalPnlPct: 0,
        win: 0,
        total: 0,
        totalHoldDays: 0,
        maxConviction: s.convictionScore,
      };
    } else {
      tickerStats[s.ticker].maxConviction = Math.max(tickerStats[s.ticker].maxConviction, s.convictionScore);
    }
  }

  const perTicker = Object.entries(tickerStats).map(([ticker, stats]) => ({
    ticker,
    pnl: stats.totalPnl,
    pnlPct: stats.total > 0 ? stats.totalPnlPct / stats.total : 0,
    winRate: stats.total > 0 ? stats.win / stats.total : 0,
    resultsCount: stats.total,
    avgHoldDays: stats.total > 0 ? stats.totalHoldDays / stats.total : 0,
    convictionScore: stats.maxConviction,
  }));

  const reportTopCount = Math.max(5, config.reportTopCount ?? 5);
  const maxTop = Math.min(reportTopCount, perTicker.length);

  const topConvictionTickers = [...perTicker]
    .sort((a, b) => b.convictionScore - a.convictionScore || b.pnl - a.pnl)
    .slice(0, maxTop);

  const bestPerformers = [...perTicker]
    .sort((a, b) => b.pnlPct - a.pnlPct || b.pnl - a.pnl)
    .slice(0, maxTop);

  const switchCountsPerTicker = transitionStats;
  const switchDistributionMap = new Map<number, number>();
  for (const tickerStats of Object.values(transitionStats)) {
    const count = tickerStats.totalSwitches;
    switchDistributionMap.set(count, (switchDistributionMap.get(count) ?? 0) + 1);
  }
  const switchDistribution = Array.from(switchDistributionMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([switches, count]) => ({ switches, count }));

  return {
    signals: signalCandidates,
    trades,
    summary: {
      totalSignals: signalCandidates.length,
      totalTrades: trades.length,
      wins,
      losses,
      winRate: trades.length > 0 ? wins / trades.length : 0,
      netPnl,
      grossProfit,
      grossLoss,
      avgWinPct,
      avgLossPct,
      totalRisked,
      averageHoldDays: avgHoldDays,
      topConvictionTickers,
      bestPerformers,
      switchCountsPerTicker,
      switchDistribution,
    },
  };
}

export interface WatchlistBacktestSweepResult {
  config: WatchlistBacktestConfig;
  result: WatchlistBacktestResult;
}

export async function runWatchlistBacktestSweep(
  watchlist: Array<{ ticker: string; strategy: string }>,
  spyBars: HistoricalBar[],
  sweepConfigs: WatchlistBacktestConfig[]
): Promise<WatchlistBacktestSweepResult[]> {
  const sweepResults: WatchlistBacktestSweepResult[] = [];

  for (const config of sweepConfigs) {
    const result = await runWatchlistBacktest(watchlist, spyBars, config);
    sweepResults.push({ config, result });
  }

  return sweepResults;
}
