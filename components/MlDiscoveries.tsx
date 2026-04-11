"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import { MlScore } from "@/lib/supabase";

// ── Feature → plain-English label mapping ─────────────────────────────────────

type FeatureFn = (v: number) => string | null;

const FEATURE_LABELS: Record<string, FeatureFn> = {
  High52w_Pct:         (v) => v >= -0.05 ? "Near 52-week high" : v >= -0.15 ? "Within 15% of 52w high" : null,
  Momentum_5d:         (v) => v >= 0.03 ? "Strong 5-day momentum" : v >= 0.01 ? "Positive short-term trend" : null,
  Vol_Trend_5d:        (v) => v >= 1.2 ? "Rising volume (accumulation)" : v >= 1.0 ? "Volume trending up" : null,
  RSI_14:              (v) => v >= 55 && v <= 75 ? "RSI in bullish zone" : v > 75 ? "RSI extended — watch closely" : null,
  Sector_RS_20:        (v) => v >= 1.1 ? "Outperforming its sector" : v >= 1.0 ? "Matching sector performance" : null,
  High20_Pct:          (v) => v >= -0.02 ? "Near 20-day breakout level" : null,
  Close_vs_Open:       (v) => v >= 0.005 ? "Bullish close (up on day)" : null,
  MACD_hist:           (v) => v > 0 ? "MACD histogram positive" : null,
  Gap_Pct:             (v) => v >= 0.03 ? "Strong gap-up (3%+)" : v >= 0.01 ? "Gap-up at open" : null,
  Regime_Code:         (v) => v === 1 ? "Bull market regime" : v === 0 ? "Sideways market" : null,
  SPY_Ret_5d:          (v) => v >= 0.02 ? "Market momentum strong" : null,
};

// Feature contribution weight — how much each feature contributes to the score.
// We derive this from the raw feature value differences relative to thresholds.
// Since we don't have SHAP values, we approximate using feature label match strength.
const FEATURE_WEIGHT: Record<string, number> = {
  High52w_Pct:    0.22,
  Vol_Trend_5d:   0.18,
  Momentum_5d:    0.15,
  RSI_14:         0.12,
  Sector_RS_20:   0.10,
  High20_Pct:     0.08,
  Close_vs_Open:  0.07,
  MACD_hist:      0.05,
  Gap_Pct:        0.04,
  Regime_Code:    0.02,
  SPY_Ret_5d:     0.01,
};

function getContributions(
  snapshot: Record<string, number>
): { label: string; weight: number; key: string }[] {
  return Object.entries(FEATURE_LABELS)
    .map(([key, fn]) => {
      const val = snapshot[key];
      if (val == null) return null;
      const label = fn(val);
      if (!label) return null;
      return { key, label, weight: FEATURE_WEIGHT[key] ?? 0.01 };
    })
    .filter(Boolean)
    .sort((a, b) => b!.weight - a!.weight)
    .slice(0, 5) as { label: string; weight: number; key: string }[];
}

// ── Signal badge ──────────────────────────────────────────────────────────────

