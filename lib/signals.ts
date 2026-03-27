import { HistoricalBar } from "./yahoo";

export interface Indicators {
  rsi14: number;
  ma20: number;
  ma50: number;
  volumeRatio: number; // today vs 20-day avg
  priceVs52wHigh: number; // % below 52w high
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  isNear52wHigh: boolean; // within 10% of 52w high
}

export interface Signal {
  ticker: string;
  score: number; // 0–10
  strength: "strong" | "moderate" | "weak" | "none";
  strategy: string;
  indicators: Indicators;
  entryNote: string;
  stopNote: string;
}

function calcRSI(bars: HistoricalBar[], period = 14): number {
  if (bars.length < period + 1) return 50;
  let gains = 0,
    losses = 0;
  for (let i = bars.length - period; i < bars.length; i++) {
    const diff = bars[i].close - bars[i - 1].close;
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calcMA(bars: HistoricalBar[], period: number): number {
  if (bars.length < period) return 0;
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.close, 0) / period;
}

function calcAvgVolume(bars: HistoricalBar[], period = 20): number {
  if (bars.length < period) return 0;
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.volume, 0) / period;
}

export function computeIndicators(
  bars: HistoricalBar[],
  high52w: number
): Indicators {
  if (bars.length === 0) {
    return {
      rsi14: 50,
      ma20: 0,
      ma50: 0,
      volumeRatio: 1,
      priceVs52wHigh: 0,
      isAboveMa20: false,
      isAboveMa50: false,
      isNear52wHigh: false,
    };
  }

  const latest = bars[bars.length - 1];
  const rsi14 = calcRSI(bars);
  const ma20 = calcMA(bars, 20);
  const ma50 = calcMA(bars, 50);
  const avgVol = calcAvgVolume(bars);
  const volumeRatio = avgVol > 0 ? latest.volume / avgVol : 1;
  const priceVs52wHigh =
    high52w > 0 ? ((high52w - latest.close) / high52w) * 100 : 100;

  return {
    rsi14,
    ma20,
    ma50,
    volumeRatio,
    priceVs52wHigh,
    isAboveMa20: latest.close > ma20,
    isAboveMa50: latest.close > ma50,
    isNear52wHigh: priceVs52wHigh <= 10,
  };
}

export function scoreMomentumBreakout(
  ind: Indicators,
  bars: HistoricalBar[]
): { score: number; entryNote: string; stopNote: string } {
  let score = 0;

  // RSI in healthy momentum zone (50–75)
  if (ind.rsi14 >= 50 && ind.rsi14 <= 75) score += 2;
  else if (ind.rsi14 > 75) score += 1; // overbought — less ideal entry

  // Price above both MAs
  if (ind.isAboveMa20) score += 2;
  if (ind.isAboveMa50) score += 1;

  // Near 52-week high (momentum breakout characteristic)
  if (ind.isNear52wHigh) score += 2;

  // Volume confirmation (your rule: >1.5x average)
  if (ind.volumeRatio >= 1.5) score += 2;
  else if (ind.volumeRatio >= 1.2) score += 1;

  // Trend confirmation: last 5 days up
  if (bars.length >= 5) {
    const recent = bars.slice(-5);
    const trending = recent[recent.length - 1].close > recent[0].close;
    if (trending) score += 1;
  }

  const latest = bars[bars.length - 1];
  const entryNote = `Buy stop $0.05 above $${latest.high.toFixed(2)} (today's high / resistance)`;

  // Stop loss: below recent swing low (last 5 bars)
  const swingLow =
    bars.length >= 5
      ? Math.min(...bars.slice(-5).map((b) => b.low))
      : latest.low;
  const stopNote = `Stop loss below $${swingLow.toFixed(2)} (recent swing low)`;

  return { score: Math.min(score, 10), entryNote, stopNote };
}

export function buildSignal(
  ticker: string,
  strategy: string,
  bars: HistoricalBar[],
  high52w: number
): Signal {
  const ind = computeIndicators(bars, high52w);
  const { score, entryNote, stopNote } = scoreMomentumBreakout(ind, bars);

  const strength =
    score >= 8
      ? "strong"
      : score >= 6
      ? "moderate"
      : score >= 4
      ? "weak"
      : "none";

  return { ticker, score, strength, strategy, indicators: ind, entryNote, stopNote };
}
