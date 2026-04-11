"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, AlertCircle, ChevronDown, ChevronUp, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Trade } from "@/lib/supabase";
import { Strategy } from "@/lib/watchlist";

const STRATEGY_OPTIONS: Strategy[] = ["momentum", "ema_pullback", "mean_reversion", "etf_rotation"];
const strategyLabel: Record<Strategy, string> = {
  momentum: "Momentum",
  mean_reversion: "Mean Reversion",
  etf_rotation: "ETF Rotation",
  ema_pullback: "8 EMA Pullback",
};
const strategyColor: Record<Strategy, string> = {
  momentum: "bg-blue-900/40 text-blue-300 border-blue-800",
  mean_reversion: "bg-purple-900/40 text-purple-300 border-purple-800",
  etf_rotation: "bg-teal-900/40 text-teal-300 border-teal-800",
  ema_pullback: "bg-cyan-900/40 text-cyan-300 border-cyan-800",
};

function today() {
  return new Date().toISOString().split("T")[0];
}

function daysBetween(d1: string, d2: string) {
  return Math.floor((new Date(d2).getTime() - new Date(d1).getTime()) / 86_400_000);
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── Performance Summary ─────────────────────────────────────────────────────

function PerformanceSummary({ closed }: { closed: Trade[] }) {
  const [open, setOpen] = useState(false);
  if (closed.length === 0) return null;

  const wins = closed.filter((t) => t.exit_price! > t.entry_price);
  const losses = closed.filter((t) => t.exit_price! <= t.entry_price);
  const winRate = Math.round((wins.length / closed.length) * 100);
  const totalPnL = closed.reduce((s, t) => s + (t.exit_price! - t.entry_price) * t.shares, 0);

  const rTrades = closed.filter((t) => t.stop_price && t.entry_price > t.stop_price);
  const avgR = rTrades.length > 0
    ? rTrades.reduce((s, t) => s + (t.exit_price! - t.entry_price) / (t.entry_price - t.stop_price!), 0) / rTrades.length
    : null;

  const pnls = closed.map((t) => (t.exit_price! - t.entry_price) * t.shares);
  const bestPnL = Math.max(...pnls);
  const worstPnL = Math.min(...pnls);

  // Win streak
  let streak = 0, maxStreak = 0, cur = 0;
  for (const t of closed) {
    if (t.exit_price! > t.entry_price) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
  }
  streak = maxStreak;

  // Strategy breakdown
  const strategies = [...new Set(closed.map((t) => t.strategy))];
  const breakdown = strategies.map((s) => {
    const group = closed.filter((t) => t.strategy === s);
    const gWins = group.filter((t) => t.exit_price! > t.entry_price).length;
    const gPnL = group.reduce((sum, t) => sum + (t.exit_price! - t.entry_price) * t.shares, 0);
    return { strategy: s, count: group.length, winRate: Math.round((gWins / group.length) * 100), avgPnL: gPnL / group.length };
  });

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "var(--surface-container)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:brightness-110 transition-all"
      >
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--on-surface-variant)" }}>
          Performance Summary
        </span>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold font-mono ${totalPnL >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}`}>
            {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)}
          </span>
          {open ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 border-t border-[#3c4a40]/20">
          {/* Top stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {[
              { label: "Win Rate", value: `${winRate}%`, color: winRate >= 50 ? "text-[#43ed9e]" : "text-[#ffb3ae]" },
              { label: "Avg R-Multiple", value: avgR !== null ? `${avgR >= 0 ? "+" : ""}${avgR.toFixed(2)}R` : "—", color: avgR !== null && avgR >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]" },
              { label: "Best Trade", value: `+$${bestPnL.toFixed(2)}`, color: "text-[#43ed9e]" },
              { label: "Worst Trade", value: `$${worstPnL.toFixed(2)}`, color: "text-[#ffb3ae]" },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg p-2.5 text-center bg-[#0e141a]">
                <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-1">{label}</p>
                <p className={`font-bold text-sm font-mono ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Win streak */}
          {streak > 1 && (
            <div className="flex items-center gap-2 text-xs text-[#bacbbd]">
              <TrendingUp size={13} className="text-[#43ed9e]" />
              Best win streak: <span className="font-bold text-[#43ed9e]">{streak} in a row</span>
            </div>
          )}
          {losses.length > 1 && streak === 0 && (
            <div className="flex items-center gap-2 text-xs text-[#bacbbd]">
              <TrendingDown size={13} className="text-[#ffb3ae]" />
              <span className="text-[#ffb3ae]">{losses.length} consecutive losses — consider reducing size</span>
            </div>
          )}

          {/* Strategy breakdown */}
          {breakdown.length > 1 && (
            <div>
              <p className="text-[10px] text-[#bacbbd] uppercase tracking-wider mb-2">By Strategy</p>
              <div className="space-y-1.5">
                {breakdown.sort((a, b) => b.avgPnL - a.avgPnL).map(({ strategy, count, winRate: wr, avgPnL }) => (
                  <div key={strategy} className="flex items-center justify-between text-xs rounded-lg px-3 py-2 bg-[#0e141a]">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${strategyColor[strategy as Strategy] ?? "bg-gray-800 text-gray-400 border-gray-700"}`}>
                      {strategyLabel[strategy as Strategy] ?? strategy}
                    </span>
                    <span className="text-[#bacbbd]">{count} trade{count !== 1 ? "s" : ""}</span>
                    <span className={wr >= 50 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}>{wr}% win</span>
                    <span className={`font-mono font-bold ${avgPnL >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}`}>
                      {avgPnL >= 0 ? "+" : ""}${avgPnL.toFixed(0)} avg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── JournalManager ───────────────────────────────────────────────────────────

export default function JournalManager({ initial }: { initial: Trade[] }) {
  const [trades, setTrades] = useState<Trade[]>(initial);

  // Add form state
  const [ticker, setTicker] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [shares, setShares] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [strategy, setStrategy] = useState<Strategy>("momentum");
  const [notes, setNotes] = useState("");
  const [addError, setAddError] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Close form state per trade id
  const [closingId, setClosingId] = useState<string | null>(null);
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState(today());
  const [closeError, setCloseError] = useState("");
  const [closeLoading, setCloseLoading] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Live prices for open positions
  const [livePrices, setLivePrices] = useState<Record<string, { price: number; prevClose: number; open: number } | null>>({});
  const [liveLoading, setLiveLoading] = useState(false);
  const [targetFormulaId, setTargetFormulaId] = useState<string | null>(null);

  const open = trades.filter((t) => !t.exit_date);
  const closed = trades.filter((t) => t.exit_date);

  const fetchLivePrices = async (positions: typeof open) => {
    const tickers = [...new Set(positions.map((t) => t.ticker))];
    if (tickers.length === 0) return;
    setLiveLoading(true);
    try {
      const res = await fetch(`/api/current-prices?tickers=${tickers.join(",")}`);
      if (res.ok) setLivePrices(await res.json());
    } finally {
      setLiveLoading(false);
    }
  };

  useEffect(() => {
    if (open.length > 0) fetchLivePrices(open);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades]);
  const totalPnL = closed.reduce((sum, t) => {
    return sum + (t.exit_price! - t.entry_price) * t.shares;
  }, 0);
  const wins = closed.filter((t) => t.exit_price! > t.entry_price).length;
  const winRate = closed.length > 0 ? Math.round((wins / closed.length) * 100) : null;

  const handleAdd = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setAddError("");
    const t = ticker.trim().toUpperCase();
    const ep = parseFloat(entryPrice);
    const sp = stopPrice ? parseFloat(stopPrice) : null;
    const sh = parseInt(shares);
    if (!t) { setAddError("Ticker is required."); return; }
    if (!(ep > 0)) { setAddError("Entry price must be greater than 0."); return; }
    if (!(sh > 0)) { setAddError("Shares must be a positive integer."); return; }
    if (sp !== null && sp >= ep) { setAddError("Stop price must be below entry price."); return; }

    setAddLoading(true);
    try {
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker: t, entry_price: ep, stop_price: sp, exit_price: null,
          shares: sh, entry_date: entryDate, exit_date: null,
          strategy, notes: notes.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setAddError(json.error ?? "Failed to add trade."); return; }
      setTrades((prev) => [json.trade, ...prev]);
      setTicker(""); setEntryPrice(""); setStopPrice(""); setShares("");
      setEntryDate(today()); setNotes("");
    } finally {
      setAddLoading(false);
    }
  };

  const handleClose = async (id: string) => {
    setCloseError("");
    const ep = parseFloat(exitPrice);
    if (!(ep > 0)) { setCloseError("Exit price must be greater than 0."); return; }
    setCloseLoading(true);
    try {
      const res = await fetch(`/api/trades/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exit_price: ep, exit_date: exitDate }),
      });
      if (res.ok) {
        setTrades((prev) => prev.map((t) =>
          t.id === id ? { ...t, exit_price: ep, exit_date: exitDate } : t
        ));
        setClosingId(null); setExitPrice(""); setExitDate(today());
      }
    } finally {
      setCloseLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/trades/${id}`, { method: "DELETE" });
      if (res.ok) setTrades((prev) => prev.filter((t) => t.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <main className="min-h-screen" style={{ backgroundColor: "var(--surface)", color: "var(--on-surface)" }}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/" className="transition-colors hover:brightness-125" style={{ color: "var(--on-surface-variant)" }}>
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}
            >
              Trade Journal
            </h1>
            <p className="text-sm" style={{ color: "var(--on-surface-variant)" }}>
              {open.length} open
              {closed.length > 0 && (
                <>
                  {" · "}
                  <span className={totalPnL >= 0 ? "text-green-400" : "text-red-400"}>
                    {totalPnL >= 0 ? "+" : ""}${totalPnL.toFixed(2)} P&L
                  </span>
                  {winRate !== null && ` · ${winRate}% win rate`}
                </>
              )}
            </p>
          </div>
        </div>

        {/* Performance Summary */}
        <PerformanceSummary closed={closed} />

        {/* Add Trade */}
        <Card className="border-0" style={{ backgroundColor: "var(--surface-container)" }}>
          <CardContent className="p-4">
            <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--on-surface-variant)" }}>Log a Trade</h2>
            <form onSubmit={handleAdd} className="space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Ticker"
                  value={ticker}
                  onChange={(e) => setTicker(e.target.value)}
                  className="border-0 text-[#dde3ec]" style={{ backgroundColor: "var(--surface-high)" } as React.CSSProperties}
                  maxLength={10}
                />
                <Input
                  type="number"
                  placeholder="Entry $"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="border-0 text-[#dde3ec]" style={{ backgroundColor: "var(--surface-high)" } as React.CSSProperties}
                  min="0.01"
                  step="0.01"
                />
                <Input
                  type="number"
                  placeholder="Shares"
                  value={shares}
                  onChange={(e) => setShares(e.target.value)}
                  className="border-0 text-[#dde3ec]" style={{ backgroundColor: "var(--surface-high)" } as React.CSSProperties}
                  min="1"
                  step="1"
                />
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="border-0 text-[#dde3ec]" style={{ backgroundColor: "var(--surface-high)" } as React.CSSProperties}
                />
              </div>
              <div className="flex gap-2 flex-wrap items-center">
                <div className="flex gap-1">
                  {STRATEGY_OPTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStrategy(s)}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${
                        strategy === s ? strategyColor[s] : "border-gray-700 text-gray-500 hover:border-gray-500"
                      }`}
                    >
                      {strategyLabel[s]}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  placeholder="Stop $ (optional)"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white w-36"
                  min="0.01"
                  step="0.01"
                />
              </div>
              <textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="w-full rounded-md px-3 py-2 text-sm focus:outline-none resize-none" style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface)" }}
              />
              <div className="flex items-center justify-between">
                {addError ? (
                  <div className="flex items-center gap-2 text-red-400 text-xs">
                    <AlertCircle size={12} />
                    {addError}
                  </div>
                ) : <span />}
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded transition-colors disabled:opacity-50" style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
                >
                  <Plus size={14} />
                  Log Trade
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Open Positions */}
        {open.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--on-surface-variant)", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}>
                Open Positions ({open.length})
              </h2>
              <button
                onClick={() => fetchLivePrices(open)}
                disabled={liveLoading}
                className="flex items-center gap-1 text-xs transition-colors disabled:opacity-40"
                style={{ color: "var(--on-surface-variant)" }}
                title="Refresh live prices"
              >
                <RefreshCw size={11} className={liveLoading ? "animate-spin" : ""} />
                Live
              </button>
            </div>
            {open.map((trade) => {
              const days = daysBetween(trade.entry_date, today());
              const isClosing = closingId === trade.id;
              const liveData = livePrices[trade.ticker] ?? null;
              const livePrice = liveData?.price ?? null;
              const livePrevClose = liveData?.prevClose ?? null;
              const liveOpen = liveData?.open ?? null;

              // Position monitor calculations
              const unrealizedPnL = livePrice !== null ? (livePrice - trade.entry_price) * trade.shares : null;
              const unrealizedPct = livePrice !== null ? ((livePrice - trade.entry_price) / trade.entry_price) * 100 : null;
              const target = trade.stop_price && trade.stop_price < trade.entry_price
                ? trade.entry_price + 3 * (trade.entry_price - trade.stop_price)
                : null;
              const stopBuffer = livePrice !== null && trade.stop_price
                ? ((livePrice - trade.stop_price) / trade.entry_price) * 100
                : null;
              const targetBuffer = livePrice !== null && target
                ? ((target - livePrice) / trade.entry_price) * 100
                : null;

              // Status badge
              let statusLabel = "";
              let statusStyle = "";
              if (livePrice !== null) {
                if (trade.stop_price && livePrice <= trade.stop_price) {
                  statusLabel = "Stopped Out"; statusStyle = "bg-red-900/60 text-red-300 border-red-700";
                } else if (stopBuffer !== null && stopBuffer < 5) {
                  statusLabel = "Near Stop"; statusStyle = "bg-orange-900/60 text-orange-300 border-orange-700";
                } else if (targetBuffer !== null && targetBuffer < 5) {
                  statusLabel = "Near Target"; statusStyle = "bg-green-900/60 text-green-300 border-green-700";
                } else if (unrealizedPct !== null && unrealizedPct < 0) {
                  statusLabel = "Review"; statusStyle = "bg-yellow-900/60 text-yellow-300 border-yellow-700";
                } else if (unrealizedPct !== null && unrealizedPct >= 0) {
                  statusLabel = "On Track"; statusStyle = "bg-[#1a2e1e] text-[#43ed9e] border-[#2d4a32]";
                }
              }

              return (
                <Card key={trade.id} className="border-0" style={{ backgroundColor: "var(--surface-container)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-lg">{trade.ticker}</span>
                          <Badge className={`text-xs border ${strategyColor[trade.strategy as Strategy]}`}>
                            {strategyLabel[trade.strategy as Strategy]}
                          </Badge>
                          {statusLabel && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${statusStyle}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {trade.shares.toLocaleString()} shares · Entry ${trade.entry_price.toFixed(2)}
                          {trade.stop_price && (
                            <span className="text-red-400"> · Stop ${trade.stop_price.toFixed(2)}</span>
                          )}
                        </div>

                        {/* Live P&L monitor */}
                        {livePrice !== null && (
                          <div className="mt-2 flex flex-wrap gap-3 rounded-lg px-3 py-2 bg-[#0e141a]">
                            <div className="text-xs">
                              <span className="text-gray-500">Live </span>
                              <span className="font-mono font-semibold text-white">${livePrice.toFixed(2)}</span>
                            </div>
                            <div className="text-xs">
                              <span className="text-gray-500">P&L </span>
                              <span className={`font-mono font-semibold ${(unrealizedPnL ?? 0) >= 0 ? "text-[#43ed9e]" : "text-[#ffb3ae]"}`}>
                                {(unrealizedPnL ?? 0) >= 0 ? "+" : ""}${unrealizedPnL!.toFixed(2)}
                                <span className="font-normal ml-1 opacity-70">({unrealizedPct! >= 0 ? "+" : ""}{unrealizedPct!.toFixed(2)}%)</span>
                              </span>
                            </div>
                            {stopBuffer !== null && (
                              <div className="text-xs">
                                <span className="text-gray-500">Stop buffer </span>
                                <span className={`font-mono font-semibold ${stopBuffer < 5 ? "text-[#ffb3ae]" : "text-gray-300"}`}>
                                  {stopBuffer.toFixed(1)}%
                                </span>
                              </div>
                            )}
                            {targetBuffer !== null && target !== null && (
                              <div className="text-xs">
                                <button
                                  type="button"
                                  onClick={() => setTargetFormulaId(targetFormulaId === trade.id ? null : trade.id!)}
                                  className="flex items-center gap-1 group"
                                >
                                  <span className="text-gray-500">To target </span>
                                  <span className="font-mono font-semibold text-[#43ed9e]">
                                    {targetBuffer.toFixed(1)}% (${target.toFixed(2)})
                                  </span>
                                  <span className="text-gray-600 group-hover:text-gray-400 transition-colors ml-0.5">
                                    {targetFormulaId === trade.id ? "▴" : "▾"}
                                  </span>
                                </button>
                                {targetFormulaId === trade.id && (
                                  <div className="mt-1.5 ml-0 rounded bg-[#161c22] px-2.5 py-2 text-[10px] text-gray-400 leading-relaxed space-y-1">
                                    <p><span className="text-white font-medium">Formula:</span> Target = Entry + 3 × (Entry − Stop)</p>
                                    <p><span className="text-white font-medium">% shown:</span> (Target − Live Price) ÷ Entry Price</p>
                                    <p className="text-gray-500">A high % means the stock is still far from its 3:1 reward target — either it has not moved yet, or it moved against you.</p>
                                  </div>
                                )}
                              </div>
                            )}
                            {(livePrevClose != null && livePrevClose > 0 || liveOpen != null && liveOpen > 0) && (
                              <div className="flex gap-4 text-xs w-full pt-1 border-t border-white/5">
                                {livePrevClose != null && livePrevClose > 0 && (
                                  <span className="text-gray-500">Prev close <span className="font-mono text-gray-300">${livePrevClose.toFixed(2)}</span></span>
                                )}
                                {liveOpen != null && liveOpen > 0 && (
                                  <span className="text-gray-500">Today open <span className="font-mono text-gray-300">${liveOpen.toFixed(2)}</span></span>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        <div className="text-xs text-gray-500 mt-1.5">
                          {formatDate(trade.entry_date)} · {days === 0 ? "today" : `${days}d held`}
                        </div>
                        {trade.notes && (
                          <div className="text-xs text-gray-500 mt-1 italic">{trade.notes}</div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          if (isClosing) { setClosingId(null); } else {
                            setClosingId(trade.id!); setExitPrice(""); setExitDate(today()); setCloseError("");
                          }
                        }}
                        className="text-xs rounded px-2 py-1 flex items-center gap-1 transition-colors shrink-0" style={{ backgroundColor: "var(--surface-high)", color: "var(--on-surface-variant)" }}
                      >
                        Close Trade
                        {isClosing ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                      </button>
                    </div>

                    {isClosing && (
                      <div className="mt-3 pt-3 border-t border-gray-800 flex flex-wrap items-end gap-2">
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Exit Price</label>
                          <Input
                            type="number"
                            placeholder="0.00"
                            value={exitPrice}
                            onChange={(e) => setExitPrice(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white w-28"
                            min="0.01"
                            step="0.01"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 block mb-1">Exit Date</label>
                          <Input
                            type="date"
                            value={exitDate}
                            onChange={(e) => setExitDate(e.target.value)}
                            className="border-0 text-[#dde3ec]" style={{ backgroundColor: "var(--surface-high)" } as React.CSSProperties}
                          />
                        </div>
                        <button
                          onClick={() => handleClose(trade.id!)}
                          disabled={closeLoading}
                          className="text-xs font-semibold px-3 py-2 rounded transition-colors disabled:opacity-50" style={{ backgroundColor: "var(--primary)", color: "var(--on-primary)" }}
                        >
                          Confirm Close
                        </button>
                        {closeError && (
                          <div className="w-full flex items-center gap-2 text-red-400 text-xs">
                            <AlertCircle size={12} />
                            {closeError}
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Closed Trades */}
        {closed.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--on-surface-variant)", fontFamily: "var(--font-space-grotesk, 'Space Grotesk', sans-serif)" }}>
              Closed Trades ({closed.length})
            </h2>
            {closed.map((trade) => {
              const pnl = (trade.exit_price! - trade.entry_price) * trade.shares;
              const pnlPct = ((trade.exit_price! - trade.entry_price) / trade.entry_price) * 100;
              const isWin = trade.exit_price! > trade.entry_price;
              const rMult = trade.stop_price
                ? (trade.exit_price! - trade.entry_price) / (trade.entry_price - trade.stop_price)
                : null;
              return (
                <Card key={trade.id} className="border-0" style={{ backgroundColor: "var(--surface-container)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-white text-lg">{trade.ticker}</span>
                          <Badge className={`text-xs border ${strategyColor[trade.strategy as Strategy]}`}>
                            {strategyLabel[trade.strategy as Strategy]}
                          </Badge>
                          <Badge className={`text-xs border ${isWin ? "bg-green-900/40 text-green-300 border-green-800" : "bg-red-900/40 text-red-300 border-red-800"}`}>
                            {isWin ? "✓ Win" : "✗ Loss"}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-400 mt-1">
                          {trade.shares.toLocaleString()} shares · ${trade.entry_price.toFixed(2)} → ${trade.exit_price!.toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDate(trade.entry_date)} → {formatDate(trade.exit_date!)}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className={`font-bold font-mono ${isWin ? "text-green-400" : "text-red-400"}`}>
                          {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                        </div>
                        <div className={`text-xs font-mono ${isWin ? "text-green-400" : "text-red-400"}`}>
                          {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%
                        </div>
                        {rMult !== null && (
                          <div className="text-xs text-gray-500 mt-0.5 font-mono">
                            {rMult >= 0 ? "+" : ""}{rMult.toFixed(2)}R
                          </div>
                        )}
                      </div>
                    </div>
                    {trade.notes && (
                      <div className="text-xs text-gray-500 mt-2 italic">{trade.notes}</div>
                    )}
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={() => handleDelete(trade.id!)}
                        disabled={deletingId === trade.id}
                        className="transition-colors disabled:opacity-30 hover:text-[#ffb3ae]" style={{ color: "var(--outline)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {trades.length === 0 && (
          <div className="text-center py-12 text-sm" style={{ color: "var(--outline)" }}>
            No trades logged yet. Add your first trade above.
          </div>
        )}
      </div>
    </main>
  );
}
