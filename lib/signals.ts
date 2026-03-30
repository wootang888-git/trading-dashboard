import { HistoricalBar } from "./yahoo";

export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  ema8: number;
  ema20: number;
  volumeRatio: number;
  priceVs52wHigh: number;
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  isNear52wHigh: boolean;
  atr14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  bbUpper: number;
  bbLower: number;
  bbWidth: number;
  bbPct: number;
}

export interface Condition {
  label: string;
  met: boolean;
}

export interface Signal {
  ticker: string;
  score: number;
  strength: "strong" | "moderate" | "weak" | "none";
  strategy: string;
  indicators: Indicators;
  entryNote: string;
  stopNote: string;
  conditions: Condition[];
}

// ─── Indicator helpers ───────────────────────────────────────────────────────

function calcRSI(bars: HistoricalBar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function calcMA(bars: HistoricalBar[], period: number): number {
  if (bars.length < period) return 0;
  return bars.slice(-period).reduce((s, b) => s + b.close, 0) / period;
}

function calcAvgVolume(bars: HistoricalBar[], period = 20): number {
  if (bars.length < period) return 0;
  return bars.slice(-period).reduce((s, b) => s + b.volume, 0) / period;
}

/** Returns the full EMA series (same length as bars array) */
export function calcEMASeries(bars: HistoricalBar[], period: number): number[] {
  if (bars.length === 0) return [];
  const k = 2 / (period + 1);
  const seed = bars.slice(0, Math.min(period, bars.length))
    .reduce((s, b) => s + b.close, 0) / Math.min(period, bars.length);
  let ema = seed;
  return bars.map((bar) => {
    ema = bar.close * k + ema * (1 - k);
    return ema;
  });
}

function calcEMA(bars: HistoricalBar[], period: number): number {
  const series = calcEMASeries(bars, period);
  return series.length > 0 ? series[series.length - 1] : 0;
}

/** ATR (Average True Range) — 14-period */
function calcATR(bars: HistoricalBar[], period = 14): number {
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

/** MACD — returns { macd, signal, hist } using standard 12/26/9 settings */
function calcMACD(bars: HistoricalBar[]): { macd: number; signal: number; hist: number } {
  if (bars.length < 26) return { macd: 0, signal: 0, hist: 0 };
  const ema12Series = calcEMASeries(bars, 12);
  const ema26Series = calcEMASeries(bars, 26);
  const macdSeries = ema12Series.map((v, i) => v - ema26Series[i]);
  // Signal = 9-period EMA of macd series
  const k = 2 / (9 + 1);
  let signal = macdSeries.slice(0, 9).reduce((s, v) => s + v, 0) / 9;
  for (let i = 9; i < macdSeries.length; i++) {
    signal = macdSeries[i] * k + signal * (1 - k);
  }
  const macd = macdSeries[macdSeries.length - 1];
  return { macd, signal, hist: macd - signal };
}

/** Bollinger Bands — 20-period SMA ± 2 std dev */
function calcBollingerBands(bars: HistoricalBar[], period = 20): {
  upper: number; lower: number; width: number; pct: number;
} {
  if (bars.length < period) return { upper: 0, lower: 0, width: 0, pct: 0.5 };
  const slice = bars.slice(-period).map((b) => b.close);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  const upper = mean + 2 * std;
  const lower = mean - 2 * std;
  const width = std > 0 ? (upper - lower) / mean : 0;
  const latest = bars[bars.length - 1].close;
  const pct = upper !== lower ? (latest - lower) / (upper - lower) : 0.5;
  return { upper, lower, width, pct };
}

// ─── computeIndicators ───────────────────────────────────────────────────────

export function computeIndicators(bars: HistoricalBar[], high52w: number): Indicators {
  const zero: Indicators = {
    rsi14: 50, ma20: 0, ma50: 0, ema8: 0, ema20: 0,
    volumeRatio: 1, priceVs52wHigh: 0,
    isAboveMa20: false, isAboveMa50: false, isNear52wHigh: false,
    atr14: 0, macd: 0, macdSignal: 0, macdHist: 0,
    bbUpper: 0, bbLower: 0, bbWidth: 0, bbPct: 0.5,
  };
  if (bars.length === 0) return zero;

  const latest = bars[bars.length - 1];
  const rsi14 = calcRSI(bars);
  const ma20 = calcMA(bars, 20);
  const ma50 = calcMA(bars, 50);
  const ema8 = calcEMA(bars, 8);
  const ema20 = calcEMA(bars, 20);
  const avgVol = calcAvgVolume(bars);
  const volumeRatio = avgVol > 0 ? latest.volume / avgVol : 1;
  const priceVs52wHigh = high52w > 0 ? ((high52w - latest.close) / high52w) * 100 : 100;
  const atr14 = calcATR(bars);
  const { macd, signal: macdSignal, hist: macdHist } = calcMACD(bars);
  const { upper: bbUpper, lower: bbLower, width: bbWidth, pct: bbPct } = calcBollingerBands(bars);

  return {
    rsi14, ma20, ma50, ema8, ema20, volumeRatio, priceVs52wHigh,
    isAboveMa20: latest.close > ma20,
    isAboveMa50: latest.close > ma50,
    isNear52wHigh: priceVs52wHigh <= 10,
    atr14, macd, macdSignal, macdHist,
    bbUpper, bbLower, bbWidth, bbPct,
  };
}

// ─── Strategy: Momentum Breakout ─────────────────────────────────────────────

export function scoreMomentumBreakout(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string; conditions: Condition[] } {
  let score = 0;

  const rsiHealthy = ind.rsi14 >= 50 && ind.rsi14 <= 75;
  const rsiExtended = ind.rsi14 > 75;
  if (rsiHealthy) score += 2;
  else if (rsiExtended) score += 1;

  if (ind.isAboveMa20) score += 2;
  if (ind.isAboveMa50) score += 1;
  if (ind.isNear52wHigh) score += 2;

  const volumeSurge = ind.volumeRatio >= 1.5;
  const volumeOk = ind.volumeRatio >= 1.2;
  if (volumeSurge) score += 2;
  else if (volumeOk) score += 1;

  let recentUptrend = false;
  if (bars.length >= 5) {
    const recent = bars.slice(-5);
    recentUptrend = recent[recent.length - 1].close > recent[0].close;
    if (recentUptrend) score += 1;
  }

  const macdBullish = ind.macdHist > 0;
  if (macdBullish) score += 1;

  const latest = bars[bars.length - 1];
  const entryPrice = latest.high + 0.05;
  const atrStop = ind.atr14 > 0 ? entryPrice - 1.5 * ind.atr14 : latest.low;

  return {
    score: Math.min(score, 10),
    entryNote: `Buy stop $0.05 above $${latest.high.toFixed(2)} (today's high / resistance)`,
    stopNote: `Stop $${atrStop.toFixed(2)} (1.5× ATR below entry — ATR $${ind.atr14.toFixed(2)})`,
    conditions: [
      { label: "RSI 50–75", met: rsiHealthy || rsiExtended },
      { label: "Above MA20", met: ind.isAboveMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "Near 52w high", met: ind.isNear52wHigh },
      { label: "Volume surge", met: volumeSurge || volumeOk },
      { label: "Recent uptrend", met: recentUptrend },
      { label: "MACD bullish", met: macdBullish },
    ],
  };
}

// ─── Strategy: 8 EMA Pullback ────────────────────────────────────────────────
//
// Setup: uptrend (8 EMA > 20 EMA), price pulls back to 8 EMA, bounce candle.
// Ideal RSI 40–65. Entry above today's high; stop below 8 EMA.

export function scoreEMAPullback(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string; conditions: Condition[] } {
  let score = 0;

  const latest = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : latest;

  // 1. EMA alignment: 8 EMA above 20 EMA (confirms uptrend)
  const emaAligned = ind.ema8 > ind.ema20;
  if (emaAligned) score += 2;

  // 2. Price proximity to 8 EMA (the pullback condition)
  const distFromEma8 = ind.ema8 > 0
    ? Math.abs(latest.close - ind.ema8) / ind.ema8
    : 1;
  const tightToEma = distFromEma8 <= 0.05;
  if (distFromEma8 <= 0.015) score += 3;
  else if (distFromEma8 <= 0.03) score += 2;
  else if (distFromEma8 <= 0.05) score += 1;

  // 3. Bounce candle: green and closed above prior close
  const bounceCandle = latest.close > prev.close && latest.close > latest.open;
  if (bounceCandle) score += 2;

  // 4. RSI in healthy pullback zone
  const rsiHealthy = ind.rsi14 >= 40 && ind.rsi14 <= 75;
  if (ind.rsi14 >= 40 && ind.rsi14 <= 65) score += 2;
  else if (ind.rsi14 > 65 && ind.rsi14 <= 75) score += 1;

  // 5. Lower volume on pullback = healthy retracement
  const lowPullbackVol = ind.volumeRatio < 0.8;
  if (lowPullbackVol) score += 1;

  const macdTurning = ind.macdHist > 0 || (ind.macd < 0 && ind.macdHist > -0.05);
  if (macdTurning) score += 1;

  const entryPrice = latest.high + 0.05;
  const atrStop = ind.atr14 > 0 ? entryPrice - 1.5 * ind.atr14 : (ind.ema8 > 0 ? ind.ema8 * 0.99 : latest.low);

  return {
    score: Math.min(score, 10),
    entryNote: `Buy above $${entryPrice.toFixed(2)} (8 EMA pullback bounce)`,
    stopNote: `Stop $${atrStop.toFixed(2)} (1.5× ATR below entry — ATR $${ind.atr14.toFixed(2)})`,
    conditions: [
      { label: "8 EMA > 20 EMA", met: emaAligned },
      { label: "Tight to 8 EMA", met: tightToEma },
      { label: "Bounce candle", met: bounceCandle },
      { label: "RSI 40–75", met: rsiHealthy },
      { label: "Low pullback vol", met: lowPullbackVol },
      { label: "MACD turning", met: macdTurning },
    ],
  };
}

// ─── Strategy: Mean Reversion ────────────────────────────────────────────────
//
// Setup: stock pulled back sharply, oversold, showing early recovery signs.
// Best on liquid large-caps that tend to snap back (not broken stocks).

export function scoreMeanReversion(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string; conditions: Condition[] } {
  let score = 0;

  const latest = bars[bars.length - 1];
  const prev = bars.length >= 2 ? bars[bars.length - 2] : latest;

  // 1. RSI oversold zone (25–40 = ideal, 40–50 = recovering)
  const rsiOversold = ind.rsi14 >= 25 && ind.rsi14 <= 40;
  const rsiRecovering = ind.rsi14 > 40 && ind.rsi14 <= 50;
  if (rsiOversold) score += 3;
  else if (rsiRecovering) score += 1;

  // 2. Price below MA20 (confirmed pullback)
  const belowMa20 = !ind.isAboveMa20;
  if (belowMa20) score += 2;

  // 3. Longer-term trend intact (above MA50)
  if (ind.isAboveMa50) score += 2;

  // 4. Weak selling volume on pullback (exhaustion signal)
  const weakSellVol = ind.volumeRatio < 0.8;
  if (weakSellVol) score += 1;

  // 5. Reversal candle: green bar closing above prior close
  const reversalCandle = latest.close > prev.close && latest.close > latest.open;
  if (reversalCandle) score += 2;

  // BB squeeze (low width) then price near lower band = ideal mean-rev entry
  const bbSqueeze = ind.bbWidth < 0.08;
  const nearLowerBand = ind.bbPct < 0.2;
  if (bbSqueeze) score += 1;
  if (nearLowerBand) score += 1;

  const entryPrice = latest.high + 0.05;
  const atrStop = ind.atr14 > 0 ? latest.low - 1.5 * ind.atr14 : latest.low - 0.10;

  return {
    score: Math.min(score, 10),
    entryNote: `Buy above $${entryPrice.toFixed(2)} (above reversal candle high)`,
    stopNote: `Stop $${atrStop.toFixed(2)} (1.5× ATR below candle low — ATR $${ind.atr14.toFixed(2)})`,
    conditions: [
      { label: "RSI oversold", met: rsiOversold || rsiRecovering },
      { label: "Below MA20", met: belowMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "Weak sell vol", met: weakSellVol },
      { label: "Reversal candle", met: reversalCandle },
      { label: "Near BB lower", met: nearLowerBand },
    ],
  };
}

// ─── Strategy: ETF Rotation ──────────────────────────────────────────────────
//
// Setup: ETF showing relative strength vs peers, rotating into leadership.
// Key: above both MAs, volume confirming, RSI in healthy range.

export function scoreETFRotation(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string; conditions: Condition[] } {
  let score = 0;

  const latest = bars[bars.length - 1];

  // 1. Trend alignment
  if (ind.isAboveMa20) score += 2;
  if (ind.isAboveMa50) score += 2;

  // 2. RSI in healthy momentum range
  const rsiHealthy = ind.rsi14 >= 50 && ind.rsi14 <= 70;
  const rsiExtended = ind.rsi14 > 70;
  if (rsiHealthy) score += 3;
  else if (rsiExtended) score += 1;

  // 3. Rotation volume confirmation
  const volConfirmed = ind.volumeRatio >= 1.3;
  if (volConfirmed) score += 2;

  // 4. Near 52w high (leadership signal)
  const nearHigh = ind.priceVs52wHigh <= 15;
  if (nearHigh) score += 1;

  const macdBullish = ind.macdHist > 0;
  if (macdBullish) score += 1;

  const entryPrice = latest.close + 0.10;
  const atrStop = ind.atr14 > 0
    ? entryPrice - 1.5 * ind.atr14
    : (ind.ma20 > 0 ? ind.ma20 * 0.99 : latest.low);

  return {
    score: Math.min(score, 10),
    entryNote: `Buy above $${entryPrice.toFixed(2)} (confirmation above current close)`,
    stopNote: `Stop $${atrStop.toFixed(2)} (1.5× ATR below entry — ATR $${ind.atr14.toFixed(2)})`,
    conditions: [
      { label: "Above MA20", met: ind.isAboveMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "RSI 50–70", met: rsiHealthy || rsiExtended },
      { label: "Volume confirmed", met: volConfirmed },
      { label: "Near 52w high", met: nearHigh },
      { label: "MACD bullish", met: macdBullish },
    ],
  };
}

// ─── buildSignal ─────────────────────────────────────────────────────────────

export function buildSignal(
  ticker: string,
  strategy: string,
  bars: HistoricalBar[],
  high52w: number
): Signal {
  const ind = computeIndicators(bars, high52w);

  const { score, entryNote, stopNote, conditions } =
    strategy === "ema_pullback"     ? scoreEMAPullback(ind, bars)
    : strategy === "mean_reversion" ? scoreMeanReversion(ind, bars)
    : strategy === "etf_rotation"   ? scoreETFRotation(ind, bars)
    : scoreMomentumBreakout(ind, bars);

  const strength =
    score >= 8 ? "strong"
    : score >= 6 ? "moderate"
    : score >= 4 ? "weak"
    : "none";

  return { ticker, score, strength, strategy, indicators: ind, entryNote, stopNote, conditions };
}