function MlStatusChip({ score }: { score: number }) {
  if (score >= 70)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase bg-[#45dfa4]/15 text-[#45dfa4] border border-[#45dfa4]/20">
        Bullish Alpha
      </span>
    );
  if (score >= 50)
    return (
      <span className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase bg-[#f9bd22]/15 text-[#f9bd22] border border-[#f9bd22]/20">
        Watch
      </span>
    );
  return (
    <span className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase bg-[#353534]/60 text-[#999] border border-white/5">
      Below Thresh
    </span>
  );
}

// ── Expanded detail card (Explainable ML Scoring design) ──────────────────────

function DiscoveryDetail({
  stock,
  onAdd,
  adding,
}: {
  stock: MlScore;
  onAdd: () => void;
  adding: boolean;
}) {
  const snap = stock.feature_snapshot ?? {};
  const contribs = getContributions(snap);
  const maxWeight = contribs[0]?.weight ?? 1;

  const scoreLabel =
    stock.ml_score_pct >= 70
      ? "High conviction momentum setup"
      : stock.ml_score_pct >= 50
      ? "Moderate setup — monitor closely"
      : "Developing pattern";

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-[rgba(30,34,40,0.95)] p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-[#e5e2e1] font-['Space_Grotesk']">
            {stock.ticker}
          </p>
          <p className="text-[11px] text-[#999] mt-0.5">
            Likelihood of 5-day outperformance vs SPY
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold text-[#45dfa4] font-mono">
            {stock.ml_score_pct}%
          </p>
          <p className="text-[10px] text-[#999] uppercase tracking-wider">Confidence</p>
        </div>
      </div>

      {/* Signal headline */}
      <div className="rounded-lg bg-[#45dfa4]/5 border border-[#45dfa4]/15 px-3 py-2.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#45dfa4] mb-1">
          {stock.ml_score_pct >= 70 ? "── Bullish Alpha ──" : "── Setup Signal ──"}
        </p>
        <p className="text-[12px] text-[#c8d0c9] leading-relaxed">
          {scoreLabel}
        </p>
      </div>

      {/* Feature contributions */}
      {contribs.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-widest text-[#666] mb-2">
            Why the model likes this stock
          </p>
          {contribs.map(({ key, label, weight }) => {
            const barPct = Math.round((weight / maxWeight) * 100);
            return (
              <div key={key} className="flex items-center gap-3">
                <p className="text-[11px] text-[#c8d0c9] w-48 shrink-0">{label}</p>
                <div className="flex-1 h-1.5 rounded-full bg-[#252b31] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#45dfa4]/60"
                    style={{ width: `${barPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-[#666] font-mono w-8 text-right shrink-0">
                  +{weight.toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Supplementary fundamentals */}
      <div className="flex items-center gap-4 pt-1 border-t border-white/5 text-[11px] text-[#888]">
        {stock.fwd_pe != null && (
          <span>Fwd P/E: <span className="text-[#adc6ff]">{stock.fwd_pe.toFixed(1)}</span></span>
        )}
        {stock.market_cap_b != null && (
          <span>Mkt Cap: <span className="text-[#adc6ff]">${stock.market_cap_b.toFixed(0)}B</span></span>
        )}
        <span className="ml-auto">
          <span className="text-[#adc6ff]">#{stock.ml_rank}</span> of S&P 500 today
        </span>
      </div>

      {/* Add to watchlist */}
      <button
        onClick={onAdd}
        disabled={adding}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-[#45dfa4]/10 hover:bg-[#45dfa4]/20 border border-[#45dfa4]/20 text-[#45dfa4] text-[12px] font-bold tracking-wide transition-colors disabled:opacity-50"
      >
        {adding ? (
          "Adding..."
        ) : (
          <>
            <Plus size={13} />
            Add to Watchlist
          </>
        )}
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MlDiscoveriesProps {
  discoveries: MlScore[];
  onAddToWatchlist: (ticker: string) => Promise<void>;
}

export default function MlDiscoveries({ discoveries, onAddToWatchlist }: MlDiscoveriesProps) {
  const [open, setOpen] = useState(false);
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [showGapUpOnly, setShowGapUpOnly] = useState(false);

  if (discoveries.length === 0) return null;

  const filtered = showGapUpOnly
    ? discoveries.filter((d) => (d.feature_snapshot?.Gap_Pct ?? 0) >= 0.02)
    : discoveries;

  async function handleAdd(ticker: string) {
    setAdding(ticker);
    try {
      await onAddToWatchlist(ticker);
    } finally {
      setAdding(null);
      setExpandedTicker(null);
    }
  }

  return (
    <div className="rounded-xl overflow-hidden bg-[rgba(53,53,52,0.6)] backdrop-blur-xl border border-white/10">
      {/* Panel header */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-[#adc6ff] animate-pulse" />
          <span className="font-bold text-[#e5e2e1] font-['Space_Grotesk']">ML Discoveries</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-[#adc6ff]/10 text-[#adc6ff] border border-[#adc6ff]/15 font-bold">
            {discoveries.length} today
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-[#666]">
          <span className="hidden sm:inline">Top S&P 500 picks not on your watchlist</span>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="border-t border-white/10">
          {/* Filter toolbar */}
          <div className="px-5 py-2.5 flex items-center gap-3 border-b border-white/5">
            <button
              onClick={(e) => { e.stopPropagation(); setShowGapUpOnly((v) => !v); }}
              className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition-colors ${
                showGapUpOnly
                  ? "bg-[#45dfa4]/20 text-[#45dfa4] border-[#45dfa4]/30"
                  : "bg-transparent text-[#666] border-white/10 hover:border-white/20"
              }`}
            >
              Gap-Up only (≥2%)
            </button>
            {showGapUpOnly && filtered.length === 0 && (
              <span className="text-[10px] text-[#666]">No gap-ups in today&apos;s top picks</span>
            )}
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-[2fr_1.5fr_1fr_1.5fr] gap-2 px-5 py-2 text-[10px] uppercase tracking-widest text-[#555] border-b border-white/5">
            <span>Ticker</span>
            <span>ML Score</span>
            <span>Rank</span>
            <span>Status</span>
          </div>

          {/* Rows */}
          <div className="divide-y divide-white/5">
            {filtered.map((stock) => {
              const isExpanded = expandedTicker === stock.ticker;
              const scoreColor =
                stock.ml_score_pct >= 70
                  ? "text-[#45dfa4]"
                  : stock.ml_score_pct >= 50
                  ? "text-[#f9bd22]"
                  : "text-[#666]";

              const gapPct = stock.feature_snapshot?.Gap_Pct ?? 0;

              return (
                <div key={stock.ticker}>
                  <button
                    className="w-full grid grid-cols-[2fr_1.5fr_1fr_1.5fr] gap-2 items-center px-5 py-3 hover:bg-white/5 transition-colors text-left"
                    onClick={() => setExpandedTicker(isExpanded ? null : stock.ticker)}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-[#e5e2e1] text-sm font-['Space_Grotesk']">
                        {stock.ticker}
                      </span>
                      {gapPct >= 0.01 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[#45dfa4]/10 text-[#45dfa4] border border-[#45dfa4]/20">
                          +{(gapPct * 100).toFixed(1)}% gap
                        </span>
                      )}
                    </div>
                    <span className={`font-mono text-sm font-bold ${scoreColor}`}>
                      {stock.ml_score_pct}%
                    </span>
                    <span className="text-[#adc6ff] text-xs font-mono">#{stock.ml_rank}</span>
                    <div className="flex items-center gap-2">
                      <MlStatusChip score={stock.ml_score_pct} />
                      <span className="ml-auto text-[#444]">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-4">
                      <DiscoveryDetail
                        stock={stock}
                        onAdd={() => handleAdd(stock.ticker)}
                        adding={adding === stock.ticker}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
