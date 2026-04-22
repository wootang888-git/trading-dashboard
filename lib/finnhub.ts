// Finnhub — analyst consensus (recommendation endpoint, free tier)
// /news-sentiment and /stock/price-target require paid plans.
// /stock/recommendation is free: returns buy/hold/sell counts from the most recent month.
// 1 call per ticker, watchlist-only (~20 tickers). Well under 60 req/min free limit.

const API_KEY = process.env.FINNHUB_API_KEY;
const BASE = "https://finnhub.io/api/v1";

export interface FinnhubData {
  bullishPct: number | null;   // (strongBuy + buy) / total * 100
  bearishPct: number | null;   // (strongSell + sell) / total * 100
  analystCount: number | null; // total analyst ratings in latest period
  label: "bullish" | "bearish" | "neutral" | null;
  targetMean: number | null;   // always null (paid endpoint) — kept for interface compat
  targetHigh: number | null;
  targetLow: number | null;
}

const NULL_DATA: FinnhubData = {
  bullishPct: null,
  bearishPct: null,
  analystCount: null,
  label: null,
  targetMean: null,
  targetHigh: null,
  targetLow: null,
};

const cache = new Map<string, { data: FinnhubData; ts: number }>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

function deriveLabel(bullishPct: number | null): "bullish" | "bearish" | "neutral" | null {
  if (bullishPct === null) return null;
  if (bullishPct > 55) return "bullish";
  if (bullishPct < 45) return "bearish";
  return "neutral";
}

async function fetchRecommendation(ticker: string): Promise<{
  bullishPct: number | null;
  bearishPct: number | null;
  analystCount: number | null;
}> {
  try {
    const res = await fetch(`${BASE}/stock/recommendation?symbol=${ticker}&token=${API_KEY}`);
    if (!res.ok) return { bullishPct: null, bearishPct: null, analystCount: null };
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { bullishPct: null, bearishPct: null, analystCount: null };
    }
    // Use the most recent period (first element)
    const latest = rows[0];
    const bullish = (latest.strongBuy ?? 0) + (latest.buy ?? 0);
    const bearish = (latest.strongSell ?? 0) + (latest.sell ?? 0);
    const total = bullish + (latest.hold ?? 0) + bearish;
    if (total === 0) return { bullishPct: null, bearishPct: null, analystCount: null };
    return {
      bullishPct: Math.round((bullish / total) * 100),
      bearishPct: Math.round((bearish / total) * 100),
      analystCount: total,
    };
  } catch {
    return { bullishPct: null, bearishPct: null, analystCount: null };
  }
}

export async function getFinnhubData(ticker: string): Promise<FinnhubData> {
  if (!API_KEY) return NULL_DATA;

  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const rec = await fetchRecommendation(ticker);

  const data: FinnhubData = {
    bullishPct: rec.bullishPct,
    bearishPct: rec.bearishPct,
    analystCount: rec.analystCount,
    label: deriveLabel(rec.bullishPct),
    targetMean: null,
    targetHigh: null,
    targetLow: null,
  };

  cache.set(ticker, { data, ts: Date.now() });
  return data;
}
