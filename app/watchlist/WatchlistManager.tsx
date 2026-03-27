"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WatchlistItem } from "@/lib/supabase";
import { Strategy } from "@/lib/watchlist";

const STRATEGY_OPTIONS: Strategy[] = ["momentum", "mean_reversion", "etf_rotation"];

const strategyLabel: Record<Strategy, string> = {
  momentum: "Momentum",
  mean_reversion: "Mean Reversion",
  etf_rotation: "ETF Rotation",
};

const strategyColor: Record<Strategy, string> = {
  momentum: "bg-blue-900/40 text-blue-300 border-blue-800",
  mean_reversion: "bg-purple-900/40 text-purple-300 border-purple-800",
  etf_rotation: "bg-teal-900/40 text-teal-300 border-teal-800",
};

export default function WatchlistManager({ initial }: { initial: WatchlistItem[] }) {
  const [items, setItems] = useState<WatchlistItem[]>(initial);
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [strategy, setStrategy] = useState<Strategy>("momentum");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const t = ticker.trim().toUpperCase();
    const n = name.trim();
    if (!t) { setError("Ticker symbol is required."); return; }
    setTicker(t);
    if (items.length >= 100) { setError("Watchlist is at the 100 ticker limit."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: t, name: n, strategy }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to add ticker."); return; }
      setItems((prev) => [...prev, json.item]);
      setTicker("");
      setName("");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (t: string) => {
    setRemoving(t);
    try {
      const res = await fetch(`/api/watchlist?ticker=${t}`, { method: "DELETE" });
      if (res.ok) setItems((prev) => prev.filter((i) => i.ticker !== t));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Manage Watchlist</h1>
          <p className="text-gray-400 text-sm">{items.length}/100 tickers</p>
        </div>
      </div>

      {/* Add ticker form */}
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Add Ticker</h2>
          <form onSubmit={handleAdd} className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Ticker (e.g. aapl)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white w-36"
                maxLength={10}
              />
              <Input
                placeholder="Company name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white flex-1"
              />
            </div>
            <div className="flex gap-2 items-center">
              <div className="flex gap-1">
                {STRATEGY_OPTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStrategy(s)}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      strategy === s
                        ? strategyColor[s]
                        : "border-gray-700 text-gray-500 hover:border-gray-500"
                    }`}
                  >
                    {strategyLabel[s]}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                disabled={loading || items.length >= 100}
                className="ml-auto flex items-center gap-1.5 bg-white text-black text-xs font-semibold px-3 py-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-xs">
                <AlertCircle size={12} />
                {error}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Ticker list */}
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.ticker}
            className="flex items-center justify-between bg-gray-900 border border-gray-800 rounded-lg px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span className="font-bold text-white w-16">{item.ticker}</span>
              <span className="text-gray-400 text-sm">{item.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs border ${strategyColor[item.strategy as Strategy]}`}>
                {strategyLabel[item.strategy as Strategy]}
              </Badge>
              <button
                onClick={() => handleRemove(item.ticker)}
                disabled={removing === item.ticker}
                className="text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30 ml-2"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
