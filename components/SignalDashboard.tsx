"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import MarketBanner from "./MarketBanner";
import MarketSessionPill from "./MarketSessionPill";
import SignalCard from "./SignalCard";
import CalculatorModal from "./CalculatorModal";
import MlDiscoveries from "./MlDiscoveries";
import MlTrackRecord from "./MlTrackRecord";
import SectorPulseBanner, { SectorPulseData } from "./SectorPulseBanner";
import { RefreshCw, BookOpen } from "lucide-react";
import { MlScore, MlPerformanceRow } from "@/lib/supabase";

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TRADE_THRESHOLD = 82;  // legacy: still used for cross-threshold notifications

type SignalTier = "HIGH_CONVICTION" | "TACTICAL_BUY" | "WATCH_EXTENDED" | "OBSERVE" | "EXIT";

interface HardGates {
  rsiOverheated: boolean;
  bbExtended: boolean;
  targetBlocked: boolean;
  sectorWeak: boolean;
  volPriceUnconfirmed: boolean;
}

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
  nearStop: string[];   // tickers near their stop
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
  // ticker → { ids: trade IDs[], count }
  const [positionData, setPositionData] = useState<Map<string, { ids: string[]; count: number }>>(new Map());


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

      if (openTrades.length === 0) { setOpenPositions({ count: 0, nearStop: [] }); return; }

      const tickers = [...new Set(openTrades.map((t) => t.ticker))].join(",");
      const priceRes = await fetch(`/api/current-prices?tickers=${tickers}`);
      if (!priceRes.ok) { setOpenPositions({ count: openTrades.length, nearStop: [] }); return; }
      const prices: Record<string, { price: number; prevClose: number; open: number } | null> = await priceRes.json();

      const nearStop = openTrades
        .filter((t) => {
          const live = prices[t.ticker]?.price;
          if (!live || !t.stop_price) return false;
          const riskDist = t.entry_price - t.stop_price;
          return riskDist > 0 && ((live - t.stop_price) / riskDist) * 100 < 5;
        })
        .map((t) => t.ticker);

        // Store for Sprint D refresh-loop alerts
        openTradesRef.current = openTrades;
        setOpenPositions({ count: openTrades.length, nearStop });
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

  const highConviction = data.signals.filter((s) => s.tier === "HIGH_CONVICTION");
  const tacticalBuy = data.signals.filter((s) => s.tier === "TACTICAL_BUY");
  const watchExtended = data.signals.filter((s) => s.tier === "WATCH_EXTENDED");
  const observe = data.signals.filter((s) => s.tier === "OBSERVE");
  const exitTier = data.signals.filter((s) => s.tier === "EXIT");
  // Aliases for legacy stats-pill labels
  const trade = highConviction;
  const watch = tacticalBuy;

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

      {/* High Conviction (>82, all hard gates pass) */}
      {highConviction.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#43ed9e")}>
            HIGH CONVICTION ({highConviction.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            All quality gates passed — clear to enter
          </p>
          <div className="space-y-3">
            {highConviction.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
          </div>
        </section>
      )}

      {/* Tactical Buy (70–81, or >82 with one failed gate) */}
      {tacticalBuy.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#adc6ff")}>
            TACTICAL BUY ({tacticalBuy.length})
          </h2>
          <p className="text-[10px] mb-1" style={{ color: "var(--on-surface-variant)" }}>
            Strong setup with minor friction — standard position
          </p>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Browser notification fires automatically when any of these qualify as High Conviction.
          </p>
          <div className="space-y-3">
            {tacticalBuy.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
          </div>
        </section>
      )}

      {/* Watch Extended — RSI overheated or BB extended */}
      {watchExtended.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#ffb33c")}>
            WATCH — EXTENDED ({watchExtended.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Overheated entry — wait for pullback to 8-EMA
          </p>
          <div className="space-y-3">
            {watchExtended.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} />
            ))}
          </div>
        </section>
      )}

      {/* Observe */}
      {observe.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#c8a84b")}>
            OBSERVE ({observe.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Weakening thesis — hold, do not add
          </p>
          <div className="space-y-3">
            {observe.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
          </div>
        </section>
      )}

      {/* Exit — failed thesis */}
      {exitTier.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-widest mb-1" style={sectionHead("#ffb3ae")}>
            EXIT SIGNAL ({exitTier.length})
          </h2>
          <p className="text-[10px] mb-3" style={{ color: "var(--on-surface-variant)" }}>
            Thesis failed — reduce or close position
          </p>
          <div className="space-y-3">
            {exitTier.map((s) => (
              <SignalCard key={s.ticker} {...s} {...s.indicators} sa={s.sa} onOpenCalc={openCalc} mlScore={s.mlScore} mlRank={s.mlRank} garchVol={s.garchVol} gapPctLive={s.gapPctLive} pmVolRatioLive={s.pmVolRatioLive} open930Live={s.open930Live} convictionTrend={s.convictionTrend} convictionStreak={s.convictionStreak} inPosition={positionData.has(s.ticker)} openTradeCount={positionData.get(s.ticker)?.count ?? 0} openTradeId={positionData.get(s.ticker)?.count === 1 ? positionData.get(s.ticker)?.ids[0] : undefined} onTradeLogged={loadPositions} />
            ))}
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
