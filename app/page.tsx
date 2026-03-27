import Link from "next/link";
import SignalDashboard from "@/components/SignalDashboard";
import { getWatchlist } from "@/lib/supabase";
import { getQuote, getHistorical } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";

export const revalidate = 300;

async function getInitialData() {
  const watchlist = await getWatchlist();

  const results = await Promise.all(
    watchlist.map(async ({ ticker, strategy }) => {
      const [quote, bars] = await Promise.all([
        getQuote(ticker),
        getHistorical(ticker, 60),
      ]);
      if (!quote || bars.length === 0) return null;
      const signal = buildSignal(ticker, strategy, bars, quote.high52w);
      return {
        ...signal,
        price: quote.price,
        change: quote.change,
        changePct: quote.changePct,
        volume: quote.volume,
        avgVolume: quote.avgVolume,
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
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Trading Dashboard</h1>
            <p className="text-gray-400 text-sm mt-1">
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <Link
            href="/watchlist"
            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-2 transition-colors"
          >
            Manage Watchlist ({initial.signals.length})
          </Link>
        </div>

        {/* Client component handles display + auto-refresh */}
        <SignalDashboard initial={initial} />

        <footer className="text-center text-gray-600 text-xs pt-4 pb-8">
          Not financial advice. Paper trade first. Protect your capital.
        </footer>
      </div>
    </main>
  );
}
