import MarketBanner from "@/components/MarketBanner";
import SignalCard from "@/components/SignalCard";

interface SignalData {
  ticker: string;
  score: number;
  strength: string;
  strategy: string;
  price: number;
  changePct: number;
  indicators: {
    rsi14: number;
    volumeRatio: number;
    isAboveMa20: boolean;
    isAboveMa50: boolean;
  };
  entryNote: string;
  stopNote: string;
}

async function getSignals(): Promise<{
  signals: SignalData[];
  marketCondition: "bull" | "bear" | "neutral";
}> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/signals`, {
      next: { revalidate: 900 },
    });
    if (!res.ok) throw new Error("fetch failed");
    return res.json();
  } catch {
    return { signals: [], marketCondition: "neutral" };
  }
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
