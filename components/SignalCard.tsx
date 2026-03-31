"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import SAModal from "./SAModal";
import StockChart from "./StockChart";

/** Extracts the first dollar amount from a note string */
function parseFirstPrice(note: string): number | null {
  const matches = note.match(/\$(\d+(?:\.\d+)?)/g);
  if (!matches || matches.length === 0) return null;
  return parseFloat(matches[0].replace("$", ""));
}

/** Extracts the last dollar amount from a note string */
function parseLastPrice(note: string): number | null {
  const matches = note.match(/\$(\d+(?:\.\d+)?)/g);
  if (!matches || matches.length === 0) return null;
  return parseFloat(matches[matches.length - 1].replace("$", ""));
}

interface SAInfo {
  earningsDays: number | null;
  recentHeadline: string | null;
  newsSentiment: "positive" | "negative" | "neutral" | null;
  newsUrl: string | null;
  newsPublisher: string | null;
}

interface SignalCardProps {
  ticker: string;
  score: number;
  strength: string;
  price: number;
  changePct: number;
  volumeRatio: number;
  rsi14: number;
  isAboveMa20: boolean;
  isAboveMa50: boolean;
  atr14: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  bbPct: number;
  bbWidth: number;
  entryNote: string;
  stopNote: string;
  strategy: string;
  conditions?: { label: string; met: boolean }[];
  sa?: SAInfo;
  onOpenCalc?: (entry: number | null, stop: number | null) => void;
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
  ticker, score, strength, price, changePct,
  volumeRatio, rsi14, isAboveMa20, isAboveMa50,
  atr14, macd, macdHist, bbPct, bbWidth,
  entryNote, stopNote, strategy, conditions, sa, onOpenCalc,
}: SignalCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [activeTip, setActiveTip] = useState<string | null>(null);

  const isAI = score >= 8;
  const changePositive = changePct >= 0;
  const changeColor = changePositive ? "text-[#43ed9e]" : "text-[#ffb3ae]";
  const changeSign = changePositive ? "+" : "";

  const entryPrice = parseLastPrice(entryNote);
  const stopPrice = parseFirstPrice(stopNote);
  const risk = entryPrice && stopPrice ? Math.abs(entryPrice - stopPrice) : null;
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
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00e7f6]/10 text-[#00e7f6] font-bold tracking-widest uppercase border border-[#00e7f6]/15">
                  AI
                </span>
              )}
              {earningsWarning && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-900/30 text-orange-300 border border-orange-800/30">
                  ⚠ {sa!.earningsDays === 0 ? "Earnings today" : `Earnings ${sa!.earningsDays}d`}
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#bacbbd] mt-0.5 uppercase tracking-wider">
              {strategy.replace(/_/g, " ")}
            </p>
          </div>

          {/* Signal badge */}
          <div className="shrink-0 hidden sm:block">
            <span className={`text-[10px] px-2.5 py-1 rounded font-bold tracking-widest uppercase ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Entry price */}
          {entryPrice && (
            <div className="shrink-0 hidden md:block">
              <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-0.5">Entry</p>
              <p className="font-mono text-sm text-[#dde3ec]">${entryPrice.toFixed(2)}</p>
            </div>
          )}

          {/* Confidence bar */}
          <div className="w-16 shrink-0 hidden sm:block">
            <div className="w-full bg-[#252b31] h-1 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  score >= 8 ? "bg-[#43ed9e]"
                  : score >= 6 ? "bg-[#00d084]"
                  : score >= 4 ? "bg-yellow-400"
                  : "bg-[#bacbbd]"
                }`}
                style={{ width: `${score * 10}%` }}
              />
            </div>
            <p className="text-[10px] text-[#bacbbd] mt-1 text-right">{score}/10</p>
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

            {/* MACD · BB · ATR row */}
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
            {score >= 5 && (
              <div className="space-y-1.5 mb-3 rounded-lg p-3 bg-[#0e141a]">
                <p className="text-xs font-medium text-[#43ed9e]">▲ {entryNote}</p>
                <p className="text-xs font-medium text-[#ffb3ae]">▼ {stopNote}</p>
                {risk && targetPrice && (
                  <p className="text-[10px] text-[#bacbbd] pt-1 border-t border-[#3c4a40]/20">
                    R:R {((targetPrice - (entryPrice ?? 0)) / risk).toFixed(1)}:1 · Target ${targetPrice.toFixed(2)}
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

            {/* Action row: chart + calculator */}
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
            </div>

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
    </>
  );
}
