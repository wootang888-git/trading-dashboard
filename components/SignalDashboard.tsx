"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MarketBanner from "./MarketBanner";
import SignalCard from "./SignalCard";
import CalculatorModal from "./CalculatorModal";
import { RefreshCw } from "lucide-react";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TRADE_THRESHOLD = 82;  // Gate 1: pull the trigger
const WATCH_THRESHOLD = 70;  // Gate 2: set an alert

interface ValidationResult {
  passed: boolean;
  conflictPenalty: number;
  dataQualityPts: number;
  notes: string[];
  checked_at: string;
}

interface SignalData {
  ticker: string;
  score: number;
  strength: string;
  strategy: string;
  price: number;
  changePct: number;
  convictionScore: number;
  convictionBand: "high" | "medium" | "low";
  sectorRs: number | null;
  validation: ValidationResult;
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
  entryPrice: number;
  stopPrice: number;
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

/** Request browser notification permission once on mount. */
function useNotificationPermission() {
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);
}

/** Fire a browser notification if the browser supports it and permission is granted. */
function notify(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(title, { body, icon: "/favicon.ico" });
}

export default function SignalDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [calc, setCalc] = useState<CalcState>({ open: false, entry: null, stop: null });

  // Track previous conviction scores to detect Watch→Trade crossings
  const prevScores = useRef<Map<string, number>>(
    new Map(initial.signals.map((s) => [s.ticker, s.convictionScore]))
  );

  useNotificationPermission();

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
      if (!res.ok) return;
      const newData: DashboardData = await res.json();

      // Check for Watch→Trade crossings and fire browser notifications
      for (const signal of newData.signals) {
        const prev = prevScores.current.get(signal.ticker) ?? 0;
        const curr = signal.convictionScore;
        // Was below trade threshold, now at or above it
        if (prev < TRADE_THRESHOLD && curr >= TRADE_THRESHOLD) {
          notify(
            `${signal.ticker} crossed Trade threshold`,
            `Conviction ${curr}/100 — ${signal.strategy.replace(/_/g, " ")} setup. Entry: $${signal.entryPrice?.toFixed(2) ?? "–"}`
          );
        }
      }
      // Update previous scores map
      prevScores.current = new Map(newData.signals.map((s) => [s.ticker, s.convictionScore]));
      setData(newData);
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

  const trade = data.signals.filter((s) => s.convictionScore >= TRADE_THRESHOLD);
  const watch = data.signals.filter((s) => s.convictionScore >= WATCH_THRESHOLD && s.convictionScore < TRADE_THRESHOLD);
  const observe = data.signals.filter((s) => s.convictionScore < WATCH_THRESHOLD);

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
          { label: `${trade.length} Trade`, color: "#43ed9e" },
          { label: `${watch.length} Watch`, color: "#c8a84b" },
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

      {/* Trade signals (≥82) */}
      {trade.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={sectionHead("#43ed9e")}>
            Trade — High Conviction ({trade.length})
          </h2>
          <div className="space-y-3">
            {trade.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} />
            ))}
          </div>
        </section>
      )}

      {/* Watch signals (70–81) — alert when they cross 82 */}
      {watch.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#c8a84b")}>
            Watch — Alert at {TRADE_THRESHOLD} ({watch.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Browser notification fires automatically when any of these cross {TRADE_THRESHOLD}.
          </p>
          <div className="space-y-3">
            {watch.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} />
            ))}
          </div>
        </section>
      )}

      {/* Observe (<70) */}
      {observe.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-3" style={sectionHead("var(--on-surface-variant)")}>
            Observe ({observe.length})
          </h2>
          <div className="space-y-3">
            {observe.map((s) => (
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
