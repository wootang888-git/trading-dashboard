import { HistoricalBar } from "./yahoo";

export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  ema8: number;
  ema20: number;
  // Sprint 1: EMA Fan
  ema50: number;
  emaFanOpen: boolean;     // ema8 > ema20 > ema50 (multi-timeframe alignment)
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
  rs6MonthQuartile: boolean; // RS vs SPY in top 25% of 6-month range
  atr14: number;
  // Breakout Tightening
  obv20High: boolean;      // On-Balance Volume making 20-day high
  high50d: number;         // 50-day consolidation high
  bbSqueeze: boolean;      // BB Width < 20-day average width
  macdAccelerating: boolean; // MACD Hist higher than previous bar
  macdAccel2d: boolean;     // MACD Hist higher for 2 consecutive bars (stronger confirmation)
  rsiCross62: boolean;      // RSI crossed above 62 from below this bar (fresh power-zone entry)
  macd: number;
  macdSignal: number;
  macdHist: number;
  bbUpper: number;
  bbLower: number;
  bbWidth: number;
  bbPct: number;
  // Phase 2: Per-stock RSI percentile (0–1) over trailing 126-bar window.
  // -1 = insufficient history; fall back to universal threshold in gate logic.
  rsiPercentile: number;
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

export type SignalTier =
  | "HIGH_CONVICTION"
  | "TACTICAL_BUY"
  | "WATCH_EXTENDED"
  | "OBSERVE"
  | "EXIT"
  | "BREAKOUT_WATCH";

export interface HardGates {
  rsiOverheated: boolean;       // RSI > 78 AND MACD decelerating (or RSI > 84 absolute ceiling)
  bbExtended: boolean;          // bbPct > 0.90
  rrBelowMinimum: boolean;      // achievable R:R < 2.0 (structural target too close)
  sectorWeak: boolean;          // sectorEtf.close < sectorEtf.ma20
  volPriceUnconfirmed: boolean; // !(volume > 1.5×avg AND range > 1.2×avgRange of last 5 bars)
  deathCross: boolean;          // MA20 < MA50 — bearish medium-term trend
  belowMA50: boolean;           // price below MA50 — no institutional floor
}

export type MarketRegime = "bull" | "bear" | "choppy";

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
  tier: SignalTier;
  hardGates: HardGates;
  volPriceConfirmed: boolean;
  sectorEtfAboveMA20: boolean;
  rsiAtEntry: number;
  bbPct: number;
  rsVsSpyNegativeStreak: number;
  // Dynamic structural trade setup (replaces hardcoded 3:1)
  structuralTarget: number;      // nearest overhead resistance ceiling (52w high, or trail stop in ATH mode)
  rrAchievable: number;          // (structuralTarget − entryPrice) / risk; 3.0 in trail mode
  trailMode: boolean;            // true when price ≥ 52w high — show trailing stop instead of fixed target
  regime: MarketRegime;          // ADX-based market regime
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

/** Rolling RSI series using Wilder's O(n) smoothing.
 *  Returns one RSI value per bar starting at index `period` (length = bars.length - period).
 *  Requires bars.length >= period + 1. */
function calcRSIHistory(bars: HistoricalBar[], period = 14): number[] {
  if (bars.length < period + 1) return [];
  const result: number[] = [];
  let avgGain = 0, avgLoss = 0;
  // Seed: simple average over the first window
  for (let i = 1; i <= period; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) avgGain += diff; else avgLoss -= diff;
  }
  avgGain /= period;
  avgLoss /= period;
  result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  // Wilder's smoothing for the remaining bars
  for (let i = period + 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    avgGain = (avgGain * (period - 1) + (diff > 0 ? diff : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (diff < 0 ? -diff : 0)) / period;
    result.push(avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  }
  return result;
}

/** Returns the fraction of values in `history` that are <= `value` (0–1).
 *  Excludes the current bar's value from the distribution to avoid look-ahead bias. */
function computeRsiPercentile(history: number[], value: number): number {
  if (history.length === 0) return -1;
  return history.filter(v => v <= value).length / history.length;
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

/** ADX (Average Directional Index) — 14-period Wilder smoothing.
 *  Returns regime: "bull" (ADX>25, +DI>-DI), "bear" (ADX>25, -DI>+DI), "choppy" (ADX≤25). */
function computeADX(bars: HistoricalBar[], period = 14): {
  adx: number; plusDI: number; minusDI: number; regime: MarketRegime;
} {
  if (bars.length < period * 2 + 1) return { adx: 0, plusDI: 0, minusDI: 0, regime: "choppy" };
  const plusDMs: number[] = [];
  const minusDMs: number[] = [];
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    trs.push(Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    ));
  }
  // Wilder smoothing
  const wilder = (arr: number[]): number[] => {
    if (arr.length < period) return [0];
    const out: number[] = [];
    let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
    out.push(s);
    for (let i = period; i < arr.length; i++) { s = s - s / period + arr[i]; out.push(s); }
    return out;
  };
  const sTR = wilder(trs);
  const sPDM = wilder(plusDMs);
  const sMDM = wilder(minusDMs);
  const pDI = sPDM.map((v, i) => sTR[i] > 0 ? 100 * v / sTR[i] : 0);
  const mDI = sMDM.map((v, i) => sTR[i] > 0 ? 100 * v / sTR[i] : 0);
  const dx = pDI.map((p, i) => { const m = mDI[i]; const s = p + m; return s > 0 ? 100 * Math.abs(p - m) / s : 0; });
  const adxSmooth = wilder(dx);
  const adx = adxSmooth[adxSmooth.length - 1] ?? 0;
  const plusDI = pDI[pDI.length - 1] ?? 0;
  const minusDI = mDI[mDI.length - 1] ?? 0;
  const regime: MarketRegime = adx > 25 && plusDI > minusDI ? "bull"
    : adx > 25 && minusDI > plusDI ? "bear"
    : "choppy";
  return { adx, plusDI, minusDI, regime };
}

