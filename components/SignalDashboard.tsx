"use client";

import { useEffect, useState, useCallback } from "react";
import MarketBanner from "./MarketBanner";
import SignalCard from "./SignalCard";
import { RefreshCw } from "lucide-react";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

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
  sa?: {
    quantRating: string | null;
    analystRating: string | null;
    earningsDays: number | null;
    recentHeadline: string | null;
    newsSentiment: "positive" | "negative" | "neutral" | null;
  };
}

interface DashboardData {
  signals: SignalData[];
  marketCondition: "bull" | "bear" | "neutral";
  updatedAt: string;
}

export default function SignalDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/signals", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    }
  }, []);

  // Auto-refresh every 5 min
  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  // Countdown timer (updates every second)
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  const strong = data.signals.filter((s) => s.score >= 8);
  const moderate = data.signals.filter((s) => s.score >= 5 && s.score < 8);
  const watch = data.signals.filter((s) => s.score < 5);

  const updatedTime = new Date(data.updatedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Market condition */}
      <MarketBanner condition={data.marketCondition} />

      {/* Refresh bar */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Updated {updatedTime} · refreshes in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          Refresh now
        </button>
      </div>

      {/* Strong signals */}
      {strong.length > 0 && (
        <section>
          <h2 className="text-green-400 font-semibold text-sm uppercase tracking-wider mb-3">
            Strong Setups ({strong.length})
          </h2>
          <div className="space-y-3">
            {strong.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} />
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
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} />
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
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} />
            ))}
          </div>
        </section>
      )}

      {data.signals.length === 0 && (
        <div className="text-center text-gray-500 py-20">
          No signals loaded. Check your watchlist or try refreshing.
        </div>
      )}
    </div>
  );
}
