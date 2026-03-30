import SignalDashboard from "@/components/SignalDashboard";
import { getWatchlist } from "@/lib/supabase";
import { getQuote, getHistorical, getNews } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";

export const revalidate = 300;

async function getInitialData() {
  const watchlist = await getWatchlist();

  const results = await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars, news] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 60),
        getNews(ticker),
      ]);
      if (!quote || bars.length === 0) return null;
      const signal = buildSignal(ticker, strategy, bars, quote.high52w);

      const POSITIVE = ["buy", "bullish", "outperform", "upgrade", "strong", "surge", "rally", "beat", "upside", "growth"];
      const NEGATIVE = ["sell", "bearish", "underperform", "downgrade", "weak", "crash", "avoid", "miss", "cut", "risk"];
      const sentiment = (title: string): "positive" | "negative" | "neutral" => {
        const lower = title.toLowerCase();
        const pos = POSITIVE.filter((w) => lower.includes(w)).length;
        const neg = NEGATIVE.filter((w) => lower.includes(w)).length;
        return pos > neg ? "positive" : neg > pos ? "negative" : "neutral";
      };

      const earningsDays = quote.earningsTimestamp
        ? Math.ceil((quote.earningsTimestamp.getTime() - Date.now()) / 86400000)
        : null;

      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
        sa: {
          earningsDays: earningsDays !== null && earningsDays >= 0 && earningsDays <= 14 ? earningsDays : null,
          recentHeadline: news?.title ?? null,
          newsSentiment: news?.title ? sentiment(news.title) : null,
          newsUrl: news?.link ?? null,
          newsPublisher: news?.publisher ?? null,
        },
      };
    })
  );

  const signals = results.filter(Boolean).sort((a, b) => b!.score - a!.score);
  const spySignal = signals.find((s) => s?.ticker === "SPY");
  const marketCondition: "bull" | "bear" | "neutral" = spySignal
    ? spySignal.indicators.isAboveMa20 ? "bull" : "bear"
    : "neutral";

  return {
    signals: signals as NonNullable<(typeof signals)[number]>[],
    marketCondition,
    updatedAt: new Date().toISOString(),
  };
}

export default async function DashboardPage() {
  const initial = await getInitialData();

  return (
    <main className="min-h-screen" style={{ backgroundColor: "var(--surface)", color: "var(--on-surface)" }}>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Client component handles display + auto-refresh */}
        <SignalDashboard initial={initial} />

        <footer className="text-center text-xs pt-4 pb-8" style={{ color: "var(--outline)" }}>
          Not financial advice. Paper trade first. Protect your capital.
        </footer>
      </div>
    </main>
  );
}
