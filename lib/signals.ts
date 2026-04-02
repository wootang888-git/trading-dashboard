import { HistoricalBar } from "./yahoo";

export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  ema8: number;
  ema20: number;
  // Sprint 1: EMA Fan
  ema10: number;
  ema50: number;
  emaFanOpen: boolean;     // ema10 > ema20 > ema50 (multi-timeframe alignment)
  emaGapWidening: boolean; // fan expanding = momentum accelerating
  volumeRatio: number;
  // Sprint 1: Volume Price Analysis
  upDayVolRatio: number;   // avg up-day vol / avg down-day vol over 20 bars (>1.2 = accumulation)
  priceVs52wHigh: number;
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  isNear52wHigh: boolean;
  // Sprint 1: RSI Bull Zone
  rsiInBullZone: boolean;  // RSI held 40+ over last 3 bars and current <= 80
  // Sprint 2: Price Structure (HH/HL)
  isHigherHighs: boolean;       // recent swing highs are rising
  isHigherLows: boolean;        // recent swing lows are rising
  trendStructureIntact: boolean; // both HH and HL = confirmed uptrend
  recentSwingLow: number | null; // most recent local swing low price (structural stop anchor)
  // Sprint 2: Relative Strength vs SPY
  rsVsSpy: number | null;  // (stock 20-bar return) - (SPY 20-bar return), null if no SPY data
  rsRising: boolean;       // RS ratio higher now than 10 bars ago
  rsMakingNewHigh: boolean; // RS ratio at 20-bar high
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

export interface ValidationResult {
  passed: boolean;
  conflictPenalty: number;  // 0 or negative (max -15); deducted for conflicting indicators
  dataQualityPts: number;   // 0-15; fresh data, sufficient bars, no volume anomaly
  notes: string[];          // human-readable check results
  checked_at: string;       // ISO timestamp
}

