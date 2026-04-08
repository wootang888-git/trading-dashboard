"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MarketBanner from "./MarketBanner";
import MarketSessionPill from "./MarketSessionPill";
import SignalCard from "./SignalCard";
import CalculatorModal from "./CalculatorModal";
import { RefreshCw, BookOpen } from "lucide-react";

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

interface OpenPositionSummary {
  count: number;
  nearStop: string[];   // tickers near their stop
}

export default function SignalDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [calc, setCalc] = useState<CalcState>({ open: false, entry: null, stop: null });
  const [openPositions, setOpenPositions] = useState<OpenPositionSummary | null>(null);

  // Track previous conviction scores to detect Watch→Trade crossings
  const prevScores = useRef<Map<string, number>>(
    new Map(initial.signals.map((s) => [s.ticker, s.convictionScore]))
  );

  useNotificationPermission();

  // Fetch open positions summary for morning brief
  useEffect(() => {
    async function loadPositions() {
      try {
        const [tradesRes, pricesRes] = await Promise.all([
          fetch("/api/trades"),
          Promise.resolve(null), // prices fetched after we know tickers
        ]);
        void pricesRes;
        if (!tradesRes.ok) return;
        const { trades } = await tradesRes.json();
        const openTrades = (trades as Array<{ ticker: string; entry_price: number; stop_price: number | null; exit_date: string | null }>)
          .filter((t) => !t.exit_date);
        if (openTrades.length === 0) { setOpenPositions({ count: 0, nearStop: [] }); return; }

        const tickers = [...new Set(openTrades.map((t) => t.ticker))].join(",");
        const priceRes = await fetch(`/api/current-prices?tickers=${tickers}`);
        if (!priceRes.ok) { setOpenPositions({ count: openTrades.length, nearStop: [] }); return; }
        const prices: Record<string, number | null> = await priceRes.json();

        const nearStop = openTrades
          .filter((t) => {
            const live = prices[t.ticker];
            if (!live || !t.stop_price) return false;
            return ((live - t.stop_price) / t.entry_price) * 100 < 5;
          })
          .map((t) => t.ticker);

        setOpenPositions({ count: openTrades.length, nearStop });
      } catch { /* silent — morning brief is non-critical */ }
    }
    loadPositions();
  }, []);

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

      {/* Stats pills + session */}
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
        <MarketSessionPill />
      </div>

      {/* Morning Brief — open positions health */}
      {openPositions !== null && openPositions.count > 0 && (
        <div className="rounded-xl px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
          style={{ backgroundColor: "var(--surface-container)" }}>
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--on-surface-variant)" }}>
            <BookOpen size={13} />
            Today&apos;s Positions
          </div>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            <span className="font-semibold text-white">{openPositions.count}</span> open
          </span>
          {openPositions.nearStop.length > 0 ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-orange-400">
              ⚠ Near stop: {openPositions.nearStop.join(", ")}
            </span>
          ) : (
            <span className="text-xs text-[#43ed9e]">✓ All positions have stop buffer &gt;5%</span>
          )}
          <a href="/journal" className="ml-auto text-xs underline-offset-2 hover:underline" style={{ color: "var(--on-surface-variant)" }}>
            View journal →
          </a>
        </div>
      )}

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
