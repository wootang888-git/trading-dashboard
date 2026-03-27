// Seeking Alpha data via RapidAPI
// Sign up at rapidapi.com → search "Seeking Alpha" → subscribe to the free/basic plan
// Add RAPIDAPI_KEY to your .env.local and Vercel env vars

export interface SAData {
  quantRating: string | null;       // "Very Bullish" | "Bullish" | "Neutral" | "Bearish" | "Very Bearish"
  quantScore: number | null;        // 1–5
  analystRating: string | null;     // "Strong Buy" | "Buy" | "Hold" | "Sell" | "Strong Sell"
  earningsDate: string | null;      // ISO date string e.g. "2025-04-23"
  newsSentiment: "positive" | "negative" | "neutral" | null;
}

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const BASE_URL = "https://seeking-alpha.p.rapidapi.com";
const HEADERS = {
  "x-rapidapi-key": RAPIDAPI_KEY ?? "",
  "x-rapidapi-host": "seeking-alpha.p.rapidapi.com",
};

// Cache results in memory for 24h to stay within free tier limits
const cache = new Map<string, { data: SAData; ts: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000;

function quantScoreToLabel(score: number | null): string | null {
  if (score === null) return null;
  if (score >= 4.5) return "Very Bullish";
  if (score >= 3.5) return "Bullish";
  if (score >= 2.5) return "Neutral";
  if (score >= 1.5) return "Bearish";
  return "Very Bearish";
}

export async function getSAData(ticker: string): Promise<SAData> {
  // Return empty if no API key configured
  if (!RAPIDAPI_KEY) {
    return { quantRating: null, quantScore: null, analystRating: null, earningsDate: null, newsSentiment: null };
  }

  // Return cached data if fresh
  const cached = cache.get(ticker);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    // Fetch quant rating + analyst rating + earnings in parallel
    const [summaryRes, earningsRes] = await Promise.all([
      fetch(`${BASE_URL}/symbols/get-summary?symbols=${ticker}`, { headers: HEADERS }),
      fetch(`${BASE_URL}/symbols/get-earnings?id=${ticker.toLowerCase()}&type=upcoming`, { headers: HEADERS }),
    ]);

    let quantScore: number | null = null;
    let analystRating: string | null = null;
    let earningsDate: string | null = null;

    if (summaryRes.ok) {
      const summary = await summaryRes.json();
      const attr = summary?.data?.[0]?.attributes;
      quantScore = attr?.quant_rating ?? null;
      // Analyst consensus comes as a number 1–5
      const analystNum: number | null = attr?.sell_side_average_rating ?? null;
      if (analystNum !== null) {
        if (analystNum >= 4.5) analystRating = "Strong Buy";
        else if (analystNum >= 3.5) analystRating = "Buy";
        else if (analystNum >= 2.5) analystRating = "Hold";
        else if (analystNum >= 1.5) analystRating = "Sell";
        else analystRating = "Strong Sell";
      }
    }

    if (earningsRes.ok) {
      const earnings = await earningsRes.json();
      const next = earnings?.data?.[0]?.attributes?.report_date;
      earningsDate = next ?? null;
    }

    const data: SAData = {
      quantRating: quantScoreToLabel(quantScore),
      quantScore,
      analystRating,
      earningsDate,
      newsSentiment: null, // can be added with the news endpoint in a future session
    };

    cache.set(ticker, { data, ts: Date.now() });
    return data;
  } catch {
    return { quantRating: null, quantScore: null, analystRating: null, earningsDate: null, newsSentiment: null };
  }
}

export function daysUntilEarnings(earningsDate: string | null): number | null {
  if (!earningsDate) return null;
  const diff = new Date(earningsDate).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
