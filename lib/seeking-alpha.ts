// Seeking Alpha via seeking-alpha21.p.rapidapi.com
// Provides: recent article sentiment + upcoming earnings dates
// Quant ratings are not available on this API version

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const HOST = "seeking-alpha21.p.rapidapi.com";
const HEADERS = {
  "x-rapidapi-key": RAPIDAPI_KEY ?? "",
  "x-rapidapi-host": HOST,
};

export interface SAData {
  quantRating: string | null;
  analystRating: string | null;
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
}

// In-memory cache: 6h for sentiment, 24h for earnings calendar
const articleCache = new Map<string, { data: Pick<SAData, "recentHeadline" | "newsSentiment">; ts: number }>();
const ARTICLE_TTL = 6 * 60 * 60 * 1000;

let earningsCache: { byTicker: Record<string, string>; ts: number } | null = null;
const EARNINGS_TTL = 24 * 60 * 60 * 1000;

const POSITIVE = ["buy", "bullish", "outperform", "upgrade", "strong", "surge", "rally", "beat", "upside", "growth", "won't be dead", "longer"];
const NEGATIVE = ["sell", "bearish", "underperform", "downgrade", "weak", "crash", "avoid", "miss", "cut", "risk", "dead money", "warning"];

function sentimentFromTitle(title: string): "positive" | "negative" | "neutral" {
  const lower = title.toLowerCase();
  const pos = POSITIVE.filter((w) => lower.includes(w)).length;
  const neg = NEGATIVE.filter((w) => lower.includes(w)).length;
  if (pos > neg) return "positive";
  if (neg > pos) return "negative";
  return "neutral";
}

async function getEarningsCalendar(): Promise<Record<string, string>> {
  if (earningsCache && Date.now() - earningsCache.ts < EARNINGS_TTL) {
    return earningsCache.byTicker;
  }
  try {
    const today = new Date().toISOString().split("T")[0];
    const res = await fetch(
      `https://${HOST}/market/earnings-calendar?date=${today}`,
      { headers: HEADERS }
    );
    if (!res.ok) return {};
    const data = await res.json();
    const byTicker: Record<string, string> = {};
    for (const day of data?.data ?? []) {
      const { date, top_companies } = day.attributes;
      for (const ticker of top_companies ?? []) {
        if (!(ticker in byTicker)) byTicker[ticker] = date;
      }
    }
    earningsCache = { byTicker, ts: Date.now() };
    return byTicker;
  } catch {
    return {};
  }
}

async function getArticleSentiment(
  ticker: string
): Promise<Pick<SAData, "recentHeadline" | "newsSentiment">> {
  const cached = articleCache.get(ticker);
  if (cached && Date.now() - cached.ts < ARTICLE_TTL) return cached.data;

  try {
    const res = await fetch(
      `https://${HOST}/analysis/list?symbol=${ticker}&page=1`,
      { headers: HEADERS }
    );
    if (!res.ok) return { recentHeadline: null, newsSentiment: null };
    const data = await res.json();
    const title: string | null = data?.data?.[0]?.attributes?.title ?? null;
    const result = {
      recentHeadline: title,
      newsSentiment: title ? sentimentFromTitle(title) : null,
    } as Pick<SAData, "recentHeadline" | "newsSentiment">;
    articleCache.set(ticker, { data: result, ts: Date.now() });
    return result;
  } catch {
    return { recentHeadline: null, newsSentiment: null };
  }
}

export async function getSAData(ticker: string): Promise<SAData> {
  if (!RAPIDAPI_KEY) {
    return { quantRating: null, analystRating: null, earningsDays: null, recentHeadline: null, newsSentiment: null };
  }

  const [article, earningsMap] = await Promise.all([
    getArticleSentiment(ticker),
    getEarningsCalendar(),
  ]);

  const earningsDate = earningsMap[ticker] ?? null;
  const earningsDays = earningsDate
    ? Math.ceil((new Date(earningsDate).getTime() - Date.now()) / 86400000)
    : null;

  return {
    quantRating: null,       // not available on this API
    analystRating: null,     // not available on this API
    earningsDays,
    recentHeadline: article.recentHeadline,
    newsSentiment: article.newsSentiment,
  };
}

export function daysUntilEarnings(earningsDays: number | null): number | null {
  return earningsDays;
}
