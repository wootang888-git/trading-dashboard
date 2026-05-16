"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MarketBanner from "./MarketBanner";
import MarketSessionPill from "./MarketSessionPill";
import SignalCard from "./SignalCard";
import CalculatorModal from "./CalculatorModal";
import MlDiscoveries from "./MlDiscoveries";
import MlTrackRecord from "./MlTrackRecord";
import SectorPulseBanner, { SectorPulseData } from "./SectorPulseBanner";
import { RefreshCw, BookOpen, ChevronDown, ChevronUp } from "lucide-react";
import { MlScore, MlPerformanceRow } from "@/lib/supabase";
import type { HardGates, NbaDirective, SignalTier } from "@/lib/signals";

const REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes
const TRADE_THRESHOLD = 82;  // legacy: still used for cross-threshold notifications

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
    weeklyStage2?: boolean;
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
    finnhubLabel: "bullish" | "bearish" | "neutral" | null;
    finnhubBullishPct: number | null;
    finnhubAnalystCount: number | null;
    analystTargetMean: number | null;
    analystUpside: number | null;
  };
  mlScore?: number | null;
  mlRank?: number | null;
  garchVol?: number | null;
  gapPctLive?: number | null;
  pmVolRatioLive?: number | null;
  open930Live?: number | null;
  prevClose?: number | null;
  open?: number | null;
  // Conviction history (populated after Phase D)
  convictionTrend?: "rising" | "stable" | "falling" | null;
  convictionStreak?: number | null;
  // Phase 1: tier + hard gates
  tier: SignalTier;
  hardGates: HardGates;
  volPriceConfirmed: boolean;
  sectorEtfAboveMA20: boolean;
  rsiAtEntry: number;
  bbPct: number;
  rsVsSpyNegativeStreak: number;
  // Phase B: streak + ML delta
  streakDays?: number;
  mlDelta24h?: number | null;
  streakDirection?: "rising" | "falling" | "flat";
  // Phase C: NBA directive
  nbaDirective?: NbaDirective;
  nbaDirectiveReason?: string;
  // Dynamic structural trade setup
  structuralTarget?: number;
  rrAchievable?: number;
  trailMode?: boolean;
  regime?: "bull" | "bear" | "choppy";
  // Feature flags
  earningsRisk?: boolean;       // conviction ≥80 but earnings within T-5 to T+1
}

interface DashboardData {
  signals: SignalData[];
  mlDiscoveries?: MlScore[];
  mlPerformance?: MlPerformanceRow[];
  marketCondition: "bull" | "bear" | "neutral";
  breadthFlag?: "accumulation" | "neutral" | "distribution" | null;
  breadthScore?: number | null;
  sectorPulse?: SectorPulseData[] | null;
  volumeAnomalies?: { ticker: string; pmVolRatioLive: number | null; mlScore: number; gapPctLive: number | null }[] | null;
  updatedAt: string;
}

interface CalcState {
  open: boolean;
  entry: number | null;
  stop: number | null;
  ticker?: string;
  garchVol?: number | null;
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
  nearStop: string[];      // tickers near their stop
  aboveTarget: string[];   // tickers past their 3:1 target
}

interface OpenTrade {
  ticker: string;
  entry_price: number;
  stop_price: number | null;
}

