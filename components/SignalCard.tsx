"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, BookOpen, Check, AlertCircle } from "lucide-react";
import SAModal from "./SAModal";
import StockChart from "./StockChart";
import FAQModal from "./FAQModal";
import type { HardGates, NbaDirective, SignalTier } from "@/lib/signals";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

interface SAInfo {
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
}

interface ValidationResult {
  passed: boolean;
  conflictPenalty: number;
  dataQualityPts: number;
  notes: string[];
  checked_at: string;
}


interface SignalCardProps {
  ticker: string;
  strength: string;
  price: number;
  changePct: number;
  convictionScore: number;
  convictionBand: "high" | "medium" | "low";
  sectorRs: number | null;
  validation: ValidationResult;
  volumeRatio: number;
  rsi14: number;
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  atr14: number;
  macdSignal: number;
  macdHist: number;
  bbPct: number;
  entryNote: string;
  stopNote: string;
  entryPrice: number;
  stopPrice: number;
  strategy: string;
  conditions?: { label: string; met: boolean }[];
  sa?: SAInfo;
  onOpenCalc?: (entry: number | null, stop: number | null, ticker?: string, garchVol?: number | null) => void;
  mlScore?: number | null;
  mlRank?: number | null;
  garchVol?: number | null;
  gapPctLive?: number | null;
  pmVolRatioLive?: number | null;
  open930Live?: number | null;
  prevClose?: number | null;
  open?: number | null;
  convictionTrend?: "rising" | "stable" | "falling" | null;
  convictionStreak?: number | null;
  // Phase 1 / Phase 2: tier + hard gates
  tier?: SignalTier;
  hardGates?: HardGates;
  volPriceConfirmed?: boolean;
  sectorEtfAboveMA20?: boolean;
  rsiAtEntry?: number;
  rsVsSpyNegativeStreak?: number;
  ema8?: number;
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
  // Phase 3: position tracking
  inPosition?: boolean;
  openTradeCount?: number;
  openTradeId?: string;        // populated only when openTradeCount === 1
  onTradeLogged?: () => void;
}

