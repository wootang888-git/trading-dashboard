import MarketBanner from "@/components/MarketBanner";
import SignalCard from "@/components/SignalCard";
import { WATCHLIST } from "@/lib/watchlist";
import { getQuote, getHistorical } from "@/lib/yahoo";
import { buildSignal } from "@/lib/signals";

export const revalidate = 900; // rebuild page every 15 min

async function getSignals() {
  const results = await Promise.all(
    WATCHLIST.map(async ({ ticker, strategy }) => {
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
    ? spySignal.indicators.isAboveMa20
      ? "bull"
      : "bear"
    : "neutral";

  return { signals: signals as NonNullable<(typeof signals)[number]>[], marketCondition };
}

export default async function DashboardPage() {
  const { signals, marketCondition } = await getSignals();

  const strong = signals.filter((s) => s.score >= 8);
  const moderate = signals.filter((s) => s.score >= 5 && s.score < 8);
  const watch = signals.filter((s) => s.score < 5);

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Trading Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
            {" · "}Data delayed 15 min
          </p>
        </div>

        {/* Market condition */}
        <MarketBanner condition={marketCondition} />

        {/* Strong signals */}
        {strong.length > 0 && (
          <section>
            <h2 className="text-green-400 font-semibold text-sm uppercase tracking-wider mb-3">
              Strong Setups ({strong.length})
            </h2>
            <div className="space-y-3">
              {strong.map((s) => (
                <SignalCard key={s.ticker} {...s} {...s.indicators} />
              ))}
            </div>
          </section>
        )}

        {/* Moderate signals */}
        {moderate.length > 0 && (
          <section>
            <h2 className="text-yellow-400 font-semibold text-sm uppercase tracking-wider mb-3">
              Moderate Setups ({moderate.length})
            </h2>
            <div className="space-y-3">
              {moderate.map((s) => (
                <SignalCard key={s.ticker} {...s} {...s.indicators} />
              ))}
            </div>
          </section>
        )}

        {/* Watch list */}
        {watch.length > 0 && (
          <section>
            <h2 className="text-gray-500 font-semibold text-sm uppercase tracking-wider mb-3">
              Watching ({watch.length})
            </h2>
            <div className="space-y-3">
              {watch.map((s) => (
                <SignalCard key={s.ticker} {...s} {...s.indicators} />
              ))}
            </div>
          </section>
        )}

        {signals.length === 0 && (
          <div className="text-center text-gray-500 py-20">
            Loading signals... (first load may take 30 seconds)
          </div>
        )}

        {/* Footer */}
        <footer className="text-center text-gray-600 text-xs pt-4 pb-8">
          Not financial advice. Paper trade first. Protect your capital.
        </footer>
      </div>
    </main>
  );
}
