"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface FAQModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "conviction" | "ml" | "trend";
  mlScore?: number | null;
  mlRank?: number | null;
  convictionTrend?: "rising" | "stable" | "falling" | null;
}

function MlScoreContent({ mlScore, mlRank }: { mlScore?: number | null; mlRank?: number | null }) {
  const scoreLabel =
    mlScore == null ? null
    : mlScore >= 70 ? { text: "High conviction", color: "text-[#45dfa4]", bg: "bg-[#45dfa4]/10" }
    : mlScore >= 50 ? { text: "Moderate setup", color: "text-[#f9bd22]", bg: "bg-[#f9bd22]/10" }
    : { text: "Early signal", color: "text-[#bacbbd]", bg: "bg-[#bacbbd]/10" };

  return (
    <div className="space-y-6 text-[#bacbbd]">

      {/* Score callout */}
      {mlScore != null && scoreLabel && (
        <div className={`rounded-xl p-4 ${scoreLabel.bg} border border-white/5`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-2xl font-bold font-mono ${scoreLabel.color}`}>{mlScore}%</span>
            {mlRank != null && (
              <span className="text-[12px] text-[#888]">#{mlRank} of ~390 S&P 500 stocks today</span>
            )}
          </div>
          <p className={`text-[13px] font-bold ${scoreLabel.color}`}>{scoreLabel.text}</p>
        </div>
      )}

      {/* Plain-language explanation */}
      <section>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
          What is the ML Score?
        </h3>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80 mb-3">
          Think of it like a <span className="text-[#dde3ec] font-medium">probability grade</span> from a computer that has studied millions of past stock setups. A score of <span className="text-[#45dfa4] font-bold">74%</span> means: "In similar situations in the past, this stock beat the market about 74% of the time over the next 5 trading days."
        </p>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80">
          It does <span className="text-[#dde3ec] font-medium">not</span> predict the future — it just tells you that the current setup looks historically favourable.
        </p>
      </section>

      <div className="border-t border-[#3c4a40]/20" />

      {/* What the model looks at */}
      <section>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
          What does the model look at?
        </h3>
        <div className="space-y-2.5">
          {[
            { icon: "📈", label: "Proximity to 52-week high", desc: "Stocks near their highs often keep climbing — momentum tends to continue." },
            { icon: "🔊", label: "Rising volume trend", desc: "More buyers stepping in over the last 5 days vs the last 20 days. Big money is accumulating." },
            { icon: "⚡", label: "5-day price momentum", desc: "The stock has been moving up recently — it already has wind behind it." },
            { icon: "📊", label: "RSI (strength indicator)", desc: "Between 55–75 is the sweet spot: strong enough to be bullish, not so high it's overextended." },
            { icon: "🏆", label: "Sector performance", desc: "Is the stock beating other stocks in its industry? Leadership within a sector is a good sign." },
            { icon: "🌍", label: "Market regime", desc: "Is the overall market in a bull, sideways, or bear phase? The model scores setups differently in each." },
          ].map(({ icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="text-lg shrink-0 mt-0.5">{icon}</span>
              <div>
                <p className="text-[14px] font-medium text-[#dde3ec]">{label}</p>
                <p className="text-[12px] text-[#bacbbd]/60 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-[#3c4a40]/20" />

      {/* Ranking */}
      <section>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
          What does the ranking mean?
        </h3>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80 mb-3">
          The <span className="text-[#adc6ff] font-bold">#N</span> rank compares this stock against every other S&P 500 stock <span className="text-[#dde3ec] font-medium">scored today</span>. A rank of <span className="text-[#adc6ff] font-bold">#1</span> means the model sees this as the single best setup in the entire S&P 500 right now.
        </p>
        <div className="space-y-2">
          {[
            { range: "#1–#10", color: "text-[#45dfa4]", bg: "bg-[#45dfa4]/10", desc: "Elite tier — top 2–3% of the entire market. Very rare." },
            { range: "#11–#50", color: "text-[#adc6ff]", bg: "bg-[#adc6ff]/10", desc: "Strong setup — top 10%. Worth watching closely." },
            { range: "#51–#100", color: "text-[#f9bd22]", bg: "bg-[#f9bd22]/10", desc: "Above average — top 25%. Decent signal, not exceptional." },
            { range: "#100+", color: "text-[#bacbbd]", bg: "bg-[#bacbbd]/10", desc: "Average or below. The model doesn't see a strong edge here today." },
          ].map(({ range, color, bg, desc }) => (
            <div key={range} className={`rounded-lg p-3 ${bg}`}>
              <p className={`text-[13px] font-bold ${color} mb-0.5`}>{range}</p>
              <p className="text-[12px] text-[#bacbbd]/70 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="border-t border-[#3c4a40]/20" />

      {/* How it was trained */}
      <section>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
          How was it trained?
        </h3>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80 mb-2">
          The model studied <span className="text-[#dde3ec] font-medium">4 years of daily price data</span> across ~390 S&P 500 stocks — over 370,000 stock-day examples. For each day, it learned whether that stock outperformed the S&P 500 by at least 2% over the following 5 days.
        </p>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80">
          It was tested using <span className="text-[#dde3ec] font-medium">walk-forward validation</span> — meaning it was only ever allowed to learn from the past and predict the future, never the other way around. The top 20% of its picks historically beat the bottom 20% by <span className="text-[#45dfa4] font-bold">+0.35% per 5-day hold</span>.
        </p>
      </section>

      {/* Disclaimer */}
      <div className="rounded-lg bg-orange-900/10 border border-orange-800/20 p-3">
        <p className="text-[12px] text-orange-300/80 leading-relaxed">
          ⚠ The ML score is a ranking tool, not a guarantee. Always confirm with the conviction score and your own judgement before trading. Past patterns don&apos;t guarantee future results.
        </p>
      </div>

      <div className="pb-safe" />
    </div>
  );
}

function TrendContent({ convictionTrend }: { convictionTrend?: "rising" | "stable" | "falling" | null }) {
  const isRising = convictionTrend === "rising";
  const isFalling = convictionTrend === "falling";
  const badgeColor = isRising ? "#45dfa4" : isFalling ? "#ffb3ae" : "#bacbbd";
  const badgeLabel = isRising ? "↑ Momentum Building" : isFalling ? "↓ Thesis Weakening" : "Conviction Trend";

  return (
    <div className="space-y-6 text-[#bacbbd]">

      {/* Badge callout */}
      <div
        className="rounded-xl p-4 border border-white/5"
        style={{ backgroundColor: `${badgeColor}12` }}
      >
        <p className="text-[13px] font-bold mb-1" style={{ color: badgeColor }}>{badgeLabel}</p>
        <p className="text-[14px] leading-relaxed" style={{ color: `${badgeColor}CC` }}>
          {isRising
            ? "This stock's conviction score has been rising over the last 1–3 sessions. The setup is improving."
            : isFalling
            ? "This stock's conviction score has been falling over the last 1–3 sessions. The thesis is weakening."
            : "This stock's conviction score has been stable over the last 1–3 sessions."
          }
        </p>
      </div>

      {/* What it means */}
      <section>
        <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
          What is the Conviction Trend?
        </h3>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80 mb-3">
          SwingAI tracks each stock's conviction score every trading day and notes the direction it's moving. A <span className="text-[#45dfa4] font-medium">rising trend</span> means more quality checks are passing each day. A <span className="text-[#ffb3ae] font-medium">falling trend</span> means conditions are deteriorating.
        </p>
        <p className="text-[14px] leading-relaxed text-[#bacbbd]/80">
          The trend badge appears after <span className="text-[#dde3ec] font-medium">1–3 consecutive sessions</span> in the same direction. Once a streak reaches 4+ days the badge is hidden — a long streak is already reflected in the tier itself.
        </p>
      </section>

      <div className="border-t border-[#3c4a40]/20" />

      {/* Observe + rising: the critical nuance */}
      {isRising && (
        <>
          <section>
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Improving but not yet actionable
            </h3>
            <div className="rounded-lg bg-[#c8a84b]/10 border border-[#c8a84b]/20 p-3 mb-3">
              <p className="text-[13px] font-bold text-[#c8a84b] mb-1">If the tier shows OBSERVE</p>
              <p className="text-[14px] leading-relaxed text-[#bacbbd]/80">
                The score is heading in the right direction, but it has <span className="text-[#dde3ec] font-medium">not yet crossed the quality threshold</span> needed to enter a position. Do not buy yet. This is a stock to watch — check back each morning to see if it upgrades to Tactical Buy or High Conviction.
              </p>
            </div>
            <div className="rounded-lg bg-[#adc6ff]/10 border border-[#adc6ff]/20 p-3">
              <p className="text-[13px] font-bold text-[#adc6ff] mb-1">If the tier shows TACTICAL BUY or HIGH CONVICTION</p>
              <p className="text-[14px] leading-relaxed text-[#bacbbd]/80">
                Rising momentum <span className="text-[#dde3ec] font-medium">confirms the setup</span>. The stock is both actionable and improving — a stronger signal than a static score alone.
              </p>
            </div>
          </section>
          <div className="border-t border-[#3c4a40]/20" />
        </>
      )}

      {/* Falling: what to do */}
      {isFalling && (
        <>
          <section>
            <h3 className="text-[12px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              What to do when the thesis weakens
            </h3>
            <div className="space-y-2">
              {[
                { icon: "📋", title: "Holding a position?", desc: "Review your stop loss. A falling conviction trend often precedes an Exit signal. Make sure your stop is within your risk tolerance before the next session." },
                { icon: "👀", title: "Watching but not yet in?", desc: "Wait. A weakening trend means conditions are moving against the setup. There is no urgency to enter — let the signal stabilize or improve before acting." },
                { icon: "🔄", title: "Already exited?", desc: "Good discipline. Monitor over the next few sessions. If the trend reverses to rising, the setup may rebuild and re-qualify." },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="text-lg shrink-0 mt-0.5">{icon}</span>
                  <div>
                    <p className="text-[14px] font-medium text-[#dde3ec]">{title}</p>
                    <p className="text-[12px] text-[#bacbbd]/60 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <div className="border-t border-[#3c4a40]/20" />
        </>
      )}

      {/* Important reminder */}
      <div className="rounded-lg bg-orange-900/10 border border-orange-800/20 p-3">
        <p className="text-[12px] text-orange-300/80 leading-relaxed">
          ⚠ The conviction trend shows <span className="font-medium">direction of travel</span>, not a standalone buy or sell signal. Always confirm with the tier and hard gate status before acting.
        </p>
      </div>

      <div className="pb-safe" />
    </div>
  );
}

export default function FAQModal({ open, onClose, mode = "conviction", mlScore, mlRank, convictionTrend }: FAQModalProps) {
  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40 transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Panel — slides from right on md+, bottom sheet on mobile */}
      <div
        className={`
          fixed z-50 bg-[#0e141a] border-[#3c4a40]/30 overflow-y-auto
          /* mobile: bottom sheet */
          bottom-0 left-0 right-0 rounded-t-2xl max-h-[85vh] border-t
          /* md+: right panel */
          md:bottom-auto md:top-0 md:right-0 md:left-auto md:h-screen md:w-[605px] md:rounded-none md:rounded-l-2xl md:border-t-0 md:border-l
        `}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0e141a] flex items-center justify-between px-5 py-4 border-b border-[#3c4a40]/20 z-10">
          <p className="text-[16px] md:text-[18px] font-bold text-[#dde3ec] font-['Space_Grotesk']">
            {mode === "ml" ? "Understanding Your ML Score" : mode === "trend" ? "Understanding Conviction Trend" : "How SwingAI Scores Signals"}
          </p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#252b31] flex items-center justify-center hover:bg-[#2f353c] transition-colors"
          >
            <X size={13} className="text-[#bacbbd]" />
          </button>
        </div>

        {/* Content */}
        <div className="pl-5 pr-7 py-5 md:px-5 space-y-6 text-[#bacbbd]">
        {mode === "ml" ? <MlScoreContent mlScore={mlScore} mlRank={mlRank} /> : mode === "trend" ? <TrendContent convictionTrend={convictionTrend} /> : <>

          {/* Conviction Score */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Conviction Score (0–100)
            </h3>
            <div className="space-y-2.5">
              {[
                { label: "Technical strength", pts: "40 pts", desc: "RSI, moving averages, MACD, volume ratio" },
                { label: "R:R tightness", pts: "30 pts", desc: "Tighter stop loss = higher score" },
                { label: "Sector RS", pts: "15 pts", desc: "Outperforming its sector ETF over 20 days?" },
                { label: "Data quality", pts: "15 pts", desc: "Validation checks all pass = full points" },
              ].map(({ label, pts, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-[12px] md:text-[14px] font-bold text-[#43ed9e] bg-[#43ed9e]/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5 w-16 text-center">
                    {pts}
                  </span>
                  <div>
                    <p className="text-[14px] md:text-[16px] font-medium text-[#dde3ec]">{label}</p>
                    <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Signal Tiers — 5-tier system */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Signal Tiers (5-tier)
            </h3>
            <div className="space-y-2">
              {[
                {
                  range: "> 82",
                  label: "High Conviction",
                  color: "text-[#43ed9e]",
                  bg: "bg-[#43ed9e]/10",
                  desc: "Composite score above 82 AND all 5 hard gates pass. Clear to enter full position.",
                },
                {
                  range: "70–82",
                  label: "Tactical Buy",
                  color: "text-[#adc6ff]",
                  bg: "bg-[#adc6ff]/10",
                  desc: "Score ≥70, OR score >82 with at least one hard gate not met. Strong setup with a specific reason holding it back from High Conviction.",
                },
                {
                  range: "any",
                  label: "Watch — Extended",
                  color: "text-[#ffb33c]",
                  bg: "bg-[#ffb33c]/10",
                  desc: "This stock has moved too far, too fast. Buying now means chasing — the price is stretched above its normal range, like a rubber band pulled tight. Wait for it to pull back to the 8-day moving average before entering. The setup is valid; the timing is not.",
                },
                {
                  range: "any",
                  label: "Observe",
                  color: "text-[#c8a84b]",
                  bg: "bg-[#c8a84b]/10",
                  desc: "Weakening thesis: target above 52w high, sector ETF below MA20, or 3-day RS lag vs SPY. Hold, do not add.",
                },
                {
                  range: "any",
                  label: "Exit",
                  color: "text-[#ffb3ae]",
                  bg: "bg-[#ffb3ae]/10",
                  desc: "Price below 8-EMA AND RS vs SPY negative 3 days running. Reduce or close position.",
                },
              ].map(({ range, label, color, bg, desc }) => (
                <div key={label} className={`rounded-lg p-3 ${bg}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[12px] md:text-[14px] font-bold ${color}`}>{range}</span>
                    <span className={`text-[12px] md:text-[14px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                  </div>
                  <p className="text-[12px] md:text-[14px] text-[#bacbbd]/70">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Hard Gates */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              The 5 Hard Gates
            </h3>
            <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mb-3 leading-relaxed">
              High Conviction requires <span className="text-[#dde3ec] font-medium">all five gates to pass</span>. If even one gate fires, the signal drops to Tactical Buy regardless of score.
            </p>
            <div className="space-y-2.5">
              {[
                { label: "RSI Overheated", desc: "RSI 14 above 78 — momentum stretched, entry risk of immediate pullback." },
                { label: "BB Extended", desc: "Bollinger Band %B above 90% — price hugging upper band, mean reversion likely." },
                { label: "Target Blocked", desc: "3:1 reward target sits above the 52-week high. Path requires breaking major resistance." },
                { label: "Sector Weak", desc: "Sector ETF closes below its 20-day moving average. Industry tide is against the trade." },
                { label: "Vol-Price Unconfirmed", desc: "Volume <1.5× average OR daily range <1.2× recent. Move lacks institutional conviction." },
              ].map(({ label, desc }) => (
                <div key={label} className="flex items-start gap-3">
                  <span className="text-[14px] shrink-0 mt-0.5">🚧</span>
                  <div>
                    <p className="text-[14px] md:text-[15px] font-medium text-[#dde3ec]">{label}</p>
                    <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Vol-Price Confirmation */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Vol-Price Confirmation
            </h3>
            <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 leading-relaxed">
              A real breakout shows up on the tape: today&apos;s volume is at least <span className="text-[#dde3ec] font-medium">1.5× the recent average</span> AND today&apos;s high-low range is at least <span className="text-[#dde3ec] font-medium">1.2× the 5-day average range</span>. Without both, the price move is suspect — likely thin trading or noise.
            </p>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Sector ETF MA20 Gate */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Sector ETF MA20 Gate
            </h3>
            <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 leading-relaxed">
              We map every signal to its sector ETF (e.g. XLK for tech, XLF for financials). If that ETF closes <span className="text-[#dde3ec] font-medium">below its 20-day moving average</span>, the entire industry is in a short-term downtrend — even a strong individual setup faces sector headwinds. Wait for the sector to recover above MA20 before sizing up.
            </p>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* BB %B */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              BB %B (Bollinger Band %)
            </h3>
            <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mb-3">
              Shows where price sits inside its normal trading range (upper and lower Bollinger Bands).
            </p>
            <div className="space-y-2">
              {[
                { range: "> 80%", color: "text-yellow-400", dot: "bg-yellow-400", label: "Extended", desc: "Near the upper band — price has moved fast. Momentum may slow." },
                { range: "20–80%", color: "text-[#dde3ec]", dot: "bg-[#dde3ec]", label: "Neutral", desc: "Mid-band — price is within its normal range." },
                { range: "< 20%", color: "text-[#43ed9e]", dot: "bg-[#43ed9e]", label: "Oversold", desc: "Near the lower band — potential bounce zone." },
              ].map(({ range, color, dot, label, desc }) => (
                <div key={range} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0 mt-1`} />
                  <div>
                    <p className="text-[12px] md:text-[14px]">
                      <span className={`font-bold ${color}`}>{range} — {label}</span>
                    </p>
                    <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Target Price */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Target Price
            </h3>
            <div className="rounded-lg bg-[#161c22] p-3 space-y-2 font-mono text-[13px] md:text-[15px] break-words">
              <p className="text-[#dde3ec]">Target = Entry + 3 × (Entry − Stop)</p>
              <p className="text-[#bacbbd]/60">3:1 reward-to-risk ratio</p>
            </div>
            <p className="text-[12px] md:text-[14px] text-[#bacbbd]/60 mt-2.5 leading-relaxed">
              <span className="text-[#dde3ec] font-medium">"To target %"</span> shows how far the current live price is from the target, as a percentage of your entry price. A high percentage means the stock is far from the target — either because it has not moved yet, or it moved against you.
            </p>
          </section>

          <div className="pb-safe" />
        </>}
        </div>
      </div>
    </>
  );
}
