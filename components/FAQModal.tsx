"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface FAQModalProps {
  open: boolean;
  onClose: () => void;
}

export default function FAQModal({ open, onClose }: FAQModalProps) {
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
          <p className="text-[18px] font-bold text-[#dde3ec] font-['Space_Grotesk']">How SwingAI Scores Signals</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-[#252b31] flex items-center justify-center hover:bg-[#2f353c] transition-colors"
          >
            <X size={13} className="text-[#bacbbd]" />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-5 space-y-6 text-[#bacbbd]">

          {/* Conviction Score */}
          <section>
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
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
                  <span className="text-[14px] font-bold text-[#43ed9e] bg-[#43ed9e]/10 rounded px-1.5 py-0.5 shrink-0 mt-0.5 w-16 text-center">
                    {pts}
                  </span>
                  <div>
                    <p className="text-[16px] font-medium text-[#dde3ec]">{label}</p>
                    <p className="text-[14px] text-[#bacbbd]/60 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Signal Tiers */}
          <section>
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
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
                    <span className={`text-[14px] font-bold ${color}`}>{range}</span>
                    <span className={`text-[14px] font-bold uppercase tracking-wider ${color}`}>{label}</span>
                  </div>
                  <p className="text-[14px] text-[#bacbbd]/70">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* BB %B */}
          <section>
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              BB %B (Bollinger Band %)
            </h3>
            <p className="text-[14px] text-[#bacbbd]/60 mb-3">
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
                    <p className="text-[14px]">
                      <span className={`font-bold ${color}`}>{range} — {label}</span>
                    </p>
                    <p className="text-[14px] text-[#bacbbd]/60 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="border-t border-[#3c4a40]/20" />

          {/* Target Price */}
          <section>
            <h3 className="text-[14px] font-bold uppercase tracking-widest text-[#bacbbd]/50 mb-3">
              Target Price
            </h3>
            <div className="rounded-lg bg-[#161c22] p-3 space-y-2 font-mono text-[15px]">
              <p className="text-[#dde3ec]">Target = Entry + 3 × (Entry − Stop)</p>
              <p className="text-[#bacbbd]/60">3:1 reward-to-risk ratio</p>
            </div>
            <p className="text-[14px] text-[#bacbbd]/60 mt-2.5 leading-relaxed">
              <span className="text-[#dde3ec] font-medium">"To target %"</span> shows how far the current live price is from the target, as a percentage of your entry price. A high percentage means the stock is far from the target — either because it has not moved yet, or it moved against you.
            </p>
          </section>

          <div className="pb-safe" />
        </div>
      </div>
    </>
  );
}