/** Computes structural target (nearest resistance ceiling) and achievable R:R.
 *  Switches to trail mode when price is at/above 52w high.
 *  In bull regime, near-52w-high stocks use ATR projection instead of the 52w ceiling,
 *  keeping R:R honest for breakout candidates rather than capping upside at the historical high. */
function computeStructuralTarget(
  entryPrice: number,
  stopPrice: number,
  high52w: number,
  latestClose: number,
  atr14: number,
  ema8: number,
  regime: MarketRegime = "choppy"
): { target: number; rrRatio: number; mode: "fixed" | "trail" } {
  const risk = entryPrice - stopPrice;
  if (risk <= 0 || entryPrice <= 0) return { target: entryPrice, rrRatio: 0, mode: "fixed" };
  // ATH breakout: price within 0.5% of or above 52w high → trail mode
  if (high52w > 0 && latestClose >= high52w * 0.995) {
    const rawTrailStop = Math.max(
      latestClose - 1.5 * atr14,
      ema8 > 0 ? ema8 : latestClose * 0.97
    );
    // Clamp: trail stop must sit below latestClose so the trail-breach EXIT override
    // (`latestClose < structuralTarget`) can never fire on the day trail mode activates.
    const trailStop = Math.min(rawTrailStop, latestClose * 0.999);
    return { target: trailStop, rrRatio: 3.0, mode: "trail" };
  }
  // Bull regime + within 6% of 52w high → project forward with ATR extension.
  // 52w high acts as a ceiling in fixed mode; for confirmed breakout candidates the
  // true forward target is beyond it. 2.5×ATR projects a realistic post-breakout move.
  if (regime === "bull" && high52w > 0 && latestClose >= high52w * 0.94 && atr14 > 0) {
    const projectedTarget = latestClose + 2.5 * atr14;
    const achievableRR = (projectedTarget - entryPrice) / risk;
    return { target: projectedTarget, rrRatio: achievableRR, mode: "fixed" };
  }
  // Structural target = 52w high (primary resistance ceiling)
  if (high52w > 0) {
    const achievableRR = (high52w - entryPrice) / risk;
    return { target: high52w, rrRatio: achievableRR, mode: "fixed" };
  }
  // Fallback when no 52w high data
  return { target: entryPrice + 3 * risk, rrRatio: 3.0, mode: "fixed" };
}