export default function SignalDashboard({ initial }: { initial: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initial);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);
  const [calc, setCalc] = useState<CalcState>({ open: false, entry: null, stop: null });
  const [openPositions, setOpenPositions] = useState<OpenPositionSummary | null>(null);
  const [showScoredTooltip, setShowScoredTooltip] = useState(false);
  // ticker → { ids: trade IDs[], count }
  const [positionData, setPositionData] = useState<Map<string, { ids: string[]; count: number }>>(new Map());
  const [notYetOpen, setNotYetOpen] = useState(false);
  const [positionsLoaded, setPositionsLoaded] = useState(false);
  const [updatedTime, setUpdatedTime] = useState("");


  // Track previous conviction scores to detect Watch→Trade crossings
  const prevScores = useRef<Map<string, number>>(
    new Map(initial.signals.map((s) => [s.ticker, s.convictionScore]))
  );
  // Sprint D: open trades for stop/entry alerts
  const openTradesRef = useRef<OpenTrade[]>([]);
  const alertedStopRef = useRef<Set<string>>(new Set());    // key: ticker
  const alertedEntryRef = useRef<Set<string>>(new Set());   // key: `${ticker}-${entryPrice}`

  useNotificationPermission();

  // Fetch open trades — drives morning brief AND "In Position" ribbons on cards
  const loadPositions = useCallback(async () => {
    try {
      const tradesRes = await fetch("/api/trades");
      if (!tradesRes.ok) return;
      const { trades } = await tradesRes.json();
      const openTrades = (trades as Array<{ ticker: string; entry_price: number; stop_price: number | null; exit_date: string | null }>)
        .filter((t) => !t.exit_date);

      // Derive "In Position" map: ticker → { ids, count }
      const pdMap = new Map<string, { ids: string[]; count: number }>();
      for (const t of openTrades as Array<{ id: string; ticker: string; entry_price: number; stop_price: number | null; exit_date: string | null }>) {
        const entry = pdMap.get(t.ticker) ?? { ids: [], count: 0 };
        entry.ids.push(t.id);
        entry.count += 1;
        pdMap.set(t.ticker, entry);
      }
      setPositionData(pdMap);
      setPositionsLoaded(true);

      if (openTrades.length === 0) { setOpenPositions({ count: 0, nearStop: [], aboveTarget: [] }); return; }

      const tickers = [...new Set(openTrades.map((t) => t.ticker))].join(",");
      const priceRes = await fetch(`/api/current-prices?tickers=${tickers}`);
      if (!priceRes.ok) { setOpenPositions({ count: openTrades.length, nearStop: [], aboveTarget: [] }); return; }
      const prices: Record<string, { price: number; prevClose: number; open: number } | null> = await priceRes.json();

      const nearStop = openTrades
        .filter((t) => {
          const live = prices[t.ticker]?.price;
          if (!live || !t.stop_price) return false;
          const riskDist = t.entry_price - t.stop_price;
          return riskDist > 0 && ((live - t.stop_price) / riskDist) * 100 < 5;
        })
        .map((t) => t.ticker);

      const aboveTarget = openTrades
        .filter((t) => {
          const live = prices[t.ticker]?.price;
          if (!live || !t.stop_price || t.stop_price >= t.entry_price) return false;
          // Use 2:1 minimum as harvest-alert threshold (structural target not stored on trade)
          const target = t.entry_price + 2 * (t.entry_price - t.stop_price);
          return live >= target;
        })
        .map((t) => t.ticker);

        // Store for Sprint D refresh-loop alerts
        openTradesRef.current = openTrades;
        setOpenPositions({ count: openTrades.length, nearStop, aboveTarget });
      } catch { /* silent — morning brief is non-critical */ }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const openCalc = useCallback((entry?: number | null, stop?: number | null, ticker?: string, garchVol?: number | null) => {
    setCalc({ open: true, entry: entry ?? null, stop: stop ?? null, ticker, garchVol });
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

      // ── Alert 1: Watch → Trade crossing ──
      for (const signal of newData.signals) {
        const prev = prevScores.current.get(signal.ticker) ?? 0;
        const curr = signal.convictionScore;
        if (prev < TRADE_THRESHOLD && curr >= TRADE_THRESHOLD) {
          notify(
            `${signal.ticker} crossed Trade threshold`,
            `Conviction ${curr}/100 — ${signal.strategy.replace(/_/g, " ")} setup. Entry: $${signal.entryPrice?.toFixed(2) ?? "–"}`
          );
        }
      }
      prevScores.current = new Map(newData.signals.map((s) => [s.ticker, s.convictionScore]));
      setData(newData);

      // ── Alert 2 & 3: Stop proximity + Entry trigger (Sprint D) ──
      const openTrades = openTradesRef.current;
      if (openTrades.length === 0) return;

      const tradeTickers = [...new Set(openTrades.map((t) => t.ticker))].join(",");
      const priceRes = await fetch(`/api/current-prices?tickers=${tradeTickers}`);
      if (!priceRes.ok) return;
      const prices: Record<string, { price: number; prevClose: number; open: number } | null> = await priceRes.json();

      for (const trade of openTrades) {
        const live = prices[trade.ticker]?.price;
        if (!live) continue;

        // Alert 2: price within 5% of stop loss
        if (trade.stop_price && !alertedStopRef.current.has(trade.ticker)) {
          const bufferPct = ((live - trade.stop_price) / (trade.entry_price - trade.stop_price)) * 100;
          if (bufferPct < 5) {
            notify(
              `⚠ ${trade.ticker} approaching stop loss`,
              `Live $${live.toFixed(2)} — stop at $${trade.stop_price.toFixed(2)} (${bufferPct.toFixed(1)}% buffer). Review your position.`
            );
            alertedStopRef.current.add(trade.ticker);
          }
        }
        // Clear stop alert if price recovers above 8% buffer (reset so it can alert again if needed)
        if (trade.stop_price && alertedStopRef.current.has(trade.ticker)) {
          const bufferPct = ((live - trade.stop_price) / (trade.entry_price - trade.stop_price)) * 100;
          if (bufferPct >= 8) alertedStopRef.current.delete(trade.ticker);
        }
      }

      // Alert 3: entry trigger hit for Trade-tier signals (buy-stop triggered)
      for (const signal of newData.signals) {
        if (signal.convictionScore < TRADE_THRESHOLD || !signal.entryPrice) continue;
        const alertKey = `${signal.ticker}-${signal.entryPrice}`;
        if (alertedEntryRef.current.has(alertKey)) continue;
        const live = prices[signal.ticker]?.price;
        if (live && live >= signal.entryPrice) {
          notify(
            `🟢 ${signal.ticker} entry trigger hit`,
            `Live $${live.toFixed(2)} ≥ entry $${signal.entryPrice.toFixed(2)}. Buy stop order may have filled.`
          );
          alertedEntryRef.current.add(alertKey);
        }
      }
    } finally {
      setLoading(false);
      setCountdown(REFRESH_INTERVAL / 1000);
    }
    // Option 1: keep position ribbons in sync after every signal refresh
    loadPositions();
  }, [loadPositions]);

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

  // Refresh when app is foregrounded (tab visible or phone screen wake)
  // Debounced: skip if a refresh already ran within the last 30 seconds
  const lastRefreshAtRef = useRef(0);
  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden && Date.now() - lastRefreshAtRef.current > 30_000) {
        lastRefreshAtRef.current = Date.now();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  // Build Position — two sub-groups
  // Exclude BREAKOUT_WATCH — those always receive WATCH directive (no valid entry yet)
  const scaleInDirective = data.signals.filter((s) => s.nbaDirective === "SCALE_IN" && s.tier !== "BREAKOUT_WATCH");
  const highConvictionDeveloping = data.signals.filter((s) => s.tier === "HIGH_CONVICTION" && s.nbaDirective !== "SCALE_IN");
  const buildPosition = [...scaleInDirective, ...highConvictionDeveloping];
  // Trend Riding — EXIT-directive cards float to top
  const trendRiding = data.signals
    .filter((s) => s.nbaDirective === "HOLD_TRAIL")
    .sort((a, b) => (a.nbaDirective === "EXIT" ? -1 : b.nbaDirective === "EXIT" ? 1 : 0));
  // Overheated — Wait
  const watchExtended = data.signals.filter((s) => s.tier === "WATCH_EXTENDED");
  // Blue Sky — technically sound, R:R blocked by 52w high proximity in bull regime
  const breakoutWatch = data.signals.filter((s) => s.tier === "BREAKOUT_WATCH");
  // Not Yet — OBSERVE tier + WATCH + OBSERVE_WARN directives; EXIT cards float to top
  // Exclude WATCH_EXTENDED and BREAKOUT_WATCH (shown in their own sections)
  const notYet = data.signals
    .filter((s) => s.tier !== "WATCH_EXTENDED" && s.tier !== "BREAKOUT_WATCH" && (s.tier === "OBSERVE" || s.nbaDirective === "WATCH" || s.nbaDirective === "OBSERVE_WARN"))
    .sort((a, b) => (a.nbaDirective === "EXIT" ? -1 : b.nbaDirective === "EXIT" ? 1 : 0));
  // EXIT-tier cards merge into notYet (no standalone Exit Now section)
  const exitCards = data.signals.filter((s) => s.tier === "EXIT");
  // Not Yet accordion split: defer until positions are loaded to avoid flicker
  // Before loadPositions resolves, show all cards visible (no accordion split yet)
  // Priority: 1) In Position, 2) High Conviction (>69, not in position), 3) Hidden (accordion)
  const notYetInPosition = !positionsLoaded
    ? notYet
    : notYet.filter((s) => positionData.has(s.ticker)).sort((a, b) => b.convictionScore - a.convictionScore);
  const notYetNotInPosition = !positionsLoaded
    ? []
    : notYet.filter((s) => !positionData.has(s.ticker));
  const notYetHighConviction = notYetNotInPosition
    .filter((s) => s.convictionScore > 68)
    .sort((a, b) => b.convictionScore - a.convictionScore);
  const notYetHidden = [
    ...notYetNotInPosition.filter((s) => s.convictionScore <= 68),
    ...exitCards,
  ].sort((a, b) => b.convictionScore - a.convictionScore || b.changePct - a.changePct);
  // Pill counts
  const scaleInCount = scaleInDirective.length;
  const holdTrailCount = trendRiding.length;

  useEffect(() => {
    setUpdatedTime(new Date(data.updatedAt).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    }));
  }, [data.updatedAt]);

  const sectionHead = (color: string) => ({
    color,
    fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)",
  });

  return (
    <div className="space-y-6">
      <MarketBanner condition={data.marketCondition} />

      {/* Breadth kill switch — shown when pulse detects broad pre-market distribution */}
      {data.breadthFlag === "distribution" && (
        <div
          className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "rgba(255, 179, 60, 0.10)", border: "1px solid rgba(255, 179, 60, 0.25)" }}
        >
          <span className="text-base shrink-0 mt-0.5">⚠️</span>
          <div>
            <span
              className="font-semibold text-sm tracking-wide"
              style={{ color: "#c8a84b" }}
            >
              BROAD MARKET SELLING
            </span>
            <span className="text-sm ml-2" style={{ color: "var(--on-surface-variant)" }}>
              {Math.round((1 - (data.breadthScore ?? 0.5)) * 100)}% of S&P 500 gapping down pre-market.
              Signals are active — consider reducing position size until breadth improves.
            </span>
          </div>
        </div>
      )}

      {/* Stats pills + session */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Stocks Scored pill with tap tooltip */}
        <span className="relative">
          <button
            type="button"
            onClick={() => setShowScoredTooltip((v) => !v)}
            className="text-[11px] px-2.5 py-1 rounded-full"
            style={{ backgroundColor: "var(--surface-container-high)", color: "var(--on-surface-variant)" }}
          >
            {data.signals.length} Stocks Scored
          </button>
          {showScoredTooltip && (
            <div className="absolute left-0 top-7 z-10 rounded-lg px-3 py-2 text-[11px] leading-relaxed w-56 shadow-lg"
              style={{ backgroundColor: "var(--surface-container-high)", color: "var(--on-surface-variant)", border: "1px solid rgba(255,255,255,0.08)" }}>
              Total S&amp;P 500 stocks analyzed by the ML scorer today.
            </div>
          )}
        </span>
        {/* Scale In pill — scrolls to section */}
        <button
          type="button"
          onClick={() => document.getElementById("section-scale-in")?.scrollIntoView({ behavior: "smooth" })}
          className="text-[11px] px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "var(--surface-container-high)", color: "#43ed9e" }}
        >
          {scaleInCount} Build Position
        </button>
        {/* Hold/Trail pill — scrolls to section */}
        <button
          type="button"
          onClick={() => document.getElementById("section-hold-trail")?.scrollIntoView({ behavior: "smooth" })}
          className="text-[11px] px-2.5 py-1 rounded-full"
          style={{ backgroundColor: "var(--surface-container-high)", color: "#adc6ff" }}
        >
          {holdTrailCount} Trend Riding
        </button>
        <span
          className="text-[11px] px-2.5 py-1 rounded-full"
          style={{
            backgroundColor: "var(--surface-container-high)",
            color: data.marketCondition === "bull" ? "#43ed9e" : data.marketCondition === "bear" ? "#ffb3ae" : "var(--on-surface-variant)",
          }}
        >
          {data.marketCondition === "bull" ? "Bull Market" : data.marketCondition === "bear" ? "Bear Market" : "Neutral"}
        </span>
        <MarketSessionPill />
      </div>

      {/* Sector pulse banner — shows hot/cold sectors from pre-market data */}
      {data.sectorPulse && data.sectorPulse.length > 0 && (
        <SectorPulseBanner sectors={data.sectorPulse} />
      )}

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
          {openPositions.aboveTarget.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold text-[#c084fc]">
              🎯 Above target: {openPositions.aboveTarget.join(", ")} — consider harvesting gains
            </span>
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

      {/* Build Position — two sub-groups: ML Confirmed (SCALE_IN directive) + Developing (HIGH_CONVICTION tier) */}
      {buildPosition.length > 0 && (
        <section id="section-scale-in">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#43ed9e")}>
            BUILD POSITION ({buildPosition.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Conditions are strengthening. Ready to enter or add to your position.
          </p>
          {scaleInDirective.length > 0 && (
            <div>
              <p className="text-[10px] mb-2 uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>ML Confirmed · Day 3+</p>
              <div className="space-y-3">
                {scaleInDirective.map((s) => (
                  <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
                ))}
              </div>
            </div>
          )}
          {highConvictionDeveloping.length > 0 && (
            <div className={scaleInDirective.length > 0 ? "mt-4" : ""}>
              <p className="text-[10px] mb-2 uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>Developing</p>
              <div className="space-y-3">
                {highConvictionDeveloping.map((s) => (
                  <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* Trend Riding — HOLD_TRAIL directive; EXIT-directive cards float to top */}
      {trendRiding.length > 0 && (
        <section id="section-hold-trail">
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#adc6ff")}>
            TREND RIDING ({trendRiding.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            The trend is healthy. Stay invested and let winners run.
          </p>
          <div className="space-y-3">
            {trendRiding.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
          </div>
        </section>
      )}

      {/* Blue Sky — technically sound, R:R blocked by 52w high proximity in bull regime */}
      {breakoutWatch.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#c084fc")}>
            BLUE SKY WATCH ({breakoutWatch.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Setup confirmed — waiting for a close above the 52-week high on elevated volume.
          </p>
          <div className="space-y-3">
            {breakoutWatch.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} />
            ))}
          </div>
        </section>
      )}

      {/* Overheated — Wait (RSI overheated, BB extended, or death cross) */}
      {watchExtended.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#ffb33c")}>
            OVERHEATED — WAIT ({watchExtended.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Wait for better conditions. Avoid buying in this range.
          </p>
          <div className="space-y-3">
            {watchExtended.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} />
            ))}
          </div>
        </section>
      )}

      {/* Not Yet — OBSERVE tier + WATCH/OBSERVE_WARN directives + EXIT-tier cards; EXIT float to top */}
      {(notYet.length > 0 || exitCards.length > 0) && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#ffb3ae")}>
            NOT YET ({notYet.length + exitCards.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Looking for an entry point. Stay patient while we wait for a signal.
          </p>
          <div className="space-y-3">
            {/* In-position tickers always visible — user has an open trade here */}
            {notYetInPosition.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={true} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
            {/* High conviction (>69) not in position — always visible, sorted by conviction descending */}
            {notYetHighConviction.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={false} openTradeCount={0} openTradeId={undefined} onTradeLogged={loadPositions} />
            ))}
            {/* Remaining Not Yet + EXIT-tier — collapsed by default, mounted only when open */}
            {notYetHidden.length > 0 && (
              <>
                <button
                  onClick={() => setNotYetOpen((v) => !v)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-gray-800 text-gray-400 text-xs hover:border-gray-600 hover:text-gray-300 transition-colors"
                >
                  <span>{notYetOpen ? "Hide" : `${notYetHidden.length} more — tap to expand`}</span>
                  {notYetOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {notYetOpen && notYetHidden.map((s) => (
                  <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
                ))}
              </>
            )}
          </div>
        </section>
      )}

      {data.signals.length === 0 && (
        <div className="text-center py-20" style={{ color: "var(--on-surface-variant)" }}>
          No signals loaded. Check your watchlist or try refreshing.
        </div>
      )}

      {/* ML Track Record — shows realized returns from past discoveries */}
      {(data.mlPerformance?.length ?? 0) > 0 && (
        <MlTrackRecord performance={data.mlPerformance ?? []} />
      )}

      {/* ML Discoveries — top S&P 500 picks not on watchlist */}
      {(data.mlDiscoveries?.length ?? 0) > 0 && (
        <MlDiscoveries
          discoveries={data.mlDiscoveries ?? []}
          onAddToWatchlist={async (ticker) => {
            await fetch("/api/watchlist", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ticker, strategy: "momentum" }),
            });
            refresh();
          }}
        />
      )}

      {/* Volume anomaly alerts — unusual pre-market activity (pm_vol_ratio > 5×) */}
      {(data.volumeAnomalies?.length ?? 0) > 0 && (
        <div className="rounded-xl overflow-hidden border border-white/10 bg-[rgba(53,53,52,0.6)]">
          <div className="px-5 py-3 flex items-center gap-3 border-b border-white/10">
            <span className="text-[10px] uppercase tracking-widest text-[#c8a84b] font-bold">
              ⚡ Unusual Pre-Market Activity
            </span>
            <span className="text-[10px] text-[#555]">
              {data.volumeAnomalies!.length} tickers with 5× normal volume — investigate before acting
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {data.volumeAnomalies!.map((a) => (
              <div key={a.ticker} className="px-5 py-2.5 flex items-center gap-4">
                <span className="font-bold text-[#e5e2e1] text-sm w-16 shrink-0">{a.ticker}</span>
                <span className="text-[11px] text-[#c8a84b] font-mono font-bold">
                  {a.pmVolRatioLive?.toFixed(1)}× vol
                </span>
                {a.gapPctLive != null && (
                  <span className={`text-[11px] font-mono ${a.gapPctLive > 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}`}>
                    {a.gapPctLive > 0 ? "+" : ""}{(a.gapPctLive * 100).toFixed(2)}%
                  </span>
                )}
                <span className="text-[10px] text-[#555] ml-auto">ML {a.mlScore}%</span>
                <button
                  className="text-[10px] px-2 py-1 rounded border border-[#adc6ff]/20 text-[#adc6ff] hover:bg-[#adc6ff]/10 transition-colors shrink-0"
                  onClick={() => fetch("/api/watchlist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ticker: a.ticker, strategy: "momentum" }),
                  }).then(() => refresh())}
                >
                  + Watch
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Floating calculator modal */}
      {calc.open && (
        <CalculatorModal
          entry={calc.entry}
          stop={calc.stop}
          ticker={calc.ticker}
          garchVol={calc.garchVol}
          onClose={closeCalc}
        />
      )}
    </div>
  );
}
