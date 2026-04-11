"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface FAQModalProps {
  open: boolean;
  onClose: () => void;
  mode?: "conviction" | "ml";
  mlScore?: number | null;
  mlRank?: number | null;
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

export default function FAQModal({ open, onClose, mode = "conviction", mlScore, mlRank }: FAQModalProps) {
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
            {mode === "ml" ? "Understanding Your ML Score" : "How SwingAI Scores Signals"}
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
        {mode === "ml" ? <MlScoreContent mlScore={mlScore} mlRank={mlRank} /> : <>

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

          {/* Signal Tiers */}
          <section>
            <h3 className="text-[12px] md:text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Signal Tiers
            </h3>
            <div className="space-y-2">
              {[
                {
                  range: "90–100",
                  label: "Top Pick · Strong Buy",
                  color: "text-[#43ed9e]",
                  bg: "bg-[#43ed9e]/10",
                  desc: "All technical, R:R, and sector filters aligned. Highest-grade setup.",
                },
                {
                  range: "70–89",
                  label: "Buy",
                  color: "text-[#00d084]",
                  bg: "bg-[#00d084]/10",
                  desc: "Core criteria met. Proceed with standard position sizing.",
                },
                {
                  range: "< 70",
                  label: "Watch",
                  color: "text-[#bacbbd]",
                  bg: "bg-[#bacbbd]/10",
                  desc: "Below trade threshold. Monitor but do not enter yet.",
                },
              ].map(({ range, label, color, bg, desc }) => (
                <div key={range} className={`rounded-lg p-3 ${bg}`}>
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
