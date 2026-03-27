/* eslint-disable @typescript-eslint/no-explicit-any */
// yahoo-finance2 v3 is a class — must be instantiated with new
// eslint-disable-next-line @typescript-eslint/no-require-imports
const YF = require("yahoo-finance2").default;
const yf = new YF({ suppressNotices: ["yahooSurvey"] });

export interface QuoteData {
  ticker: string;
  price: number;
  change: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  high52w: number;
  low52w: number;
  marketCap: number | null;
}

export interface HistoricalBar {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IntradayBar {
  time: number; // Unix seconds, shifted to ET so lightweight-charts displays correctly
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Returns Unix seconds offset so that UTC display == Eastern Time display */
function toETSeconds(date: Date): number {
  const utcMs = date.getTime();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  // DST: second Sunday in March → first Sunday in November (approximation)
  const isDST = (m > 3 && m < 11) || (m === 3 && d >= 8) || (m === 11 && d <= 7);
  const offsetMs = isDST ? 4 * 3_600_000 : 5 * 3_600_000;
  return Math.floor((utcMs - offsetMs) / 1000);
}

export async function getQuote(ticker: string): Promise<QuoteData | null> {
  try {
    const quote = await yf.quote(ticker);
    return {
      ticker,
      price: quote.regularMarketPrice ?? 0,
      change: quote.regularMarketChange ?? 0,
      changePct: quote.regularMarketChangePercent ?? 0,
      volume: quote.regularMarketVolume ?? 0,
      avgVolume: quote.averageDailyVolume10Day ?? 0,
      high52w: quote.fiftyTwoWeekHigh ?? 0,
      low52w: quote.fiftyTwoWeekLow ?? 0,
      marketCap: quote.marketCap ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Intraday bars for "1D" chart view.
 * Fetches the last 2 calendar days so weekends/holidays fall back to the prior session.
 * interval: "1m" | "2m" | "5m" | "15m" | "30m"
 */
export async function getIntraday(
  ticker: string,
  interval: string
): Promise<IntradayBar[]> {
  const from = new Date();
  from.setDate(from.getDate() - 2); // 2 days back covers weekends
  try {
    const result = await yf.chart(ticker, {
      period1: from,
      interval: interval as "1m" | "2m" | "5m" | "15m" | "30m",
    });
    return ((result.quotes as any[]) ?? [])
      .filter((q: any) => q.close !== null && q.date !== null)
      .map((q: any) => ({
        time: toETSeconds(new Date(q.date)),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }))
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}

export async function getHistorical(
  ticker: string,
  days = 60
): Promise<HistoricalBar[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const result = await yf.chart(ticker, {
      period1: startDate,
      interval: "1d",
    });

    return ((result.quotes as any[]) ?? [])
      .filter((q: any) => q.close !== null)
      .map((q: any) => ({
        date: new Date(q.date),
        open: q.open ?? 0,
        high: q.high ?? 0,
        low: q.low ?? 0,
        close: q.close ?? 0,
        volume: q.volume ?? 0,
      }));
  } catch {
    return [];
  }
}