export interface Signal {
  ticker: string;
  score: number;
  strength: "strong" | "moderate" | "weak" | "none";
  strategy: string;
  indicators: Indicators;
  entryNote: string;
  stopNote: string;
  entryPrice: number;
  stopPrice: number;
  conditions: Condition[];
  convictionScore: number;       // 0-100 composite conviction score
  convictionBand: "high" | "medium" | "low";  // high ≥90, medium 70–89, low <70
  sectorRs: number | null;       // stock 20-bar return vs sector ETF (positive = outperforming)
  validation: ValidationResult;
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

// ─── Sprint 2 helpers ────────────────────────────────────────────────────────

/** Detect Higher-Highs and Higher-Lows using a simple rolling-window approach.
 *  Identifies the 3 most recent local swing highs and swing lows in the last
 *  30 bars, then checks if they are rising. */
function detectTrendStructure(bars: HistoricalBar[]): {
  isHigherHighs: boolean; isHigherLows: boolean; recentSwingLow: number | null;
} {
  if (bars.length < 10) return { isHigherHighs: false, isHigherLows: false, recentSwingLow: null };
  const window = bars.slice(-30);
  const swingHighs: number[] = [];
  const swingLows: number[] = [];
  for (let i = 1; i < window.length - 1; i++) {
    if (window[i].high > window[i - 1].high && window[i].high > window[i + 1].high) {
      swingHighs.push(window[i].high);
    }
    if (window[i].low < window[i - 1].low && window[i].low < window[i + 1].low) {
      swingLows.push(window[i].low);
    }
  }
  const isHigherHighs = swingHighs.length >= 2 &&
    swingHighs[swingHighs.length - 1] > swingHighs[swingHighs.length - 2];
  const isHigherLows = swingLows.length >= 2 &&
    swingLows[swingLows.length - 1] > swingLows[swingLows.length - 2];
  const recentSwingLow = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
  return { isHigherHighs, isHigherLows, recentSwingLow };
}

/** Relative Strength vs SPY.
 *  Returns the stock's 20-bar return minus SPY's 20-bar return (outperformance),
 *  whether the ratio is rising (vs 10 bars ago), and whether it is at a 20-bar high. */
function calcRelativeStrength(bars: HistoricalBar[], spyBars: HistoricalBar[]): {
  rsVsSpy: number; rsRising: boolean; rsMakingNewHigh: boolean;
} {
  if (bars.length < 21 || spyBars.length < 21) {
    return { rsVsSpy: 0, rsRising: false, rsMakingNewHigh: false };
  }
  // Build a daily RS ratio series (stock/SPY) aligned by index from the tail
  const len = Math.min(bars.length, spyBars.length, 21);
  const stockSlice = bars.slice(-len);
  const spySlice = spyBars.slice(-len);
  const ratios = stockSlice.map((b, i) =>
    spySlice[i].close > 0 ? b.close / spySlice[i].close : 1
  );
  const currentRatio = ratios[ratios.length - 1];
  const ratio10Ago = ratios[Math.max(0, ratios.length - 11)];
  const rsRising = currentRatio > ratio10Ago;
  const rsMakingNewHigh = currentRatio >= Math.max(...ratios);
  // rsVsSpy: stock 20-bar % return minus SPY 20-bar % return
  const stockReturn = (stockSlice[stockSlice.length - 1].close - stockSlice[0].close) / stockSlice[0].close * 100;
  const spyReturn = (spySlice[spySlice.length - 1].close - spySlice[0].close) / spySlice[0].close * 100;
  return { rsVsSpy: stockReturn - spyReturn, rsRising, rsMakingNewHigh };
}

// ─── computeIndicators ───────────────────────────────────────────────────────

export function computeIndicators(
  bars: HistoricalBar[],
  high52w: number,
  spyBars: HistoricalBar[] = []
): Indicators {
  const zero: Indicators = {
    rsi14: 50, ma20: 0, ma50: 0, ema8: 0, ema20: 0,
    ema10: 0, ema50: 0, emaFanOpen: false, emaGapWidening: false,
    volumeRatio: 1, upDayVolRatio: 1, priceVs52wHigh: 0,
    isAboveMa20: false, isAboveMa50: false, isNear52wHigh: false,
    rsiInBullZone: false,
    isHigherHighs: false, isHigherLows: false, trendStructureIntact: false, recentSwingLow: null,
    rsVsSpy: null, rsRising: false, rsMakingNewHigh: false,
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

  // Sprint 1A: EMA Fan (10/20/50 alignment + gap widening)
  const ema10 = calcEMA(bars, 10);
  const ema50 = calcEMA(bars, 50);
  const emaFanOpen = ema10 > ema20 && ema20 > ema50 && ema50 > 0;
  // Gap widening: compare current (ema10-ema50) spread vs 5 bars ago
  let emaGapWidening = false;
  if (bars.length >= 6 && emaFanOpen) {
    const prevBars = bars.slice(0, -5);
    const prevEma10 = calcEMA(prevBars, 10);
    const prevEma50 = calcEMA(prevBars, 50);
    emaGapWidening = (ema10 - ema50) > (prevEma10 - prevEma50);
  }

  // Sprint 1B: Volume Price Analysis — up-day vs down-day volume (last 20 bars)
  const vpaBars = bars.slice(-20);
  const upDayVols = vpaBars.filter(b => b.close >= b.open).map(b => b.volume);
  const downDayVols = vpaBars.filter(b => b.close < b.open).map(b => b.volume);
  const avgUpVol = upDayVols.length > 0 ? upDayVols.reduce((s, v) => s + v, 0) / upDayVols.length : 0;
  const avgDownVol = downDayVols.length > 0 ? downDayVols.reduce((s, v) => s + v, 0) / downDayVols.length : 1;
  const upDayVolRatio = avgDownVol > 0 ? avgUpVol / avgDownVol : 1;

  // Sprint 1C: RSI Bull Zone — RSI held >= 40 over last 3 bars, current <= 80
  let rsiInBullZone = false;
  if (bars.length >= 4) {
    const rsi1 = calcRSI(bars.slice(0, -1));
    const rsi2 = calcRSI(bars.slice(0, -2));
    rsiInBullZone = rsi14 >= 40 && rsi14 <= 80 && rsi1 >= 40 && rsi2 >= 40;
  }

  // Sprint 2A: Price Structure (HH/HL)
  const { isHigherHighs, isHigherLows, recentSwingLow } = detectTrendStructure(bars);
  const trendStructureIntact = isHigherHighs && isHigherLows;

  // Sprint 2B: Relative Strength vs SPY
  const isSpy = bars === spyBars; // skip RS calculation for SPY itself
  const rsResult = (!isSpy && spyBars.length >= 21)
    ? calcRelativeStrength(bars, spyBars)
    : { rsVsSpy: null as number | null, rsRising: false, rsMakingNewHigh: false };

  return {
    rsi14, ma20, ma50, ema8, ema20,
    ema10, ema50, emaFanOpen, emaGapWidening,
    volumeRatio, upDayVolRatio, priceVs52wHigh,
    isAboveMa20: latest.close > ma20,
    isAboveMa50: latest.close > ma50,
    isNear52wHigh: priceVs52wHigh <= 10,
    rsiInBullZone,
    isHigherHighs, isHigherLows, trendStructureIntact, recentSwingLow,
    rsVsSpy: rsResult.rsVsSpy,
    rsRising: rsResult.rsRising,
    rsMakingNewHigh: rsResult.rsMakingNewHigh,
    atr14, macd, macdSignal, macdHist,
    bbUpper, bbLower, bbWidth, bbPct,
  };
}

// ─── Strategy: Momentum Breakout ─────────────────────────────────────────────

export function scoreMomentumBreakout(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string; entryPrice: number; stopPrice: number; conditions: Condition[] } {
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

  // Sprint 1: EMA fan open = extra confirmation of trend health
  if (ind.emaFanOpen) score += 1;
  // Sprint 1: Institutional accumulation signal
  const accumulating = ind.upDayVolRatio >= 1.2;
  if (accumulating) score += 1;
  // Sprint 2: Trend structure and RS bonus
  if (ind.trendStructureIntact) score += 1;
  if (ind.rsRising) score += 1;

  const latest = bars[bars.length - 1];
  const entryPrice = latest.high + 0.05;
  // Technical stop: below recent swing low − 0.5× ATR buffer; fallback to 1.5× ATR from entry
  const swingStop = ind.recentSwingLow !== null && ind.atr14 > 0
    ? ind.recentSwingLow - 0.5 * ind.atr14
    : null;
  const atrStop = entryPrice - 1.5 * ind.atr14;
  const stopPrice = swingStop !== null ? Math.max(swingStop, atrStop - ind.atr14) : atrStop;
  const stopLabel = swingStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (below swing low $${ind.recentSwingLow!.toFixed(2)} − 0.5× ATR)`
    : `Stop $${stopPrice.toFixed(2)} (1.5× ATR below entry — ATR $${ind.atr14.toFixed(2)})`;

  return {
    score: Math.min(score, 10),
    entryPrice,
    stopPrice,
    entryNote: `Buy stop $0.05 above $${latest.high.toFixed(2)} (today's high / resistance)`,
    stopNote: stopLabel,
    conditions: [
      { label: "RSI 50–75", met: rsiHealthy || rsiExtended },
      { label: "RSI bull zone", met: ind.rsiInBullZone },
      { label: "Above MA20", met: ind.isAboveMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "EMA fan open", met: ind.emaFanOpen },
      { label: "Higher highs", met: ind.isHigherHighs },
      { label: "Higher lows", met: ind.isHigherLows },
      { label: "Near 52w high", met: ind.isNear52wHigh },
      { label: "Volume surge", met: volumeSurge || volumeOk },
      { label: "Accumulation", met: accumulating },
      { label: "RS vs SPY ↑", met: ind.rsRising },
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
): { score: number; entryNote: string; stopNote: string; entryPrice: number; stopPrice: number; conditions: Condition[] } {
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

  // Sprint 1: EMA fan open adds extra trend confirmation for pullback entries
  if (ind.emaFanOpen) score += 1;
  // Sprint 1: RSI held bull zone = buyers stepping in early on pullback
  if (ind.rsiInBullZone) score += 1;
  // Sprint 2: HH/HL confirms trend intact before entering pullback
  if (ind.trendStructureIntact) score += 1;
  // Sprint 2: RS rising = this stock leads even during pullback
  if (ind.rsRising) score += 1;

  const entryPrice = latest.high + 0.05;
  // Technical stop: lower of (8 EMA × 0.985) or (swing low − 0.3× ATR); fallback to ema8 * 0.99
  const emaStop = ind.ema8 > 0 ? ind.ema8 * 0.985 : null;
  const swingStop = ind.recentSwingLow !== null && ind.atr14 > 0
    ? ind.recentSwingLow - 0.3 * ind.atr14
    : null;
  const stopPrice = emaStop !== null && swingStop !== null
    ? Math.min(emaStop, swingStop)
    : emaStop ?? swingStop ?? (ind.ema8 > 0 ? ind.ema8 * 0.99 : latest.low);
  const stopLabel = emaStop !== null && swingStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (lower of 8 EMA ×0.985 $${emaStop.toFixed(2)} or swing low $${ind.recentSwingLow!.toFixed(2)} − 0.3× ATR)`
    : emaStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (8 EMA ×0.985 — below 8 EMA = thesis failed)`
    : `Stop $${stopPrice.toFixed(2)} (below swing low $${ind.recentSwingLow?.toFixed(2) ?? "N/A"} − 0.3× ATR)`;

  return {
    score: Math.min(score, 10),
    entryPrice,
    stopPrice,
    entryNote: `Buy above $${entryPrice.toFixed(2)} (8 EMA pullback bounce)`,
    stopNote: stopLabel,
    conditions: [
      { label: "8 EMA > 20 EMA", met: emaAligned },
      { label: "EMA fan open", met: ind.emaFanOpen },
      { label: "Higher highs", met: ind.isHigherHighs },
      { label: "Higher lows", met: ind.isHigherLows },
      { label: "Tight to 8 EMA", met: tightToEma },
      { label: "Bounce candle", met: bounceCandle },
      { label: "RSI 40–75", met: rsiHealthy },
      { label: "RSI bull zone", met: ind.rsiInBullZone },
      { label: "RS vs SPY ↑", met: ind.rsRising },
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
): { score: number; entryNote: string; stopNote: string; entryPrice: number; stopPrice: number; conditions: Condition[] } {
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

  // Sprint 1: Low up/down vol ratio during pullback = distribution not accumulation (good for mean-rev — selling exhausted)
  const sellingExhausted = ind.upDayVolRatio < 0.8;
  if (sellingExhausted) score += 1;
  // Sprint 2: HH/HL — for mean reversion we want MA50 trend intact (isHigherLows on longer frame)
  if (ind.isHigherLows) score += 1;

  const entryPrice = latest.high + 0.05;
  // Technical stop: recent swing low − 1× ATR (wider buffer for volatile mean-reversion names)
  const stopPrice = ind.recentSwingLow !== null && ind.atr14 > 0
    ? ind.recentSwingLow - 1.0 * ind.atr14
    : (ind.atr14 > 0 ? latest.low - ind.atr14 : latest.low - 0.10);
  const stopLabel = ind.recentSwingLow !== null
    ? `Stop $${stopPrice.toFixed(2)} (swing low $${ind.recentSwingLow.toFixed(2)} − 1× ATR $${ind.atr14.toFixed(2)})`
    : `Stop $${stopPrice.toFixed(2)} (1× ATR below candle low — ATR $${ind.atr14.toFixed(2)})`;

  return {
    score: Math.min(score, 10),
    entryPrice,
    stopPrice,
    entryNote: `Buy above $${entryPrice.toFixed(2)} (above reversal candle high)`,
    stopNote: stopLabel,
    conditions: [
      { label: "RSI oversold", met: rsiOversold || rsiRecovering },
      { label: "Below MA20", met: belowMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "Higher lows", met: ind.isHigherLows },
      { label: "Weak sell vol", met: weakSellVol },
      { label: "Selling exhausted", met: sellingExhausted },
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
): { score: number; entryNote: string; stopNote: string; entryPrice: number; stopPrice: number; conditions: Condition[] } {
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

  // Sprint 1: EMA fan + gap widening = ETF rotation has real momentum behind it
  if (ind.emaFanOpen) score += 1;
  const accumulating = ind.upDayVolRatio >= 1.2;
  if (accumulating) score += 1;
  // Sprint 2: RS making new high = ETF is a true sector leader right now
  if (ind.rsMakingNewHigh) score += 1;
  if (ind.trendStructureIntact) score += 1;

  const entryPrice = latest.close + 0.10;
  // Technical stop: close below MA20 = rotation thesis failed
  const stopPrice = ind.ma20 > 0 ? ind.ma20 * 0.99 : latest.low;
  const stopLabel = ind.ma20 > 0
    ? `Stop $${stopPrice.toFixed(2)} (1% below MA20 $${ind.ma20.toFixed(2)} — close below = rotation failed)`
    : `Stop $${stopPrice.toFixed(2)} (below recent low)`;

  return {
    score: Math.min(score, 10),
    entryPrice,
    stopPrice,
    entryNote: `Buy above $${entryPrice.toFixed(2)} (confirmation above current close)`,
    stopNote: stopLabel,
    conditions: [
      { label: "Above MA20", met: ind.isAboveMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "EMA fan open", met: ind.emaFanOpen },
      { label: "Higher highs", met: ind.isHigherHighs },
      { label: "Higher lows", met: ind.isHigherLows },
      { label: "RSI 50–70", met: rsiHealthy || rsiExtended },
      { label: "RSI bull zone", met: ind.rsiInBullZone },
      { label: "Volume confirmed", met: volConfirmed },
      { label: "Accumulation", met: accumulating },
      { label: "RS new high", met: ind.rsMakingNewHigh },
      { label: "Near 52w high", met: nearHigh },
      { label: "MACD bullish", met: macdBullish },
    ],
  };
}

// ─── Sector RS ───────────────────────────────────────────────────────────────

/** Computes the stock's 20-bar return minus the sector ETF's 20-bar return.
 *  Positive = stock is outperforming its sector over the last month. */
export function getSectorRS(bars: HistoricalBar[], sectorBars: HistoricalBar[]): number | null {
  if (bars.length < 21 || sectorBars.length < 21) return null;
  const len = Math.min(bars.length, sectorBars.length, 21);
  const stockSlice = bars.slice(-len);
  const sectorSlice = sectorBars.slice(-len);
  if (sectorSlice[0].close === 0) return null;
  const stockReturn = (stockSlice[stockSlice.length - 1].close - stockSlice[0].close) / stockSlice[0].close * 100;
  const sectorReturn = (sectorSlice[sectorSlice.length - 1].close - sectorSlice[0].close) / sectorSlice[0].close * 100;
  return stockReturn - sectorReturn;
}

// ─── Validation Pass ─────────────────────────────────────────────────────────

/** Server-side validation pass — no new data fetches, uses pre-computed indicators.
 *  Checks for conflicting signals, stop validity, R:R feasibility, and data freshness. */
export function validateSignal(
  ind: Indicators,
  bars: HistoricalBar[],
  entryPrice: number,
  stopPrice: number,
  high52w: number,
  strategy: string
): ValidationResult {
  const notes: string[] = [];
  let conflictPenalty = 0;
  let dataQualityPts = 15;

  // ── Conflict detection ──────────────────────────────────────────────────────
  // For bullish strategies: RSI overbought (>75) while MACD histogram is falling = conflict
  const isBullish = strategy !== "mean_reversion";
  if (isBullish && ind.rsi14 > 75 && ind.macdHist < 0) {
    conflictPenalty = -10;
    notes.push("✗ RSI overbought while MACD histogram negative — trend may be exhausting");
  } else {
    notes.push("✓ No major indicator conflicts");
  }

  // EMA fan claimed but EMAs aren't aligned
  if (ind.emaFanOpen && !(ind.ema10 > ind.ema20 && ind.ema20 > ind.ema50)) {
    conflictPenalty = Math.min(conflictPenalty - 5, -15);
    notes.push("✗ EMA fan mismatch — fan conditions not fully confirmed");
  }

  // Mean reversion: penalize if price is still above MA50 (no real oversold thesis)
  if (strategy === "mean_reversion" && ind.isAboveMa50 && ind.rsi14 > 55) {
    conflictPenalty = Math.min(conflictPenalty - 5, -15);
    notes.push("✗ Mean reversion: price above MA50 with RSI >55 — no true oversold setup");
  }

  // ── Stop validity ───────────────────────────────────────────────────────────
  const riskPct = entryPrice > 0 ? (entryPrice - stopPrice) / entryPrice : 0;
  if (riskPct > 0.08) {
    dataQualityPts -= 5;
    notes.push(`✗ Stop ${(riskPct * 100).toFixed(1)}% below entry — wider than 8% (position size will be small)`);
  } else if (riskPct <= 0) {
    dataQualityPts -= 10;
    notes.push("✗ Stop price is at or above entry price — invalid setup");
  } else {
    notes.push(`✓ Stop is ${(riskPct * 100).toFixed(1)}% below entry — valid risk`);
  }

  // ── R:R feasibility: 3:1 target should be below the 52w high ───────────────
  const target = entryPrice + 3 * (entryPrice - stopPrice);
  if (high52w > 0 && target > high52w * 1.05) {
    dataQualityPts -= 3;
    notes.push(`✗ 3:1 target $${target.toFixed(2)} exceeds 52w high $${high52w.toFixed(2)} — hard resistance overhead`);
  } else {
    notes.push(`✓ 3:1 target $${target.toFixed(2)} is achievable within price history`);
  }

  // ── Data freshness ──────────────────────────────────────────────────────────
  if (bars.length < 50) {
    dataQualityPts -= 4;
    notes.push(`✗ Only ${bars.length} bars available — indicators less reliable with <50 bars`);
  } else {
    notes.push(`✓ ${bars.length} bars — sufficient data for all indicators`);
  }

  // Check most recent bar is not stale (> 4 calendar days old = weekend/holiday gap)
  const latestBar = bars[bars.length - 1];
  const barDate = new Date(latestBar.date);
  const now = new Date();
  const daysSinceBar = (now.getTime() - barDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceBar > 4) {
    dataQualityPts -= 3;
    notes.push(`✗ Most recent bar is ${Math.round(daysSinceBar)} days old — data may be stale`);
  }

  // ── Volume anomaly ──────────────────────────────────────────────────────────
  if (ind.volumeRatio > 10) {
    dataQualityPts -= 3;
    notes.push("✗ Volume anomaly: today's volume >10× average — possible data error or halt");
  }

  dataQualityPts = Math.max(0, dataQualityPts);
  conflictPenalty = Math.max(-15, conflictPenalty);

  return {
    passed: conflictPenalty === 0 && dataQualityPts >= 10,
    conflictPenalty,
    dataQualityPts,
    notes,
    checked_at: new Date().toISOString(),
  };
}

// ─── Conviction Scoring ───────────────────────────────────────────────────────

/** Computes a 0–100 composite conviction score from four components:
 *  1. Technical (40 pts): calibrated score
 *  2. R:R tightness (30 pts): tighter stop = more achievable 3:1 R:R
 *  3. Sector RS (15 pts): stock outperforming its sector ETF
 *  4. Data quality (15 pts): from validation pass, minus conflict penalty */
function computeConviction(
  score: number,
  entryPrice: number,
  stopPrice: number,
  sectorRs: number | null,
  validation: ValidationResult
): number {
  // Component 1: Technical score (40 pts)
  const technicalPts = Math.round((score / 10) * 40);

  // Component 2: R:R tightness (30 pts)
  const riskPct = entryPrice > 0 && stopPrice > 0 && entryPrice > stopPrice
    ? (entryPrice - stopPrice) / entryPrice
    : 0.20;
  let rrPts = 0;
  if (riskPct > 0 && riskPct <= 0.03) rrPts = 30;       // ≤3% risk: ideal tight stop
  else if (riskPct <= 0.05) rrPts = 26;                  // ≤5%: very good
  else if (riskPct <= 0.08) rrPts = 20;                  // ≤8%: good
  else if (riskPct <= 0.12) rrPts = 12;                  // ≤12%: acceptable
  else if (riskPct <= 0.20) rrPts = 5;                   // ≤20%: wide
  // >20%: 0 pts

  // Component 3: Sector RS (15 pts)
  let sectorPts = 7; // neutral if no sector data
  if (sectorRs !== null) {
    if (sectorRs > 3) sectorPts = 15;       // strongly outperforming sector
    else if (sectorRs > 1) sectorPts = 12;  // outperforming sector
    else if (sectorRs > 0) sectorPts = 9;   // slight outperformance
    else if (sectorRs > -2) sectorPts = 5;  // roughly in-line
    else sectorPts = 0;                      // underperforming sector
  }

  // Component 4: Data quality + conflict penalty
  const qualityPts = validation.dataQualityPts + validation.conflictPenalty;

  const total = technicalPts + rrPts + sectorPts + qualityPts;
  return Math.max(0, Math.min(100, total));
}

// ─── buildSignal ─────────────────────────────────────────────────────────────

export function buildSignal(
  ticker: string,
  strategy: string,
  bars: HistoricalBar[],
  high52w: number,
  spyBars: HistoricalBar[] = [],
  sectorBars: HistoricalBar[] = []
): Signal {
  const ind = computeIndicators(bars, high52w, spyBars);

  const { score, entryNote, stopNote, entryPrice, stopPrice, conditions } =
    strategy === "ema_pullback"     ? scoreEMAPullback(ind, bars)
    : strategy === "mean_reversion" ? scoreMeanReversion(ind, bars)
    : strategy === "etf_rotation"   ? scoreETFRotation(ind, bars)
    : scoreMomentumBreakout(ind, bars);

  const strength =
    score >= 8 ? "strong"
    : score >= 6 ? "moderate"
    : score >= 4 ? "weak"
    : "none";

  const sectorRs = sectorBars.length >= 21
    ? getSectorRS(bars, sectorBars)
    : null;

  const validation = validateSignal(ind, bars, entryPrice, stopPrice, high52w, strategy);
  const convictionScore = computeConviction(score, entryPrice, stopPrice, sectorRs, validation);
  const convictionBand: Signal["convictionBand"] =
    convictionScore >= 90 ? "high"
    : convictionScore >= 70 ? "medium"
    : "low";

  return {
    ticker, score, strength, strategy, indicators: ind,
    entryNote, stopNote, entryPrice, stopPrice, conditions,
    convictionScore, convictionBand, sectorRs, validation,
  };
}