// Metric tile — hover on desktop, tap on mobile. Only one tooltip open at a time.
function MetricTile({
  label, tip, children, activeTip, setActiveTip,
}: {
  label: string; tip: string; children: React.ReactNode;
  activeTip: string | null; setActiveTip: (l: string | null) => void;
}) {
  const pinned = activeTip === label;
  return (
    <div
      className="relative rounded-lg p-2.5 text-center bg-[#252b31] cursor-pointer select-none"
      onClick={(e) => { e.stopPropagation(); setActiveTip(pinned ? null : label); }}
    >
      <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-1 flex items-center justify-center gap-0.5">
        {label}
        <span className={`text-[9px] leading-none transition-colors ${pinned ? "text-[#43ed9e]/80" : "text-[#bacbbd]/30"}`}>ⓘ</span>
      </p>
      {children}
      {/* Tooltip — visible on hover (desktop) or pinned (tap) */}
      <span
        className={`pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 rounded-xl bg-[#0e141a] border border-[#3c4a40]/40 px-3 py-3 text-[11px] text-[#dde3ec] leading-relaxed transition-opacity duration-150 z-50 text-left shadow-2xl whitespace-normal ${
          pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}
      >
        {tip}
      </span>
    </div>
  );
}

// Signal badge config matching Stitch design
function signalBadge(strength: string) {
  if (strength === "strong")
    return { label: "Strong Buy", cls: "bg-[#43ed9e]/15 text-[#43ed9e] border border-[#43ed9e]/20" };
  if (strength === "moderate")
    return { label: "Buy", cls: "bg-[#00d084]/15 text-[#00d084] border border-[#00d084]/20" };
  if (strength === "weak")
    return { label: "Watch", cls: "bg-[#bacbbd]/10 text-[#bacbbd] border border-[#bacbbd]/15" };
  return { label: "Neutral", cls: "bg-[#252b31] text-[#bacbbd] border border-[#3c4a40]/30" };
}

// Tier color for ticker symbol and avatar tint
function tierColor(tier?: SignalTier): string {
  switch (tier) {
    case "HIGH_CONVICTION":  return "#43ed9e";
    case "TACTICAL_BUY":    return "#adc6ff";
    case "WATCH_EXTENDED":  return "#ffb33c";
    case "BREAKOUT_WATCH":  return "#c084fc";
    case "OBSERVE":         return "#ffb3ae";
    case "EXIT":            return "#ffb3ae";
    default:                return "#dde3ec";
  }
}

// Tier-aware badge (Phase 2) — kept for legacy fallback only
function tierBadge(tier?: SignalTier) {
  switch (tier) {
    case "HIGH_CONVICTION":
      return { label: "HIGH CONVICTION", cls: "bg-[#43ed9e]/15 text-[#43ed9e] border border-[#43ed9e]/30" };
    case "TACTICAL_BUY":
      return { label: "TACTICAL BUY", cls: "bg-[#adc6ff]/15 text-[#adc6ff] border border-[#adc6ff]/30" };
    case "WATCH_EXTENDED":
      return { label: "EXTENDED", cls: "bg-[#ffb33c]/15 text-[#ffb33c] border border-[#ffb33c]/30" };
    case "BREAKOUT_WATCH":
      return { label: "BLUE SKY", cls: "bg-[#c084fc]/15 text-[#c084fc] border border-[#c084fc]/30" };
    case "OBSERVE":
      return { label: "OBSERVE", cls: "bg-[#c8a84b]/15 text-[#c8a84b] border border-[#c8a84b]/30" };
    case "EXIT":
      return { label: "EXIT", cls: "bg-[#ffb3ae]/15 text-[#ffb3ae] border border-[#ffb3ae]/30" };
    default:
      return null;
  }
}

const GATE_LABELS: Record<string, string> = {
  rsiOverheated: "RSI overheated (>78, momentum fading)",
  bbExtended: "BB extended (>90%)",
  rrBelowMinimum: "R:R below 2.0:1 minimum",
  sectorWeak: "Sector below MA20",
  volPriceUnconfirmed: "No vol-price confirmation",
  deathCross: "Death cross (MA20 < MA50)",
  belowMA50: "Price below MA50",
};

function nbaBadge(directive?: NbaDirective) {
  switch (directive) {
    case "SCALE_IN":
      return { label: "SCALE IN", cls: "bg-[#43ed9e]/15 text-[#43ed9e] border border-[#43ed9e]/30" };
    case "WATCH":
      return { label: "WATCH", cls: "bg-[#00e7f6]/10 text-[#00e7f6] border border-[#00e7f6]/20" };
    case "OBSERVE_WARN":
      return { label: "OBSERVE ⚠", cls: "bg-[#ffb33c]/10 text-[#ffb33c] border border-[#ffb33c]/25" };
    case "HOLD_TRAIL":
      return { label: "HOLD / TRAIL", cls: "bg-[#5eead4]/10 text-[#5eead4] border border-[#5eead4]/20" };
    case "HARVEST":
      return { label: "HARVEST", cls: "bg-[#ffd700]/10 text-[#ffd700] border border-[#ffd700]/25" };
    case "EXIT":
      return { label: "EXIT", cls: "bg-[#ffb3ae]/15 text-[#ffb3ae] border border-[#ffb3ae]/30" };
    default:
      return null;
  }
}

function mlDeltaArrow(mlDelta24h?: number | null): string | null {
  if (mlDelta24h === null || mlDelta24h === undefined) return null;
  if (mlDelta24h >= 10) return "↑↑";
  if (mlDelta24h >= 3) return "↑";
  if (mlDelta24h <= -10) return "↓↓";
  if (mlDelta24h <= -3) return "↓";
  return "→";
}


export default function SignalCard({
  ticker, strength, price, changePct,
  convictionScore, convictionBand, sectorRs, validation,
  volumeRatio, rsi14, isAboveMa20, isAboveMa50,
  atr14, macdHist, bbPct,
  entryNote, stopNote, entryPrice, stopPrice,
  strategy, conditions, sa, onOpenCalc,
  mlScore, mlRank, garchVol,
  gapPctLive, pmVolRatioLive, open930Live,
  convictionTrend, convictionStreak,
  prevClose, open,
  tier, hardGates, ema8,
  streakDays, mlDelta24h, streakDirection,
  nbaDirective, nbaDirectiveReason,
  structuralTarget, rrAchievable, trailMode, regime,
  inPosition, openTradeCount = 0, openTradeId, onTradeLogged,
}: SignalCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqMode, setFaqMode] = useState<"conviction" | "ml" | "trend">("conviction");
  const [showChart, setShowChart] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [activeTip, setActiveTip] = useState<string | null>(null);

  // Phase 3: close-position state (for Mark Closed button)
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeError, setCloseError] = useState("");

  // Phase 3: account-size + risk % coaching
  const ACCOUNT_SIZE_KEY = "swingai_account_size";
  const RISK_PCT_KEY = "swingai_risk_pct";
  const DEFAULT_ACCOUNT_SIZE = 10000;
  const DEFAULT_RISK_PCT = 2;
  const [accountSize, setAccountSize] = useState(DEFAULT_ACCOUNT_SIZE);
  const [riskPct, setRiskPct] = useState(DEFAULT_RISK_PCT);

  // Load account size + risk % from localStorage on mount
  useEffect(() => {
    const storedSize = localStorage.getItem(ACCOUNT_SIZE_KEY);
    if (storedSize) {
      const n = parseInt(storedSize, 10);
      if (n >= 50 && n <= 500000) setAccountSize(n);
    }
    const storedRisk = localStorage.getItem(RISK_PCT_KEY);
    if (storedRisk) {
      const r = parseFloat(storedRisk);
      if (r >= 0.5 && r <= 5) setRiskPct(r);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Compute recommended shares: GARCH if available, else risk-rule; TB gets 50% haircut
  const riskBudget = accountSize * (riskPct / 100);
  const isTactical = tier === "TACTICAL_BUY";
  const recommendedShares = (() => {
    let shares: number;
    const risk = entryPrice > 0 && stopPrice > 0 ? Math.abs(entryPrice - stopPrice) : null;
    if (garchVol && garchVol > 0 && entryPrice > 0) {
      shares = riskBudget / (entryPrice * (garchVol / 100) * 2);
    } else if (risk && risk > 0) {
      shares = riskBudget / risk;
    } else {
      return null;
    }
    if (isTactical) shares = shares * 0.5;
    return Math.max(1, Math.floor(shares));
  })();

  // Sprint C: One-click trade log
  const [logOpen, setLogOpen] = useState(false);
  const [logShares, setLogShares] = useState("");
  const [logDate, setLogDate] = useState(todayStr());
  const [logLoading, setLogLoading] = useState(false);
  const [logSuccess, setLogSuccess] = useState(false);
  const [logError, setLogError] = useState("");

  const isAI = convictionScore >= 90 && validation.passed;
  const changePositive = changePct >= 0;
  const changeColor = changePositive ? "text-[#43ed9e]" : "text-[#ffb3ae]";
  const changeSign = changePositive ? "+" : "";

  const risk = entryPrice > 0 && stopPrice > 0 ? Math.abs(entryPrice - stopPrice) : null;
  // Use structural target from backend (52w high or trail stop); fall back to 3:1 for legacy data
  const targetPrice = structuralTarget ?? (entryPrice && risk ? entryPrice + 3 * risk : null);

  // UX-01: Conviction breakdown components (mirrors computeConviction in signals.ts)
  const riskPctConv = entryPrice > 0 && stopPrice > 0 && entryPrice > stopPrice ? (entryPrice - stopPrice) / entryPrice : 0.20;
  const rrPts = riskPctConv > 0 && riskPctConv <= 0.03 ? 30 : riskPctConv <= 0.05 ? 26 : riskPctConv <= 0.08 ? 20 : riskPctConv <= 0.12 ? 12 : riskPctConv <= 0.20 ? 5 : 0;
  const sectorPts = sectorRs === null ? 7 : sectorRs > 3 ? 15 : sectorRs > 1 ? 12 : sectorRs > 0 ? 9 : sectorRs > -2 ? 5 : 0;
  const qualityPts = Math.max(0, validation.dataQualityPts + validation.conflictPenalty);
  const techPts = Math.max(0, Math.min(40, convictionScore - rrPts - sectorPts - qualityPts));
  const displayRR = rrAchievable ?? (risk && entryPrice && targetPrice ? (targetPrice - entryPrice) / risk : null);
  const earningsWarning = sa?.earningsDays !== null && sa?.earningsDays !== undefined && sa.earningsDays <= 14;

  // Frontend guard: treat near-zero as absent (sentinel written by pulse_premarket when pm_volume == 0)
  const effectiveGap = gapPctLive != null && Math.abs(gapPctLive) > 0.001 ? gapPctLive : null;
  const effectivePmVol = pmVolRatioLive != null && pmVolRatioLive > 0.01 ? pmVolRatioLive : null;

  // NBA second footer — pre-market edge surfaced always-visible per tier × signal matrix
  const pmNbaFooter = (() => {
    const hasGapDown = effectiveGap !== null && effectiveGap < -1;
    const hasGapUp = effectiveGap !== null && effectiveGap > 1;
    const strongGapUp = effectiveGap !== null && effectiveGap > 3;
    const pmHigh = effectivePmVol !== null && effectivePmVol > 5;
    const pmMed = effectivePmVol !== null && effectivePmVol >= 2 && effectivePmVol <= 5;
    const pmLow = effectivePmVol !== null && effectivePmVol >= 1 && effectivePmVol < 2;
    const gapStr = effectiveGap != null ? `${effectiveGap > 0 ? "+" : ""}${effectiveGap.toFixed(1)}%` : null;
    const volStr = effectivePmVol != null ? `${effectivePmVol.toFixed(1)}×` : null;
    const ema8Str = ema8 && ema8 > 0 ? `$${ema8.toFixed(2)}` : "the 8-day average";

    // Gap-down warning — always shown regardless of tier
    if (hasGapDown) return `Gap-down ${gapStr} — wait for price to stabilize before entering`;

    if (tier === "HIGH_CONVICTION" || tier === "TACTICAL_BUY") {
      if (pmHigh) return `Pre-market: ${volStr} volume — wait for 9:45 AM candle, enter only if price holds`;
      if (pmMed && hasGapUp) return `Pre-market confirms: ${volStr} vol + ${gapStr} gap-up — execute full position`;
      if (pmMed) return `Pre-market confirms: ${volStr} volume — execute full position`;
      if (pmLow) return `Above-avg pre-market interest — start half position, add if volume builds`;
      if (strongGapUp) return `Strong ${gapStr} gap-up — wait for 9:45 AM candle, enter if price holds`;
      if (hasGapUp) return `${gapStr} gap-up adds direction — confirms setup`;
    }
    if (tier === "WATCH_EXTENDED") {
      if ((effectivePmVol !== null && effectivePmVol > 2) || (effectiveGap !== null && effectiveGap > 2))
        return `Pre-market volume on an overheated stock — gap-and-fade risk. Stick to plan: wait for pullback to ${ema8Str}`;
    }
    if (tier === "OBSERVE" || nbaDirective === "WATCH" || nbaDirective === "OBSERVE_WARN") {
      if (pmHigh) return `Unusual pre-market activity — monitor today's open for a setup trigger`;
      if (pmMed) return `Pre-market interest building — watch for breakout confirmation today`;
      if (effectiveGap !== null && effectiveGap > 2) return `Gap-up today — check if setup conditions improve at the open`;
    }
    if (tier === "BREAKOUT_WATCH") {
      if (effectivePmVol !== null && effectivePmVol > 2)
        return `Pre-market volume building — watch today's open for a blue sky breakout trigger`;
    }
    return null;
  })();

  const legacyBadge = signalBadge(strength);
  const tBadge = tierBadge(tier);
  const badge = tBadge ?? legacyBadge;
  const tColor = tierColor(tier);
  const nBadge = nbaBadge(nbaDirective);
  const deltaArrow = mlDeltaArrow(mlDelta24h);

  // Gates that fired (true = blocked High Conviction)
  const firedGates: (keyof HardGates)[] = hardGates
    ? (Object.keys(hardGates) as (keyof HardGates)[]).filter((k) => hardGates[k])
    : [];

  // Tactical Buy: pick the most important fired gate (priority order)
  const tacticalGatePriority: (keyof HardGates)[] = [
    "rrBelowMinimum",
    "volPriceUnconfirmed",
    "sectorWeak",
    "rsiOverheated",
    "bbExtended",
  ];
  const leadGate = tacticalGatePriority.find((g) => firedGates.includes(g));

  const tacticalGateFooter = (g?: keyof HardGates): string | null => {
    switch (g) {
      case "rrBelowMinimum":
        return "the 52-week high is too close to the entry to give a 2:1 reward-to-risk ratio. wait for a deeper pullback or a confirmed breakout above the 52-week high before entering.";
      case "deathCross":
        return "the 20-day moving average has crossed below the 50-day — a confirmed downtrend. this stock needs time to recover. wait for the MA20 to cross back above the MA50 before considering entry.";
      case "volPriceUnconfirmed":
        return "volume didn't confirm the price move today. wait for a session where both volume and price range expand together before entering.";
      case "sectorWeak":
        return "the sector this stock trades in is in a downtrend. strong stocks can still work, but you're swimming against the current — keep your position smaller than usual.";
      case "rsiOverheated":
        return "the stock is overbought right now. wait for RSI to cool below 75 before entering.";
      case "bbExtended":
        return "price is stretched near the top of its bollinger band. better entry likely in the next few days after it settles.";
      default:
        return null;
    }
  };

  // Footer guidance per tier — OBSERVE gets no footer
  const footerText = (() => {
    switch (tier) {
      case "HIGH_CONVICTION":
        return "Enter full position — all quality checks passed.";
      case "TACTICAL_BUY":
        return tacticalGateFooter(leadGate);
      case "WATCH_EXTENDED":
        return ema8 && ema8 > 0
          ? `don't buy yet — this stock has moved too far, too fast. wait for it to pull back to the 8-day average (~$${ema8.toFixed(2)}).`
          : "don't buy yet — this stock has moved too far, too fast. wait for it to pull back to the 8-day average.";
      case "EXIT":
        return "Close or reduce your position. This setup has broken down.";
      case "BREAKOUT_WATCH":
        return "Technically sound — watch for a confirmed close above the 52-week high on elevated volume. That triggers the blue sky breakout.";
      case "OBSERVE":
      default:
        return null;
    }
  })();

  const footerColor = "text-[#8a9ba8]";

  // Ticker avatar colors — cycles through tertiary/primary/secondary per strength
  const avatarColor =
    strength === "strong" ? "text-[#43ed9e]"
    : strength === "moderate" ? "text-[#00e7f6]"
    : "text-[#bacbbd]";

  const sentimentBorder: Record<string, string> = {
    positive: "border-l-2 border-[#43ed9e] bg-[#43ed9e]/5",
    negative: "border-l-2 border-[#ffb3ae] bg-[#ffb3ae]/5",
    neutral:  "border-l-2 border-[#bacbbd]/20 bg-[#bacbbd]/5",
  };

  return (
    <>
      <div
        className={`rounded-xl overflow-hidden transition-all duration-200 ${
          isAI
            ? "glass ai-glow glow-top"
            : "bg-[#161c22] hover:bg-[#1a2027]"
        }`}
      >
        {/* ── In Position ribbon ── */}
        {inPosition && (
          <div
            className="px-5 py-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold"
            style={{ backgroundColor: `${tColor}18`, borderBottom: `1px solid ${tColor}30`, color: tColor }}
          >
            <a
              href={`/journal?ticker=${ticker}`}
              className="flex items-center gap-1.5 hover:brightness-125 transition-all underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <Check size={11} />
              {openTradeCount > 1 ? `${openTradeCount} open positions — view in journal →` : "In Position — view in journal →"}
            </a>

            {/* Option 2: Exit/Observe tier action — close or navigate */}
            {(tier === "EXIT" || tier === "OBSERVE") && (
              openTradeCount === 1 && openTradeId ? (
                <div className="flex items-center gap-2">
                  {closeError && <span className="text-[9px] text-[#ffb3ae]">{closeError}</span>}
                  <button
                    disabled={closeLoading}
                    className="text-[10px] px-2 py-0.5 rounded border font-semibold hover:brightness-125 transition-all disabled:opacity-50"
                    style={{ borderColor: "rgba(255,179,174,0.4)", color: "#ffb3ae", backgroundColor: "rgba(255,179,174,0.08)" }}
                    onClick={async (e) => {
                      e.stopPropagation();
                      setCloseLoading(true);
                      setCloseError("");
                      try {
                        const res = await fetch(`/api/trades/${openTradeId}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            exit_date: new Date().toISOString().split("T")[0],
                            exit_price: price,
                          }),
                        });
                        if (res.ok) {
                          onTradeLogged?.();
                        } else {
                          setCloseError("Failed to close.");
                        }
                      } finally {
                        setCloseLoading(false);
                      }
                    }}
                  >
                    {closeLoading ? "..." : "Mark Closed"}
                  </button>
                </div>
              ) : openTradeCount > 1 ? (
                <a
                  href={`/journal?ticker=${ticker}`}
                  className="text-[10px] underline-offset-2 hover:underline"
                  style={{ color: "#adc6ff" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View in Journal →
                </a>
              ) : null
            )}
          </div>
        )}

        {/* ── Action Required banner (EXIT + held position) ── */}
        {inPosition && tier === "EXIT" && (
          <div
            className="px-5 py-2 flex items-center gap-2 text-[11px] font-semibold"
            style={{ backgroundColor: "rgba(255, 179, 174, 0.12)", borderBottom: "1px solid rgba(255, 179, 174, 0.25)", color: "#ffb3ae" }}
          >
            <AlertCircle size={13} className="shrink-0" />
            Action Required — this setup has broken down. Close or reduce your position.
          </div>
        )}

        {/* ── Main row (always visible) ── */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#252b31]/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Ticker avatar — background tinted by tier */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: `${tColor}18` }}
          >
            <span className="font-bold text-[10px] tracking-wider" style={{ color: tColor }}>
              {ticker.slice(0, 4)}
            </span>
          </div>

          {/* Asset + strategy */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {/* Ticker symbol — white, tappable to open FAQ (mobile entry point) */}
              <button
                className="font-bold text-base font-['Space_Grotesk'] text-[#dde3ec] hover:brightness-125 transition-colors"
                onClick={(e) => { e.stopPropagation(); setFaqMode("conviction"); setFaqOpen(true); }}
              >
                {ticker}
              </button>
              {isAI && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded bg-[#00e7f6]/10 text-[#00e7f6] font-bold tracking-widest uppercase border border-[#00e7f6]/15 cursor-pointer hover:bg-[#00e7f6]/20 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setFaqMode("conviction"); setFaqOpen(true); }}
                >
                  Top Pick
                </span>
              )}
              {earningsWarning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-300 border border-orange-800/30">
                  ⚠ {sa!.earningsDays === 0 ? "Earnings today" : `Earnings ${sa!.earningsDays}d`}
                </span>
              )}
              {mlScore != null && (
                <span
                  suppressHydrationWarning
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold border cursor-pointer hover:brightness-125 transition-all ${
                    mlScore >= 70
                      ? "bg-purple-900/40 text-purple-300 border-purple-700/30"
                      : mlScore >= 50
                      ? "bg-purple-900/20 text-purple-400 border-purple-800/20"
                      : "bg-[#252b31] text-[#6b7280] border-[#3c4a40]/20"
                  }`}
                  onClick={(e) => { e.stopPropagation(); setFaqMode("ml"); setFaqOpen(true); }}
                >
                  ML {mlScore}%
                  {deltaArrow && (
                    <span className={`ml-1 ${
                      deltaArrow.startsWith("↑") ? "text-[#43ed9e]"
                      : deltaArrow.startsWith("↓") ? "text-[#ffb3ae]"
                      : "text-[#6b7280]"
                    }`}>{deltaArrow}</span>
                  )}
                  {mlRank != null && <span className="text-[#6b7280] ml-1">#{mlRank}</span>}
                </span>
              )}
              {/* NBA Directive badge — replaces old tier label as primary action signal */}
              {nBadge && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${nBadge.cls}`}
                  title={nbaDirectiveReason ?? undefined}
                >
                  {nBadge.label}
                </span>
              )}
              {/* Conviction trend chips — suppressed on EXIT (EXIT directive takes precedence) */}
              {nbaDirective !== "EXIT" && convictionTrend === "rising" && convictionStreak != null && convictionStreak <= 3 && (
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-[#45dfa4]/10 text-[#45dfa4] border-[#45dfa4]/20 hover:bg-[#45dfa4]/20 transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setFaqMode("trend"); setFaqOpen(true); }}
                >
                  ↑ Momentum Building
                </button>
              )}
              {nbaDirective !== "EXIT" && convictionTrend === "falling" && (
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-[#ffb3ae]/10 text-[#ffb3ae] border-[#ffb3ae]/20 hover:bg-[#ffb3ae]/20 transition-colors cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); setFaqMode("trend"); setFaqOpen(true); }}
                >
                  ↓ Thesis Weakening
                </button>
              )}
              {/* Conviction Streak — High Conviction held N consecutive days */}
              {tier === "HIGH_CONVICTION" && convictionStreak != null && convictionStreak >= 3 && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-bold border bg-[#43ed9e]/10 text-[#43ed9e] border-[#43ed9e]/30"
                  title={`Signal held High Conviction for ${convictionStreak} consecutive days — sustained institutional interest.`}
                >
                  Day {convictionStreak}
                </span>
              )}
              {/* Streak badge — conviction > 85 held N days */}
              {streakDays != null && streakDays >= 2 && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-bold border ${
                    streakDays >= 3
                      ? "bg-[#43ed9e]/10 text-[#43ed9e] border-[#43ed9e]/25"
                      : "bg-[#00e7f6]/8 text-[#00e7f6] border-[#00e7f6]/15"
                  }`}
                  title={`Conviction above 85 for ${streakDays} consecutive days`}
                >
                  {streakDays}d streak
                </span>
              )}
            </div>
          </div>


          {/* Entry price + live recalibration chip */}
          {entryPrice && (
            <div className="shrink-0 hidden md:block">
              <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-0.5">Entry</p>
              <p className="font-mono text-sm text-[#dde3ec]">${entryPrice.toFixed(2)}</p>
              {open930Live != null &&
                Math.abs(open930Live + 0.05 - entryPrice) / entryPrice > 0.005 && (
                <p className="text-[9px] text-[#adc6ff] mt-0.5">
                  Live ~${(open930Live + 0.05).toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Conviction bar */}
          <div
            className="w-16 shrink-0 hidden sm:block cursor-pointer"
            onClick={(e) => { e.stopPropagation(); setFaqMode("conviction"); setFaqOpen(true); }}
            title="How is this score calculated?"
          >
            <div className="w-full bg-[#252b31] h-1 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${convictionScore}%`,
                  backgroundColor:
                    convictionBand === "high" ? "#43ed9e"
                    : convictionBand === "medium" ? "#00d084"
                    : "#c8a84b",
                }}
              />
            </div>
            <p className="text-[10px] text-[#bacbbd] mt-1 text-right">{convictionScore}</p>
          </div>

          {/* Price + change */}
          <div className="text-right shrink-0">
            <p className="font-mono text-sm font-bold text-[#dde3ec]">${price.toFixed(2)}</p>
            <p className={`text-xs font-bold ${changeColor}`}>
              {changeSign}{changePct.toFixed(2)}%
            </p>
          </div>

          {/* Expand chevron */}
          <div className="text-[#bacbbd] shrink-0">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        </div>

        {/* ── Actionable footer (always visible) ── */}
        {footerText && (
          <div
            className={`px-5 py-2 text-[11px] font-medium border-t border-[#3c4a40]/20 ${footerColor}`}
            style={{ backgroundColor: "rgba(14, 20, 26, 0.4)" }}
          >
            {footerText}
          </div>
        )}

        {/* ── Pre-market NBA footer (always visible, amber) ── */}
        {pmNbaFooter && (
          <div
            className="px-5 py-2 text-[11px] font-medium border-t border-[#3c4a40]/15"
            style={{ backgroundColor: "rgba(255, 179, 60, 0.05)", color: "#ffb33c" }}
          >
            ◆ {pmNbaFooter}
          </div>
        )}

        {/* ── Expanded detail panel ── */}
        {expanded && (
          <div
            className="px-5 pb-4 border-t border-[#3c4a40]/20"
            onClick={() => setActiveTip(null)}
          >
            {/* UX-04: Signal staleness timestamp */}
            <p className="text-[9px] text-[#bacbbd]/35 text-right mt-2 mb-1">
              Signal {new Date(validation.checked_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
            </p>

            {/* Technical indicators */}
            <div className="grid grid-cols-3 gap-2 mt-4 mb-3">
              {[
                {
                  label: "RSI 14",
                  tip: "🌡️ Momentum meter. Under 40 = stock cooling off (possible bounce). 50–70 = healthy trend. Over 70 = might be overheating soon.",
                  value: rsi14.toFixed(0),
                  color: rsi14 >= 50 && rsi14 <= 75 ? "text-[#43ed9e]" : "text-yellow-400",
                },
                {
                  label: "Vol Ratio",
                  tip: "📊 How busy vs. normal. 1.0× = average day. 1.5× = 50% more action than usual. Big moves happen on high volume.",
                  value: `${volumeRatio.toFixed(1)}x`,
                  color: volumeRatio >= 1.5 ? "text-[#43ed9e]" : "text-[#dde3ec]",
                },
                {
                  label: "MAs 20/50",
                  tip: "📈 Is the price above its 20-day and 50-day averages? Green = yes. Both green = stock is in an uptrend — a good sign.",
                  value: null,
                  color: "",
                  custom: (
                    <span className="font-bold text-sm">
                      <span className={isAboveMa20 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}>20</span>
                      <span className="text-[#bacbbd]"> / </span>
                      <span className={isAboveMa50 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}>50</span>
                    </span>
                  ),
                },
              ].map(({ label, tip, value, color, custom }) => (
                <MetricTile key={label} label={label} tip={tip} activeTip={activeTip} setActiveTip={setActiveTip}>
                  {custom ?? <p className={`font-bold text-sm ${color}`}>{value}</p>}
                </MetricTile>
              ))}
            </div>

            {/* MACD · BB · ATR · Sector RS row */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MetricTile label="MACD" tip="📉 Trend engine. Green bar = bullish momentum building. Red bar = losing steam. Crossover from red→green is a classic buy signal." activeTip={activeTip} setActiveTip={setActiveTip}>
                <p className={`font-bold text-sm ${macdHist >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}`}>
                  {macdHist >= 0 ? "▲" : "▼"} {Math.abs(macdHist).toFixed(2)}
                </p>
              </MetricTile>
              <MetricTile label="BB %B" tip="📏 Where is the price inside its normal range? Under 20% = near the bottom band (oversold). Over 80% = near the top (extended). 50% = middle." activeTip={activeTip} setActiveTip={setActiveTip}>
                <p className={`font-bold text-sm ${
                  bbPct < 0.2 ? "text-[#43ed9e]" : bbPct > 0.8 ? "text-yellow-400" : "text-[#dde3ec]"
                }`}>
                  {(bbPct * 100).toFixed(0)}%
                </p>
              </MetricTile>
              <MetricTile label="ATR 14" tip="📐 Average daily price swing. Used to set your stop loss automatically — wider ATR = stock moves more, needs a wider stop to avoid getting shaken out." activeTip={activeTip} setActiveTip={setActiveTip}>
                <p className="font-bold text-sm text-[#dde3ec]">${atr14.toFixed(2)}</p>
              </MetricTile>
            </div>

            {/* Sector RS row */}
            {sectorRs !== null && (
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MetricTile
                  label="Sector RS"
                  tip="🏆 How this stock is performing vs. its own industry ETF over the last 20 trading days. Positive = leading its sector. Negative = lagging. Leaders tend to keep leading."
                  activeTip={activeTip}
                  setActiveTip={setActiveTip}
                >
                  <p className={`font-bold text-sm ${sectorRs > 0 ? "text-[#43ed9e]" : sectorRs > -2 ? "text-yellow-400" : "text-[#ffb3ae]"}`}>
                    {sectorRs > 0 ? "+" : ""}{sectorRs.toFixed(1)}%
                  </p>
                </MetricTile>
                <MetricTile
                  label="Conviction"
                  tip="🎯 Composite score (0–100) combining technical strength, risk/reward tightness, sector leadership, and data quality. ≥90 = High Conviction setup."
                  activeTip={activeTip}
                  setActiveTip={setActiveTip}
                >
                  <p className={`font-bold text-sm ${
                    convictionBand === "high" ? "text-[#43ed9e]"
                    : convictionBand === "medium" ? "text-[#00d084]"
                    : "text-[#c8a84b]"
                  }`}>
                    {convictionScore}/100
                  </p>
                </MetricTile>
                <MetricTile
                  label="Validation"
                  tip="✅ Server-side checks: no conflicting indicators, stop within 8% of entry, structural target achievable (≥2.0:1 R:R), data is fresh. All pass = validated setup."
                  activeTip={activeTip}
                  setActiveTip={setActiveTip}
                >
                  <p className={`font-bold text-sm ${validation.passed ? "text-[#43ed9e]" : "text-yellow-400"}`}>
                    {validation.passed ? "✓ Pass" : "⚠ Check"}
                  </p>
                </MetricTile>
              </div>
            )}

            {/* UX-03: Pre-Market Interpretation Labels */}
            {effectiveGap == null && effectivePmVol == null && (
              <div className="mb-3 rounded-lg bg-[#0e141a] px-3 py-2">
                <span className="text-[9px] text-[#bacbbd]/35">Pre-market data — updates 9:15 AM ET</span>
              </div>
            )}
            {(effectiveGap != null || effectivePmVol != null) && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {effectiveGap != null && (
                  <MetricTile
                    label="Gap Live"
                    tip="Pre-market price gap vs. yesterday's close. >2% gap-up = institutional overnight buying. Negative = gap-down, potential weakness."
                    activeTip={activeTip}
                    setActiveTip={setActiveTip}
                  >
                    <p className={`font-bold text-sm ${effectiveGap > 2 ? "text-[#43ed9e]" : effectiveGap < -2 ? "text-[#ffb3ae]" : "text-[#dde3ec]"}`}>
                      {effectiveGap > 0 ? "+" : ""}{effectiveGap.toFixed(1)}%
                    </p>
                    <p className="text-[9px] text-[#bacbbd]/45 mt-0.5">
                      {effectiveGap > 3 ? "Strong gap-up" : effectiveGap > 1 ? "Mild gap-up" : effectiveGap < -3 ? "Strong gap-down" : effectiveGap < -1 ? "Mild gap-down" : "Flat open"}
                    </p>
                    <p className="text-[9px] text-[#ffb33c]/60 mt-0.5">
                      {effectiveGap > 3 ? "Wait for 9:45 AM — enter if holds" : effectiveGap > 1 ? "Adds directional edge" : effectiveGap < -3 ? "Avoid entry — selling pressure" : effectiveGap < -1 ? "Wait for stabilization" : ""}
                    </p>
                  </MetricTile>
                )}
                {effectivePmVol != null && (
                  <MetricTile
                    label="Pre-mkt Vol"
                    tip="Pre-market volume vs. daily average. >2× = institutional positioning before the open — the signal most novice traders miss."
                    activeTip={activeTip}
                    setActiveTip={setActiveTip}
                  >
                    <p className={`font-bold text-sm ${effectivePmVol > 2 ? "text-[#43ed9e]" : effectivePmVol > 1 ? "text-[#dde3ec]" : "text-[#bacbbd]/60"}`}>
                      {effectivePmVol.toFixed(1)}×
                    </p>
                    <p className="text-[9px] text-[#bacbbd]/45 mt-0.5">
                      {effectivePmVol > 5 ? "Unusual activity" : effectivePmVol > 2 ? "Institutional interest" : effectivePmVol > 1 ? "Above avg" : "Light activity"}
                    </p>
                    <p className="text-[9px] text-[#ffb33c]/60 mt-0.5">
                      {effectivePmVol > 5 ? "Wait for 9:45 AM candle" : effectivePmVol > 2 ? "Execute full position" : effectivePmVol > 1 ? "Start half position" : ""}
                    </p>
                  </MetricTile>
                )}
              </div>
            )}

            {/* UX-01: Conviction Score Breakdown */}
            <div className="mb-3 rounded-lg bg-[#0e141a] px-3 py-2.5">
              <p className="text-[9px] text-[#bacbbd]/50 uppercase tracking-widest mb-2">Score breakdown</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Setup", pts: techPts, max: 40, tip: "Technical signals: breakout, volume, RSI, MACD, trend structure" },
                  { label: "R:R", pts: rrPts, max: 30, tip: "How tight the stop is. Tighter stop = better risk control = more points" },
                  { label: "Sector", pts: sectorPts, max: 15, tip: "Is this stock outperforming its sector ETF? Leaders tend to keep leading" },
                  { label: "Data", pts: qualityPts, max: 15, tip: "Data freshness, no conflicting indicators, stop within 8% of entry" },
                ].map(({ label, pts, max, tip }) => (
                  <div key={label} className="text-center" title={tip}>
                    <p className="text-[9px] text-[#bacbbd]/45 uppercase tracking-wider mb-1">{label}</p>
                    <div className="w-full bg-[#252b31] h-0.5 rounded-full overflow-hidden mb-1">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round((pts / max) * 100)}%`,
                          backgroundColor: pts / max >= 0.7 ? "#43ed9e" : pts / max >= 0.4 ? "#ffb33c" : "#ffb3ae",
                        }}
                      />
                    </div>
                    <p className="text-[10px] font-bold text-[#dde3ec]">{pts}<span className="text-[#bacbbd]/40 font-normal">/{max}</span></p>
                  </div>
                ))}
              </div>
            </div>

            {/* Why not High Conviction? — gate reasons for TACTICAL_BUY, WATCH_EXTENDED, and BREAKOUT_WATCH */}
            {(tier === "TACTICAL_BUY" || tier === "WATCH_EXTENDED" || tier === "BREAKOUT_WATCH") && firedGates.length > 0 && (
              <div className="mb-3 rounded-lg bg-[#0e141a] px-2.5 py-2">
                <p className="text-[10px] text-[#bacbbd]/60 uppercase tracking-widest mb-1.5">
                  What&apos;s holding it back:
                </p>
                <div className="flex flex-wrap gap-1">
                  {firedGates.map((g) => (
                    <span
                      key={g}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-[#252b31] text-[#bacbbd]/70 border border-[#3c4a40]/30"
                    >
                      {GATE_LABELS[g]}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Validation checklist — collapsible */}
            {validation.notes.length > 0 && (
              <div className="mb-3 rounded-lg bg-[#0e141a] overflow-hidden">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowValidation((v) => !v); }}
                  className="w-full flex items-center justify-between px-2.5 py-2 hover:bg-[#161c22] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[#bacbbd]/60 uppercase tracking-widest">Validation checks</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                      validation.passed
                        ? "bg-[#43ed9e]/10 text-[#43ed9e]"
                        : "bg-yellow-400/10 text-yellow-400"
                    }`}>
                      {validation.passed ? "All passed" : `${validation.notes.filter(n => n.startsWith("✗")).length} flagged`}
                    </span>
                  </div>
                  {showValidation
                    ? <ChevronUp size={11} className="text-[#bacbbd]/40" />
                    : <ChevronDown size={11} className="text-[#bacbbd]/40" />
                  }
                </button>
                {showValidation && (
                  <div className="px-2.5 pb-2.5 space-y-1">
                    {validation.notes.map((note, i) => (
                      <p key={i} className={`text-[10px] leading-relaxed ${note.startsWith("✓") ? "text-[#43ed9e]/80" : "text-yellow-400/80"}`}>
                        {note}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Why this signal — condition pills */}
            {conditions && conditions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {conditions.map(({ label, met }) => (
                  <span
                    key={label}
                    className={`text-[9px] px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold border ${
                      met
                        ? "bg-[#43ed9e]/10 text-[#43ed9e] border-[#43ed9e]/20"
                        : "bg-[#252b31] text-[#bacbbd]/40 border-transparent"
                    }`}
                  >
                    {met ? "✓" : "✗"} {label}
                  </span>
                ))}
              </div>
            )}

            {/* Trade notes */}
            {convictionScore >= 40 && (
              <div className="space-y-1.5 mb-3 rounded-lg p-3 bg-[#0e141a]">
                {(prevClose != null && prevClose > 0 || open != null && open > 0) && (
                  <div className="flex items-center gap-4 text-[11px] text-[#bacbbd]/60 pb-1.5 border-b border-[#3c4a40]/20 mb-0.5">
                    {prevClose != null && prevClose > 0 && (
                      <span>Prev close <span className="text-[#dde3ec] font-mono">${prevClose.toFixed(2)}</span></span>
                    )}
                    {open != null && open > 0 && (
                      <span>Today open <span className="text-[#dde3ec] font-mono">${open.toFixed(2)}</span></span>
                    )}
                  </div>
                )}
                <p className="text-xs font-medium text-[#43ed9e]">▲ {entryNote}</p>
                <p className="text-xs font-medium text-[#ffb3ae]">▼ {stopNote}</p>
                {risk && targetPrice && (
                  <p className="text-[10px] text-[#bacbbd] pt-1 border-t border-[#3c4a40]/20 flex items-center gap-1.5 flex-wrap">
                    {trailMode ? (
                      <>
                        <span className="text-[#adc6ff]">Trail active</span>
                        <span>· Trail stop ${targetPrice.toFixed(2)}</span>
                        <span
                          className="text-[#adc6ff]"
                          title="ATH breakout: target replaced with trailing stop (1.5× ATR / 8 EMA). Hold until price crosses below the trail line."
                        >↗ ATH</span>
                      </>
                    ) : (
                      <>
                        <span>R:R {displayRR !== null && displayRR > 0 ? `${displayRR.toFixed(1)}:1` : "—"} · Target ${targetPrice.toFixed(2)}</span>
                        {hardGates?.rrBelowMinimum ? (
                          <span className="text-[#ffb3ae]" title="R:R below 2.0:1 minimum — structural target too close">⚠</span>
                        ) : (
                          <span className="text-[#43ed9e]" title="Structural target achievable (≥2.0:1 R:R)">🛡</span>
                        )}
                      </>
                    )}
                    {regime && (
                      <span className={`ml-1 px-1 rounded text-[9px] font-semibold uppercase ${
                        regime === "bull" ? "bg-[#43ed9e]/15 text-[#43ed9e]"
                        : regime === "bear" ? "bg-[#ffb3ae]/15 text-[#ffb3ae]"
                        : "bg-[#ffb33c]/15 text-[#ffb33c]"
                      }`}>{regime}</span>
                    )}
                  </p>
                )}
              </div>
            )}

            {/* UX-02: Trade Setup Walkthrough */}
            {convictionScore >= 70 && entryPrice > 0 && stopPrice > 0 && targetPrice && (
              <div className="mb-3 rounded-lg bg-[#0e141a] px-3 py-2.5">
                <p className="text-[9px] text-[#bacbbd]/50 uppercase tracking-widest mb-2.5">How to place this trade</p>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[#43ed9e]/15 text-[#43ed9e] text-[9px] font-bold flex items-center justify-center mt-0.5">1</span>
                    <p className="text-[11px] text-[#bacbbd] leading-snug">
                      Set a <span className="text-[#43ed9e] font-semibold">buy-stop order at ${entryPrice.toFixed(2)}</span> — triggers only if price rises to this level, confirming the move
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[#ffb3ae]/15 text-[#ffb3ae] text-[9px] font-bold flex items-center justify-center mt-0.5">2</span>
                    <p className="text-[11px] text-[#bacbbd] leading-snug">
                      Immediately set a <span className="text-[#ffb3ae] font-semibold">stop-loss at ${stopPrice.toFixed(2)}</span> — this is your max loss per share if the trade goes wrong
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="shrink-0 w-4 h-4 rounded-full bg-[#adc6ff]/15 text-[#adc6ff] text-[9px] font-bold flex items-center justify-center mt-0.5">3</span>
                    <p className="text-[11px] text-[#bacbbd] leading-snug">
                      {trailMode
                        ? <>Plan to <span className="text-[#adc6ff] font-semibold">trail your stop up</span> as price rises — move stop up every few days to lock in gains</>
                        : <>Set a <span className="text-[#adc6ff] font-semibold">profit target at ${targetPrice.toFixed(2)}</span> — take partial or full profits when price reaches this level</>
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* News headline */}
            {sa?.recentHeadline && (
              <div className={`rounded-lg px-3 py-2 mb-3 ${sentimentBorder[sa.newsSentiment ?? "neutral"]}`}>
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={sa.newsUrl ?? undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-xs text-[#bacbbd] leading-snug hover:text-[#dde3ec] transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {sa.recentHeadline}
                  </a>
                  <button
                    onClick={(e) => { e.stopPropagation(); setModalOpen(true); }}
                    className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-[#252b31] text-[#bacbbd] opacity-60 hover:opacity-100 transition-opacity whitespace-nowrap"
                    title="View Seeking Alpha analysis"
                  >
                    Deep Dive ↗
                  </button>
                </div>
                {sa.newsPublisher && (
                  <p className="text-[10px] text-[#bacbbd]/40 mt-1">{sa.newsPublisher}</p>
                )}
              </div>
            )}

            {/* Finnhub sentiment + analyst target */}
            {sa?.finnhubLabel && (
              <div className="flex items-center gap-3 px-1 mb-3 flex-wrap">
                <span className={`text-[11px] font-medium ${
                  sa.finnhubLabel === "bullish" ? "text-[#43ed9e]"
                  : sa.finnhubLabel === "bearish" ? "text-[#ffb3ae]"
                  : "text-[#bacbbd]"
                }`}>
                  Analyst {sa.finnhubLabel.charAt(0).toUpperCase() + sa.finnhubLabel.slice(1)}
                  {sa.finnhubBullishPct !== null && ` ${sa.finnhubBullishPct}%`}
                  {sa.finnhubAnalystCount !== null && (
                    <span className="text-[#bacbbd]/50 font-normal"> · {sa.finnhubAnalystCount} analysts</span>
                  )}
                </span>
                {sa.analystTargetMean !== null && (
                  <span className="text-[11px] text-[#bacbbd]">
                    Target ${sa.analystTargetMean.toFixed(2)}
                    {sa.analystUpside !== null && (
                      <span className={sa.analystUpside >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}>
                        {" "}({sa.analystUpside >= 0 ? "+" : ""}{sa.analystUpside}%)
                      </span>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Action row: chart + calculator + log trade */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowChart((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-[#bacbbd] hover:text-[#dde3ec] transition-colors flex-1"
              >
                {showChart ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                {showChart ? "Hide chart" : "Show chart"}
              </button>
              {entryPrice && stopPrice && (
                <button
                  onClick={() => onOpenCalc?.(entryPrice, stopPrice, ticker, garchVol)}
                  className="text-xs px-3 py-1 rounded-lg bg-[#252b31] text-[#bacbbd] hover:bg-[#2f353c] hover:text-[#dde3ec] transition-colors font-medium"
                >
                  Size
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!logOpen) setLogShares(recommendedShares != null ? String(recommendedShares) : "");
                  setLogOpen((v) => !v);
                  setLogError("");
                  setLogSuccess(false);
                }}
                className={`flex items-center gap-1 text-xs px-3 py-1 rounded-lg transition-colors font-medium ${
                  logSuccess
                    ? "bg-[#43ed9e]/20 text-[#43ed9e]"
                    : logOpen
                    ? "bg-[#2f353c] text-[#dde3ec]"
                    : "bg-[#252b31] text-[#bacbbd] hover:bg-[#2f353c] hover:text-[#dde3ec]"
                }`}
                title="Log this trade to journal"
              >
                {logSuccess ? <Check size={11} /> : <BookOpen size={11} />}
                {logSuccess ? "Logged!" : "Log Trade"}
              </button>
            </div>

            {/* Log Trade — coaching form */}
            {logOpen && !logSuccess && (
              <div className="mt-2 rounded-lg bg-[#0e141a] border border-[#3c4a40]/30 p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
                <p className="text-[10px] text-[#bacbbd]/60 uppercase tracking-widest font-semibold">Position Coach</p>

                {/* Coaching note */}
                {(tier === "HIGH_CONVICTION" || tier === "TACTICAL_BUY") && (
                  <div
                    className="rounded-lg px-3 py-2 text-[11px] leading-relaxed"
                    style={{ backgroundColor: `${tColor}10`, color: tColor }}
                  >
                    {tier === "HIGH_CONVICTION"
                      ? `Full position. All quality gates cleared. You're risking ${riskPct}% of your account ($${riskBudget.toLocaleString("en-US", { maximumFractionDigits: 0 })}) — if the stop hits, that's your maximum loss.`
                      : `Half position recommended. One quality gate is still failing. You're risking ${(riskPct / 2).toFixed(1)}% of your account ($${(riskBudget / 2).toLocaleString("en-US", { maximumFractionDigits: 0 })}) until the setup fully clears. You can add to the position if it upgrades to High Conviction.`
                    }
                  </div>
                )}

                {/* Account size + risk % + shares row */}
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[#bacbbd]/60 block mb-1">Account ($)</label>
                      <input
                        type="number"
                        min="50"
                        max="500000"
                        step="1000"
                        value={accountSize}
                        onChange={(e) => {
                          const val = Math.min(500000, Math.max(50, parseInt(e.target.value) || 50));
                          setAccountSize(val);
                          localStorage.setItem(ACCOUNT_SIZE_KEY, String(val));
                          const budget = val * (riskPct / 100);
                          const stopRisk = entryPrice > 0 && stopPrice > 0 ? Math.abs(entryPrice - stopPrice) : null;
                          let sh: number;
                          if (garchVol && garchVol > 0 && entryPrice > 0) {
                            sh = budget / (entryPrice * (garchVol / 100) * 2);
                          } else if (stopRisk && stopRisk > 0) {
                            sh = budget / stopRisk;
                          } else { return; }
                          if (isTactical) sh = sh * 0.5;
                          setLogShares(String(Math.max(1, Math.floor(sh))));
                        }}
                        className="w-full rounded px-2 py-1.5 bg-[#252b31] text-[#dde3ec] border border-[#3c4a40]/30 focus:outline-none focus:border-[#43ed9e]/40 text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-[#bacbbd]/60 block mb-1">Risk (%)</label>
                      <input
                        type="number"
                        min="0.5"
                        max="5"
                        step="0.5"
                        value={riskPct}
                        onChange={(e) => {
                          const val = Math.min(5, Math.max(0.5, parseFloat(e.target.value) || 0.5));
                          setRiskPct(val);
                          localStorage.setItem(RISK_PCT_KEY, String(val));
                          const budget = accountSize * (val / 100);
                          const stopRisk = entryPrice > 0 && stopPrice > 0 ? Math.abs(entryPrice - stopPrice) : null;
                          let sh: number;
                          if (garchVol && garchVol > 0 && entryPrice > 0) {
                            sh = budget / (entryPrice * (garchVol / 100) * 2);
                          } else if (stopRisk && stopRisk > 0) {
                            sh = budget / stopRisk;
                          } else { return; }
                          if (isTactical) sh = sh * 0.5;
                          setLogShares(String(Math.max(1, Math.floor(sh))));
                        }}
                        className="w-full rounded px-2 py-1.5 bg-[#252b31] text-[#dde3ec] border border-[#3c4a40]/30 focus:outline-none focus:border-[#43ed9e]/40 text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[#bacbbd]/60 block mb-1">
                      Shares {garchVol ? "(GARCH sized)" : `(${riskPct}% risk rule)`}
                      {isTactical && <span className="ml-1 text-[#adc6ff]">½ pos</span>}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="0"
                      value={logShares}
                      onChange={(e) => setLogShares(e.target.value)}
                      className="w-full rounded px-2 py-1.5 bg-[#252b31] text-[#dde3ec] border border-[#3c4a40]/30 focus:outline-none focus:border-[#43ed9e]/40 text-xs"
                      autoFocus
                    />
                  </div>
                </div>

                {/* Entry / Stop / Allocation summary */}
                <div className="rounded px-2 py-1.5 bg-[#252b31]/60 text-[10px] space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[#bacbbd]/50">Entry</span>
                    <span className="text-[#dde3ec] font-mono">${entryPrice?.toFixed(2) ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#bacbbd]/50">Stop</span>
                    <span className="text-[#ffb3ae] font-mono">${stopPrice?.toFixed(2) ?? "—"}</span>
                  </div>
                  {parseInt(logShares) > 0 && entryPrice > 0 && (
                    <div className="flex justify-between border-t border-[#3c4a40]/20 pt-1 mt-1">
                      <span className="text-[#bacbbd]/50">Total cost</span>
                      <span className="text-[#dde3ec] font-mono">${(parseInt(logShares) * entryPrice).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
                    </div>
                  )}
                </div>

                {/* Entry date */}
                <div>
                  <label className="text-[10px] text-[#bacbbd]/60 block mb-1">Entry date</label>
                  <input
                    type="date"
                    value={logDate}
                    onChange={(e) => setLogDate(e.target.value)}
                    className="w-full rounded px-2 py-1.5 bg-[#252b31] text-[#dde3ec] border border-[#3c4a40]/30 focus:outline-none focus:border-[#43ed9e]/40 text-xs"
                  />
                </div>

                {logError && (
                  <div className="flex items-center gap-1.5 text-[10px] text-[#ffb3ae]">
                    <AlertCircle size={10} />
                    {logError}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    disabled={logLoading}
                    onClick={async () => {
                      setLogError("");
                      const sh = parseInt(logShares);
                      if (!(sh > 0)) { setLogError("Enter number of shares."); return; }
                      setLogLoading(true);
                      try {
                        const res = await fetch("/api/trades", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            ticker,
                            entry_price: entryPrice,
                            stop_price: stopPrice ?? null,
                            exit_price: null,
                            shares: sh,
                            entry_date: logDate,
                            exit_date: null,
                            strategy,
                            notes: `Conviction ${convictionScore}/100 · ${tier?.replace(/_/g, " ") ?? ""} · Account $${accountSize.toLocaleString()}`,
                          }),
                        });
                        if (res.ok) {
                          setLogSuccess(true);
                          setLogOpen(false);
                          onTradeLogged?.();
                          setTimeout(() => setLogSuccess(false), 3000);
                        } else {
                          const j = await res.json();
                          setLogError(j.error ?? "Failed to log trade.");
                        }
                      } finally {
                        setLogLoading(false);
                      }
                    }}
                    className="flex-1 text-xs font-semibold py-1.5 rounded transition-colors disabled:opacity-50"
                    style={{ backgroundColor: tColor, color: "#0e141a" }}
                  >
                    {logLoading ? "Logging…" : "Confirm & Log Trade"}
                  </button>
                  <button
                    onClick={() => { setLogOpen(false); setLogError(""); }}
                    className="text-xs px-3 py-1.5 rounded bg-[#252b31] text-[#bacbbd] hover:bg-[#2f353c] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {showChart && (
              <StockChart
                ticker={ticker}
                entryPrice={entryPrice}
                stopPrice={stopPrice}
                targetPrice={targetPrice}
              />
            )}
          </div>
        )}
      </div>

      {sa && (
        <SAModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          ticker={ticker}
          sa={sa}
        />
      )}

      <FAQModal open={faqOpen} onClose={() => { setFaqOpen(false); setFaqMode("conviction"); }} mode={faqMode} mlScore={mlScore} mlRank={mlRank} convictionTrend={convictionTrend} />
    </>
  );
}
