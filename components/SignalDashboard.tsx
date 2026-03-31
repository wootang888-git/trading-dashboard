"use client";

import { useEffect, useState, useCallback } from "react";
import MarketBanner from "./MarketBanner";
import SignalCard from "./SignalCard";
import CalculatorModal from "./CalculatorModal";
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
    upDayVolRatio: number;
    isAboveMa20: boolean;
    isAboveMa50: boolean;
    emaFanOpen: boolean;
    emaGapWidening: boolean;
    rsiInBullZone: boolean;
    isHigherHighs: boolean;
    isHigherLows: boolean;
    trendStructureIntact: boolean;
    rsVsSpy: number | null;
    rsRising: boolean;
    rsMakingNewHigh: boolean;
    atr14: number;
    macd: number;
    macdSignal: number;
    macdHist: number;
    bbUpper: number;
    bbLower: number;
    bbWidth: number;
    bbPct: number;
  };
  entryNote: string;
  stopNote: string;
  conditions?: { label: string; met: boolean }[];
  sa?: {
    earningsDays: number | null;
    recentHeadline: string | null;
    newsSentiment: "positive" | "negative" | "neutral" | null;
    newsUrl: string | null;
    newsPublisher: string | null;
  };
}

interface DashboardData {
  signals: SignalData[];
  marketCondition: "bull" | "bear" | "neutral";
  updatedAt: string;
}

interface CalcState {
  open: boolean;
  entry: number | null;
  stop: number | null;
}

export default function SignalDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [calc, setCalc] = useState<CalcState>({ open: false, entry: null, stop: null });

  const openCalc = useCallback((entry?: number | null, stop?: number | null) => {
    setCalc({ open: true, entry: entry ?? null, stop: stop ?? null });
  }, []);

  const closeCalc = useCallback(() => {
    setCalc({ open: false, entry: null, stop: null });
  }, []);

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

  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

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

  const sectionHead = (color: string) => ({
    color,
    fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
  });

  return (
    <div className="space-y-6">
      <MarketBanner condition={data.marketCondition} />

      {/* Stats pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: `${data.signals.length} Signals` },
          { label: `${strong.length} Strong`, color: "#43ed9e" },
          {
            label:
              data.marketCondition === "bull" ? "Bull Market"
              : data.marketCondition === "bear" ? "Bear Market"
              : "Neutral",
            color:
              data.marketCondition === "bull" ? "#43ed9e"
              : data.marketCondition === "bear" ? "#ffb3ae"
              : undefined,
          },
        ].map(({ label, color }) => (
          <span
            key={label}
            className="text-[11px] px-2.5 py-1 rounded-full"
            style={{
              backgroundColor: "var(--surface-container-high)",
              color: color ?? "var(--on-surface-variant)",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Refresh bar */}
      <div className="flex items-center justify-between text-xs" style={{ color: "var(--on-surface-variant)" }}>
        <span>Updated {updatedTime} · refreshes in {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => openCalc()}
            className="text-xs px-2 py-1 rounded transition-colors hover:brightness-125"
            style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface-variant)" }}
          >
            Calculator
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 transition-colors disabled:opacity-50 hover:brightness-125"
            style={{ color: "var(--on-surface-variant)" }}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh now
          </button>
        </div>
      </div>

      {/* Strong signals */}
      {strong.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={sectionHead("#43ed9e")}>
            Strong Setups ({strong.length})
          </h2>
          <div className="space-y-3">
            {strong.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} />
            ))}
          </div>
        </section>
      )}

      {/* Moderate signals */}
      {moderate.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={sectionHead("#c8a84b")}>
            Moderate Setups ({moderate.length})
          </h2>
          <div className="space-y-3">
            {moderate.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} />
            ))}
          </div>
        </section>
      )}

      {/* Watch list */}
      {watch.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={sectionHead("var(--on-surface-variant)")}>
            Watching ({watch.length})
          </h2>
          <div className="space-y-3">
            {watch.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} />
            ))}
          </div>
        </section>
      )}

      {data.signals.length === 0 && (
        <div className="text-center py-20" style={{ color: "var(--on-surface-variant)" }}>
          No signals loaded. Check your watchlist or try refreshing.
        </div>
      )}

      {/* Floating calculator modal */}
      {calc.open && (
        <CalculatorModal
          entry={calc.entry}
          stop={calc.stop}
          onClose={closeCalc}
        />
      )}
    </div>
  );
}