/** OBV (On-Balance Volume) helper */
function calcOBV(bars: HistoricalBar[]): number[] {
  const obv = [0];
  for (let i = 1; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    const val = diff > 0 ? bars[i].volume : diff < 0 ? -bars[i].volume : 0;
    obv.push(obv[i - 1] + val);
  }
  return obv;
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
/** Bollinger Bands — 20-period SMA ± 2 std dev (AC-009) */
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
  // AC-003: Check ticker identity via string comparison, not reference
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
  spyBars: HistoricalBar[] = [],
  ticker = ""
): Indicators {
  const zero: Indicators = {
    rsi14: 50, ma20: 0, ma50: 0, ema8: 0, ema20: 0,
    ema50: 0, emaFanOpen: false, emaGapWidening: false,
    volumeRatio: 1, upDayVolRatio: 1, priceVs52wHigh: 0,
    isAboveMa20: false, isAboveMa50: false, isNear52wHigh: false,
    rsiInBullZone: false,
    isHigherHighs: false, isHigherLows: false, trendStructureIntact: false, recentSwingLow: null,
    rsVsSpy: null, rsRising: false, rsMakingNewHigh: false,
    rs6MonthQuartile: false,
    atr14: 0, macd: 0, macdSignal: 0, macdHist: 0,
    obv20High: false, high50d: 0, bbSqueeze: false, macdAccelerating: false,
    macdAccel2d: false, rsiCross62: false,
    bbUpper: 0, bbLower: 0, bbWidth: 0, bbPct: 0.5,
    rsiPercentile: -1,
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

  // Convergence Logic: OBV 20-day High (Accumulation Check)
  const obvSeries = calcOBV(bars);
  const currentObv = obvSeries[obvSeries.length - 1];
  const recentObv = obvSeries.slice(-20);
  const obv20High = currentObv >= Math.max(...recentObv);

  // Convergence Logic: 50-day Consolidation Range
  const high50d = Math.max(...bars.slice(-50).map(b => b.high));

  // Convergence Logic: BB Squeeze (Volatility Contraction Pattern)
  const bbWidths = bars.slice(-20).map((_, i) => calcBollingerBands(bars.slice(0, bars.length - i)).width);
  const avgBbWidth = bbWidths.reduce((a, b) => a + b, 0) / bbWidths.length;
  const bbSqueeze = bbWidth < avgBbWidth;

  // Precision: MACD Acceleration (Impulse detection)
  // Require >= 27 bars so prevMacd is computed from a full-length MACD series (26 bars min),
  // not a zero-seeded stub that forces macdAccelerating = true and silently disables the RSI gate.
  const prevMacd = bars.length >= 27 ? calcMACD(bars.slice(0, -1)) : { hist: 0 };
  const macdAccelerating = bars.length >= 27 && macdHist > prevMacd.hist;
  const prevPrevMacd = bars.length >= 28 ? calcMACD(bars.slice(0, -2)) : { hist: 0 };
  const macdAccel2d = bars.length >= 28 && macdHist > prevMacd.hist && prevMacd.hist > prevPrevMacd.hist;

  // Precision: RSI cross above 62 from below (fresh power-zone entry)
  const prevRsi = bars.length >= 2 ? calcRSI(bars.slice(0, -1)) : rsi14;
  const rsiCross62 = rsi14 >= 62 && prevRsi < 62;

  // Sprint 1A: EMA Fan (8/20/50 alignment + gap widening)
  const ema50 = calcEMA(bars, 50);
  const emaFanOpen = ema8 > ema20 && ema20 > ema50 && ema50 > 0;
  // Gap widening: compare current (ema8-ema50) spread vs 5 bars ago
  let emaGapWidening = false;
  if (bars.length >= 6 && emaFanOpen) {
    const prevBars = bars.slice(0, -5);
    const prevEma8 = calcEMA(prevBars, 8);
    const prevEma50 = calcEMA(prevBars, 50);
    emaGapWidening = (ema8 - ema50) > (prevEma8 - prevEma50);
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
  const isSpy = ticker === "SPY"; // skip RS calculation for SPY itself
  const rsResult = (!isSpy && spyBars.length >= 21)
    ? calcRelativeStrength(bars, spyBars)
    : { rsVsSpy: null as number | null, rsRising: false, rsMakingNewHigh: false };

  // RS top-quartile: is current RS ratio in top 25% of its available range?
  // (90-bar approximation — true 6-month would need ~126 bars)
  let rs6MonthQuartile = false;
  if (!isSpy && spyBars.length >= 21 && bars.length >= 20) {
    const minLen = Math.min(bars.length, spyBars.length);
    const rsRatios = bars.slice(-minLen).map((b, i) => {
      const spy = spyBars[spyBars.length - minLen + i];
      return spy && spy.close > 0 ? b.close / spy.close : 0;
    }).filter(r => r > 0);
    if (rsRatios.length >= 10) {
      const sorted = [...rsRatios].sort((a, b) => a - b);
      const p75 = sorted[Math.floor(sorted.length * 0.75)];
      rs6MonthQuartile = (rsRatios[rsRatios.length - 1] ?? 0) >= p75;
    }
  }

  // Phase 2: Per-stock RSI percentile — self-calibrating overheated threshold.
  // Use a 126-bar (≈6-month) window. Needs 126+14 bars; returns -1 otherwise.
  // history slice excludes the current bar to avoid look-ahead bias.
  const RSI_HISTORY_WINDOW = 126;
  let rsiPercentile = -1;
  if (bars.length >= RSI_HISTORY_WINDOW + 14) {
    const windowBars = bars.slice(-(RSI_HISTORY_WINDOW + 14));
    const rsiHistory = calcRSIHistory(windowBars);
    // rsiHistory.slice(0, -1) = all past RSI values, excluding today's
    rsiPercentile = computeRsiPercentile(rsiHistory.slice(0, -1), rsi14);
  }

  return {
    rsi14, ma20, ma50, ema8, ema20,
    ema50, emaFanOpen, emaGapWidening,
    volumeRatio, upDayVolRatio, priceVs52wHigh,
    isAboveMa20: latest.close > ma20,
    isAboveMa50: latest.close > ma50,
    isNear52wHigh: priceVs52wHigh <= 10,
    rsiInBullZone,
    isHigherHighs, isHigherLows, trendStructureIntact, recentSwingLow,
    rsVsSpy: rsResult.rsVsSpy,
    rsRising: rsResult.rsRising,
    rsMakingNewHigh: rsResult.rsMakingNewHigh,
    rs6MonthQuartile,
    obv20High, high50d, bbSqueeze, macdAccelerating, macdAccel2d, rsiCross62,
    atr14, macd, macdSignal, macdHist,
    bbUpper, bbLower, bbWidth, bbPct,
    rsiPercentile,
  };
}

// ─── Strategy: Momentum Breakout ─────────────────────────────────────────────

export function scoreMomentumBreakout(
  ind: Indicators,
  bars: HistoricalBar[],
  pmVolRatioLive: number | null = null
): { score: number; entryNote: string; stopNote: string; entryPrice: number; stopPrice: number; conditions: Condition[] } {
  let score = 0;

  const latest = bars[bars.length - 1];

  // 1. Structure: Breakout confirmation (Close > 50-day high)
  const breakoutConfirmed = latest.close >= ind.high50d;
  if (breakoutConfirmed) score += 3;
  if (ind.isAboveMa20) score += 2;
  if (ind.isAboveMa50) score += 1;
  if (ind.isNear52wHigh) score += 2;

  // 2. Volume confirmation — 5-tier monotonic curve (L2: eliminates non-monotonic cliff at 1.5×)
  // ≥2.0× institutional surge (+3), ≥1.5× strong (+2), ≥1.2× moderate (+1),
  // 1.0–1.2× neutral (0), <1.0× thin breakout penalty (−2)
  const volumeSurge = ind.volumeRatio >= 1.5;
  if      (ind.volumeRatio >= 2.0) score += 3;
  else if (ind.volumeRatio >= 1.5) score += 2;
  else if (ind.volumeRatio >= 1.2) score += 1;
  else if (ind.volumeRatio <  1.0) score -= 2;
  if (ind.obv20High) score += 3; // Accumulation — OBV at 20d high predicts silent institutional buildup

  // 3. Volatility Contraction (VCP) — meaningful precondition, not just a bonus
  if (ind.bbSqueeze) score += 2;

  // 4. Precision Timing: RSI cross into power zone (fresh entry > broad range)
  const rsiCross62 = ind.rsiCross62;
  const rsiPowerZone = ind.rsi14 >= 62;
  if (rsiCross62) score += 3;        // Fresh cross — highest conviction timing
  else if (rsiPowerZone) score += 1; // Already in zone — partial credit

  // MACD 2-day acceleration (2-bar confirmation > 1-bar)
  const macdBullish = ind.macdHist > 0;
  if (macdBullish) score += 1;
  if (ind.macdAccel2d) score += 2;
  else if (ind.macdAccelerating) score += 1;

  // 5. Contextual Alignment
  if (ind.emaFanOpen) score += 1;
  const accumulating = ind.upDayVolRatio >= 1.2;
  if (accumulating) score += 1;
  if (ind.trendStructureIntact) score += 1;

  let recentUptrend = false;
  if (bars.length >= 5) {
    const recent = bars.slice(-5);
    recentUptrend = recent[recent.length - 1].close > recent[0].close;
    if (recentUptrend) score += 1;
  }

  // 6. Relative Strength — top quartile > merely rising
  if (ind.rs6MonthQuartile) score += 2;
  else if (ind.rsRising) score += 1;

  // 7. Pre-market volume confirmation (VOL-PM Sprint 2)
  // pm_vol_ratio_live > 2× = institutional overnight interest before the open
  const pmVolConfirmed = pmVolRatioLive !== null && pmVolRatioLive > 2.0;
  if (pmVolConfirmed) score += 1;

  // AC-010: ATR Guard
  if (ind.atr14 < 0.05) return { score: 0, entryPrice: 0, stopPrice: 0, entryNote: "ATR too low", stopNote: "ATR too low", conditions: [] };

  // Convergence Entry: ATR-scaled buffer above 50d Resistance High (volatility-normalized)
  const entryPrice = ind.high50d + Math.max(ind.atr14 * 0.10, 0.01);

  // Technical stop: below recent swing low − 0.5× ATR buffer; fallback to 1.5× ATR from entry
  const swingStop = ind.recentSwingLow !== null && ind.atr14 > 0
    ? ind.recentSwingLow - 0.5 * ind.atr14
    : null;
  const minBuffer = 0.10; // AC-011
  const atrStop = Math.min(entryPrice - 1.5 * ind.atr14, entryPrice - minBuffer);
  const stopPrice = swingStop !== null ? Math.max(swingStop, atrStop - ind.atr14) : atrStop;
  const stopLabel = swingStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (below swing low $${ind.recentSwingLow!.toFixed(2)} − 0.5× ATR)`
    : `Stop $${stopPrice.toFixed(2)} (1.5× ATR below entry)`; // AC-001: Remove numeric ATR value

  return {
    score: Math.min(score, 15),
    entryPrice,
    stopPrice,
    entryNote: `Buy stop above $${ind.high50d.toFixed(2)} (50-day structural resistance + ATR buffer)`,
    stopNote: stopLabel,
    conditions: [
      { label: "50d Breakout", met: breakoutConfirmed },
      { label: "RSI cross 62", met: rsiCross62 },
      { label: "RSI Power Zone (62+)", met: rsiPowerZone },
      { label: "RSI bull zone", met: ind.rsiInBullZone },
      { label: "BB Squeeze (VCP)", met: ind.bbSqueeze },
      { label: "OBV 20d High", met: ind.obv20High },
      { label: "Volume (≥1.5×)", met: volumeSurge },
      { label: "Above MA20", met: ind.isAboveMa20 },
      { label: "Above MA50", met: ind.isAboveMa50 },
      { label: "EMA fan open", met: ind.emaFanOpen },
      { label: "Higher highs", met: ind.isHigherHighs },
      { label: "Higher lows", met: ind.isHigherLows },
      { label: "Near 52w high", met: ind.isNear52wHigh },
      { label: "Accumulation", met: accumulating },
      { label: "RS top quartile", met: ind.rs6MonthQuartile },
      { label: "RS vs SPY ↑", met: ind.rsRising },
      { label: "Recent uptrend", met: recentUptrend },
      { label: "MACD bullish", met: macdBullish },
      { label: "MACD accel 2d", met: ind.macdAccel2d },
      { label: "Pre-mkt vol (>2×)", met: pmVolConfirmed },
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

  // AC-004: Downside Gate (suppress in bearish regime)
  if (!ind.isAboveMa50) score -= 2;

  const entryPrice = latest.high + Math.max(ind.atr14 * 0.10, 0.01);
  const minBuffer = 0.10; // AC-011
  const emaStop = ind.ema8 > 0 ? ind.ema8 * 0.985 : null;
  const swingStop = ind.recentSwingLow !== null && ind.atr14 > 0
    ? ind.recentSwingLow - 0.3 * ind.atr14
    : null;
  const stopPrice = Math.min(
    emaStop !== null && swingStop !== null ? Math.min(emaStop, swingStop) : emaStop ?? swingStop ?? (ind.ema8 > 0 ? ind.ema8 * 0.99 : latest.low),
    entryPrice - minBuffer
  );
  const stopLabel = emaStop !== null && swingStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (lower of 8 EMA ×0.985 $${emaStop.toFixed(2)} or swing low $${ind.recentSwingLow!.toFixed(2)} − 0.3× ATR)`
    : emaStop !== null
    ? `Stop $${stopPrice.toFixed(2)} (8 EMA ×0.985 — below 8 EMA = thesis failed)`
    : `Stop $${stopPrice.toFixed(2)} (below swing low $${ind.recentSwingLow?.toFixed(2) ?? "N/A"} − 0.3× ATR)`;

  return {
    score: Math.min(score, 15),
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

  // AC-006: Death Cross Gate (prevent entry into severe downtrends)
  if (ind.ma20 < ind.ma50) score -= 3;

  const entryPrice = latest.high + Math.max(ind.atr14 * 0.10, 0.01);
  const minBuffer = 0.10; // AC-011
  // Technical stop: recent swing low − 1× ATR (wider buffer for volatile mean-reversion names)
  const stopPrice = Math.min(
    ind.recentSwingLow !== null && ind.atr14 > 0 ? ind.recentSwingLow - 1.0 * ind.atr14 : (ind.atr14 > 0 ? latest.low - ind.atr14 : latest.low - 0.10),
    entryPrice - minBuffer
  );
  const stopLabel = ind.recentSwingLow !== null
    ? `Stop $${stopPrice.toFixed(2)} (swing low $${ind.recentSwingLow.toFixed(2)} − 1.0× ATR)`
    : `Stop $${stopPrice.toFixed(2)} (1.0× ATR below candle low)`; // AC-001: Descriptive labels only

  return {
    score: Math.min(score, 15),
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

  const entryPrice = latest.close + Math.max(ind.atr14 * 0.10, 0.01);
  // Technical stop: close below MA20 = rotation thesis failed
  const stopPrice = ind.ma20 > 0 ? ind.ma20 * 0.99 : latest.low;
  const stopLabel = ind.ma20 > 0
    ? `Stop $${stopPrice.toFixed(2)} (1% below MA20 $${ind.ma20.toFixed(2)} — close below = rotation failed)`
    : `Stop $${stopPrice.toFixed(2)} (below recent low)`;

  return {
    score: Math.min(score, 15),
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
  if (ind.emaFanOpen && !(ind.ema8 > ind.ema20 && ind.ema20 > ind.ema50)) {
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

  // ── R:R feasibility: structural target (52w high) vs minimum 2.0:1 ───────────
  const risk = entryPrice - stopPrice;
  if (high52w > 0 && risk > 0) {
    const structTarget = high52w;
    const rrAchievable = (structTarget - entryPrice) / risk;
    if (rrAchievable >= 2.0) {
      notes.push(`✓ Structural target $${structTarget.toFixed(2)} achievable (${rrAchievable.toFixed(1)}:1 R:R)`);
    } else {
      notes.push(`✗ Structural target $${structTarget.toFixed(2)} only ${rrAchievable.toFixed(1)}:1 — below 2.0:1 minimum`);
    }
  } else {
    notes.push("✓ Structural target check skipped — no 52w high data");
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
  // Component 1: Technical score (40 pts) — normalized against 15-pt scorer cap (L1)
  const technicalPts = Math.round((score / 15) * 40);

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

// ─── Hard Gates ──────────────────────────────────────────────────────────────

/** Computes vol-price confirmation: volume surge AND price range expansion vs last 5 bars. */
export function computeVolPriceConfirmed(bars: HistoricalBar[], volumeRatio: number): boolean {
  if (bars.length < 6) return false;
  const latestBar = bars[bars.length - 1];
  const currentRange = latestBar.high - latestBar.low;
  const last5 = bars.slice(-6, -1); // 5 bars BEFORE latest
  const avgRange = last5.reduce((s, b) => s + (b.high - b.low), 0) / last5.length;
  return volumeRatio >= 1.5 && avgRange > 0 && currentRange >= avgRange * 1.2;
}

export function evaluateHardGates(
  ind: Indicators,
  entryPrice: number,
  stopPrice: number,
  high52w: number,
  sectorEtfAboveMA20: boolean,
  volPriceConfirmed: boolean,
  latestClose: number = 0,
  rrAchievable: number = 3.0
): HardGates {
  // Per-stock RSI percentile gate (Phase 2).
  // rsiPercentile >= 0 means we have 6-month history — use it as a self-calibrating threshold.
  // rsiPercentile === -1 means insufficient history — fall back to the universal 78 ceiling.
  // In both cases the MACD-deceleration condition and 84 absolute ceiling still apply.
  const rsiStretched = ind.rsiPercentile >= 0
    ? ind.rsiPercentile > 0.92
    : ind.rsi14 > 78;
  return {
    rsiOverheated: (rsiStretched && !ind.macdAccelerating) || ind.rsi14 > 84,
    bbExtended: ind.bbPct > 0.90,
    rrBelowMinimum: rrAchievable < 2.0,
    sectorWeak: !sectorEtfAboveMA20,
    volPriceUnconfirmed: !volPriceConfirmed,
    deathCross: ind.ma20 > 0 && ind.ma50 > 0 && ind.ma20 < ind.ma50,
    belowMA50: ind.ma50 > 0 && latestClose > 0 && latestClose < ind.ma50,
  };
}

/** Compute how many of the last 3 bars the stock underperformed SPY on 20-bar return basis. */
function computeRsVsSpyNegativeStreak(bars: HistoricalBar[], spyBars: HistoricalBar[]): number {
  if (bars.length < 23 || spyBars.length < 23) return 0;
  const len = Math.min(bars.length, spyBars.length);
  let streak = 0;
  for (let offset = 0; offset < 3; offset++) {
    const endIdx = len - offset;
    const startIdx = endIdx - 20;
    if (startIdx < 0) break;
    const stockSlice = bars.slice(startIdx, endIdx);
    const spySlice = spyBars.slice(spyBars.length - (len - startIdx), spyBars.length - offset);
    if (stockSlice.length < 20 || spySlice.length < 20 || stockSlice[0].close === 0 || spySlice[0].close === 0) break;
    const stockReturn = (stockSlice[stockSlice.length - 1].close - stockSlice[0].close) / stockSlice[0].close;
    const spyReturn = (spySlice[spySlice.length - 1].close - spySlice[0].close) / spySlice[0].close;
    if (stockReturn < spyReturn) streak++;
    else break;
  }
  return streak;
}

function assignTier(
  convictionScore: number,
  hardGates: HardGates,
  latestClose: number,
  ema8: number,
  rsVsSpyNegativeStreak: number,
  regime: MarketRegime = "choppy",
  rrAchievable: number = 3.0,
  isNear52wHigh: boolean = false
): SignalTier {
  // 1. EXIT
  if (latestClose < ema8 && rsVsSpyNegativeStreak >= 3) return "EXIT";
  // 2. R:R below minimum — BREAKOUT_WATCH in bull regime when technicals are sound;
  //    otherwise OBSERVE.
  if (hardGates.rrBelowMinimum) {
    if (
      regime === "bull" &&
      isNear52wHigh &&
      convictionScore >= 70 &&
      !hardGates.deathCross &&
      !hardGates.rsiOverheated &&
      !hardGates.bbExtended
    ) return "BREAKOUT_WATCH";
    return "OBSERVE";
  }
  // 3. WATCH_EXTENDED — overheated only (RSI/BB extended = momentum stretched)
  if (hardGates.rsiOverheated || hardGates.bbExtended) return "WATCH_EXTENDED";
  // 3b. deathCross → OBSERVE (structural downtrend ≠ overheated; avoids dual-section bug)
  if (hardGates.deathCross) return "OBSERVE";
  const anyHardGateFailed =
    hardGates.rsiOverheated ||
    hardGates.bbExtended ||
    hardGates.rrBelowMinimum ||
    hardGates.sectorWeak ||
    hardGates.volPriceUnconfirmed ||
    hardGates.deathCross ||
    hardGates.belowMA50;
  // Regime-modulated HIGH_CONVICTION threshold
  const highConvThreshold = regime === "bear" ? 90 : regime === "choppy" ? 75 : 82;
  // Bear regime also requires stronger R:R
  const bearRRFailed = regime === "bear" && rrAchievable < 3.0;
  // 4. HIGH_CONVICTION
  if (convictionScore > highConvThreshold && !anyHardGateFailed && !bearRRFailed) return "HIGH_CONVICTION";
  // 5. TACTICAL_BUY — conviction in healthy zone or gates block HIGH_CONVICTION
  const tacticalMin = regime === "bear" ? 82 : 70;
  if (convictionScore >= tacticalMin && convictionScore <= highConvThreshold) return "TACTICAL_BUY";
  if (convictionScore > highConvThreshold && (anyHardGateFailed || bearRRFailed)) return "TACTICAL_BUY";
  // 6. OBSERVE
  return "OBSERVE";
}

// ─── NBA Directive ───────────────────────────────────────────────────────────

export type NbaDirective =
  | "SCALE_IN"
  | "WATCH"
  | "OBSERVE_WARN"
  | "HOLD_TRAIL"
  | "HARVEST"
  | "EXIT"
  | "NOISE";

/** Computes the Next Best Action directive from ML score, conviction, streaks, tier, and price context.
 *  Called in the API route where mlScorePct and livePrice are available. */
export function computeNbaDirective({
  mlScorePct,
  mlPercentileRank,
  convictionScore,
  streakDays,
  mlDelta24h,
  tier,
  entryPrice,
  stopPrice,
  livePrice,
  ema8,
  structuralTarget,
  trailMode,
}: {
  mlScorePct: number | null;
  mlPercentileRank: number | null;
  convictionScore: number;
  streakDays: number;
  mlDelta24h: number | null;
  tier: SignalTier;
  entryPrice: number;
  stopPrice: number;
  livePrice: number;
  ema8: number;
  structuralTarget?: number;
  trailMode?: boolean;
}): { directive: NbaDirective; reason: string } {
  // EXIT always takes priority
  if (tier === "EXIT") {
    return { directive: "EXIT", reason: "Thesis failed — price below 8-EMA with sustained SPY underperformance" };
  }
  // BREAKOUT_WATCH: confirmed trend, R:R blocked by 52w high proximity.
  // Always WATCH — never promote to SCALE_IN (no valid entry yet, awaiting 52w high break).
  if (tier === "BREAKOUT_WATCH") {
    return { directive: "WATCH", reason: "Blue sky setup — wait for confirmed close above 52-week high on elevated volume" };
  }

  const ml = mlScorePct ?? 0;
  const isHighMl = mlPercentileRank !== null ? mlPercentileRank >= 90 : ml >= 75;
  const isLowMl = ml < 50;
  const isHighConv = convictionScore > 85;
  const isLowConv = convictionScore < 70;

  let directive: NbaDirective;
  let reason: string;

  if (isHighMl && isHighConv) {
    directive = "SCALE_IN";
    reason = `ML ${ml}% + conviction ${convictionScore} — top-decile setup`;
  } else if (isHighMl && !isHighConv && !isLowConv) {
    directive = "WATCH";
    reason = `ML sees accumulation (${ml}%) — technical setup building`;
  } else if (isHighMl && isLowConv) {
    directive = "WATCH";
    reason = `ML sees accumulation (${ml}%) but technicals not yet confirmed`;
  } else if (isLowMl && isHighConv) {
    directive = "OBSERVE_WARN";
    reason = `Strong technicals (${convictionScore}) but ML sees low follow-through (${ml}%) — possible bull trap`;
  } else if (isLowMl && isLowConv) {
    directive = "NOISE";
    reason = "Neither ML nor technicals support entry";
  } else {
    directive = "WATCH";
    reason = `Mixed signals — ML ${ml}%, conviction ${convictionScore}`;
  }

  // HARVEST: conviction high, price within 5% below structural target OR already above it (up to 10% past),
  // AND ML fading — take profit before momentum exhausts.
  // Skip in trail mode: structuralTarget is the trail stop (below livePrice), not a price ceiling.
  if (!trailMode && convictionScore > 85 && entryPrice > 0 && stopPrice > 0 && livePrice > 0) {
    const target = structuralTarget ?? (entryPrice + 3 * (entryPrice - stopPrice));
    const distToTarget = target > 0 ? (target - livePrice) / target : 1;
    // distToTarget: positive = below target, negative = above target
    // window: -0.10 to +0.05 (up to 10% past target, or within 5% of it)
    if (distToTarget >= -0.10 && distToTarget <= 0.05 && mlDelta24h !== null && mlDelta24h < -5) {
      return {
        directive: "HARVEST",
        reason: `Price near or above target ($${target.toFixed(2)}) and ML fading (Δ${mlDelta24h.toFixed(0)}) — take profit`,
      };
    }
  }

  // HOLD / TRAIL: tactical setup, price above 8-EMA (in-position management)
  if (tier === "TACTICAL_BUY" && ema8 > 0 && livePrice > ema8) {
    return { directive: "HOLD_TRAIL", reason: "Price above 8-EMA — trail stop up, no new buying" };
  }

  // 3-day streak promotion: WATCH → SCALE_IN
  if (directive === "WATCH" && streakDays >= 3) {
    return {
      directive: "SCALE_IN",
      reason: `Conviction sustained ${streakDays} consecutive days — elevated follow-through probability`,
    };
  }

  return { directive, reason };
}

// ─── buildSignal ─────────────────────────────────────────────────────────────

export function buildSignal(
  ticker: string,
  strategy: string,
  bars: HistoricalBar[],
  high52w: number,
  spyBars: HistoricalBar[] = [],
  sectorBars: HistoricalBar[] = [],
  sectorEtfAboveMA20: boolean = true,
  pmVolRatioLive: number | null = null
): Signal {
  const ind = computeIndicators(bars, high52w, spyBars, ticker);

  const { score, entryNote, stopNote, entryPrice, stopPrice, conditions } =
    strategy === "ema_pullback"     ? scoreEMAPullback(ind, bars)
    : strategy === "mean_reversion" ? scoreMeanReversion(ind, bars)
    : strategy === "etf_rotation"   ? scoreETFRotation(ind, bars)
    : scoreMomentumBreakout(ind, bars, pmVolRatioLive);

  const strength =
    score >= 12 ? "strong"
    : score >= 9 ? "moderate"
    : score >= 6 ? "weak"
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

  const volPriceConfirmed = computeVolPriceConfirmed(bars, ind.volumeRatio);
  const latestClose = bars.length > 0 ? bars[bars.length - 1].close : 0;
  // ADX-based regime must be computed first — used by computeStructuralTarget for ATR projection
  const { regime } = computeADX(bars);
  // Structural target + achievable R:R (replaces hardcoded 3:1)
  const { target: structuralTarget, rrRatio: rrAchievable, mode: targetMode } =
    computeStructuralTarget(entryPrice, stopPrice, high52w, latestClose, ind.atr14, ind.ema8, regime);
  const trailMode = targetMode === "trail";
  const hardGates = evaluateHardGates(
    ind, entryPrice, stopPrice, high52w, sectorEtfAboveMA20, volPriceConfirmed, latestClose, rrAchievable
  );
  const rsVsSpyNegativeStreak = spyBars.length >= 23 && bars.length >= 23
    ? computeRsVsSpyNegativeStreak(bars, spyBars)
    : 0;
  const rawTier = assignTier(
    convictionScore, hardGates, latestClose, ind.ema8,
    rsVsSpyNegativeStreak, regime, rrAchievable, ind.isNear52wHigh
  );
  // Trail stop breach → EXIT immediately (bypasses the slow SPY-streak EXIT gate)
  const tier: SignalTier = (trailMode && latestClose < structuralTarget) ? "EXIT" : rawTier;

  return {
    ticker, score, strength, strategy, indicators: ind,
    entryNote, stopNote, entryPrice, stopPrice, conditions,
    convictionScore, convictionBand, sectorRs, validation,
    tier,
    hardGates,
    volPriceConfirmed,
    sectorEtfAboveMA20,
    rsiAtEntry: ind.rsi14,
    bbPct: ind.bbPct,
    rsVsSpyNegativeStreak,
    structuralTarget,
    rrAchievable,
    trailMode,
    regime,
  };
}
