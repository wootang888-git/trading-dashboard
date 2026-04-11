"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, BookOpen, Check, AlertCircle } from "lucide-react";
import SAModal from "./SAModal";
import StockChart from "./StockChart";
import FAQModal from "./FAQModal";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

interface SAInfo {
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
  newsUrl: string | null;
  newsPublisher: string | null;
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
  onOpenCalc?: (entry: number | null, stop: number | null) => void;
  mlScore?: number | null;
  mlRank?: number | null;
  prevClose?: number | null;
  open?: number | null;
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

export default function SignalCard({
  ticker, strength, price, changePct,
  convictionScore, convictionBand, sectorRs, validation,
  volumeRatio, rsi14, isAboveMa20, isAboveMa50,
  atr14, macdHist, bbPct,
  entryNote, stopNote, entryPrice, stopPrice,
  strategy, conditions, sa, onOpenCalc,
  mlScore, mlRank,
  prevClose, open,
}: SignalCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqMode, setFaqMode] = useState<"conviction" | "ml">("conviction");
  const [showChart, setShowChart] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [activeTip, setActiveTip] = useState<string | null>(null);

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
  const targetPrice = entryPrice && risk ? entryPrice + 3 * risk : null;
  const earningsWarning = sa?.earningsDays !== null && sa?.earningsDays !== undefined && sa.earningsDays <= 7;

  const badge = signalBadge(strength);

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
        {/* ── Main row (always visible) ── */}
        <div
          className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#252b31]/30 transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {/* Ticker avatar */}
          <div className="w-9 h-9 rounded-lg bg-[#252b31] flex items-center justify-center shrink-0">
            <span className={`font-bold text-[10px] tracking-wider ${avatarColor}`}>
              {ticker.slice(0, 4)}
            </span>
          </div>

          {/* Asset + strategy */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base text-[#dde3ec] font-['Space_Grotesk']">
                {ticker}
              </span>
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
                  ML {mlScore}%{mlRank != null && <span className="text-[#6b7280] ml-1">#{mlRank}</span>}
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#bacbbd] mt-0.5 uppercase tracking-wider">
              {strategy.replace(/_/g, " ")}
            </p>
          </div>

          {/* Signal badge — tap opens FAQ */}
          <div className="shrink-0">
            <button
              className={`text-[7px] px-1.5 py-0.5 md:text-[10px] md:px-2.5 md:py-1 rounded font-bold tracking-widest uppercase cursor-pointer ${badge.cls}`}
              onClick={(e) => { e.stopPropagation(); setFaqMode("conviction"); setFaqOpen(true); }}
            >
              {badge.label}
            </button>
          </div>

          {/* Entry price */}
          {entryPrice && (
            <div className="shrink-0 hidden md:block">
              <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-0.5">Entry</p>
              <p className="font-mono text-sm text-[#dde3ec]">${entryPrice.toFixed(2)}</p>
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

        {/* ── Expanded detail panel ── */}
        {expanded && (
          <div
            className="px-5 pb-4 border-t border-[#3c4a40]/20"
            onClick={() => setActiveTip(null)}
          >

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
                  tip="✅ Server-side checks: no conflicting indicators, stop within 8% of entry, 3:1 target achievable, data is fresh. All pass = validated setup."
                  activeTip={activeTip}
                  setActiveTip={setActiveTip}
                >
                  <p className={`font-bold text-sm ${validation.passed ? "text-[#43ed9e]" : "text-yellow-400"}`}>
                    {validation.passed ? "✓ Pass" : "⚠ Check"}
                  </p>
                </MetricTile>
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
                  <p className="text-[10px] text-[#bacbbd] pt-1 border-t border-[#3c4a40]/20">
                    R:R {((targetPrice - entryPrice) / risk).toFixed(1)}:1 · Target ${targetPrice.toFixed(2)}
                  </p>
                )}
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
                  onClick={() => onOpenCalc?.(entryPrice, stopPrice)}
                  className="text-xs px-3 py-1 rounded-lg bg-[#252b31] text-[#bacbbd] hover:bg-[#2f353c] hover:text-[#dde3ec] transition-colors font-medium"
                >
                  Size
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setLogOpen((v) => !v); setLogError(""); setLogSuccess(false); }}
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

            {/* Log Trade inline form */}
            {logOpen && !logSuccess && (
              <div className="mt-2 rounded-lg bg-[#0e141a] p-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                <p className="text-[10px] text-[#bacbbd]/60 uppercase tracking-widest">Log to journal</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[#bacbbd]/60 block mb-1">Shares</label>
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
                  <div>
                    <label className="text-[#bacbbd]/60 block mb-1">Entry date</label>
                    <input
                      type="date"
                      value={logDate}
                      onChange={(e) => setLogDate(e.target.value)}
                      className="w-full rounded px-2 py-1.5 bg-[#252b31] text-[#dde3ec] border border-[#3c4a40]/30 focus:outline-none focus:border-[#43ed9e]/40 text-xs"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-[#bacbbd]/50 space-y-0.5">
                  <p>Ticker: <span className="text-[#dde3ec]">{ticker}</span> · Strategy: <span className="text-[#dde3ec]">{strategy.replace(/_/g, " ")}</span></p>
                  <p>Entry: <span className="text-[#dde3ec]">${entryPrice?.toFixed(2) ?? "—"}</span> · Stop: <span className="text-[#ffb3ae]">${stopPrice?.toFixed(2) ?? "—"}</span></p>
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
                            notes: `Signal conviction ${convictionScore}/100 — logged from dashboard`,
                          }),
                        });
                        if (res.ok) {
                          setLogSuccess(true);
                          setLogOpen(false);
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
                    style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
                  >
                    {logLoading ? "Logging…" : "Confirm & Log"}
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

      <FAQModal open={faqOpen} onClose={() => { setFaqOpen(false); setFaqMode("conviction"); }} mode={faqMode} mlScore={mlScore} mlRank={mlRank} />
    </>
  );
}
